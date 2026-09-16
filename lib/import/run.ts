import { and, eq } from "drizzle-orm";

import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, shelfEntries, shelves, versions, works } from "@/lib/db/schema";
import { getGamesByIds } from "@/lib/igdb/games";
import { originalVersionName, primaryPlatformFor, releaseDateFor } from "@/lib/igdb/mapping";
import { igdbImageUrl } from "@/lib/igdb/types";
import { slugify } from "@/lib/slug";
import { ensureWorkFromIgdb, upsertPlatform } from "@/lib/works/ensure";

import { IMPORT_CHUNK, type ImportChunkResult } from "./constants";

export { IMPORT_CHUNK };
export type { ImportChunkResult };
import type { GrouveeItem } from "./grouvee";

/** Find or create one of this user's shelves, the same way tagging does. */
async function shelfIdFor(userId: string, name: string): Promise<string | null> {
  const slug = slugify(name);

  const find = async () =>
    (
      await db
        .select({ id: shelves.id })
        .from(shelves)
        .where(and(eq(shelves.userId, userId), eq(shelves.slug, slug)))
    )[0]?.id;

  const existing = await find();
  if (existing) return existing;

  const [created] = await db
    .insert(shelves)
    .values({ userId, name, slug })
    .onConflictDoNothing()
    .returning({ id: shelves.id });

  return created?.id ?? (await find()) ?? null;
}

/**
 * Imports one batch.
 *
 * The client drives the batching so it can show progress — a few hundred games
 * is a minute or two of cover downloads, and a single silent request would look
 * like a hang. Everything here is idempotent, so a batch that is retried or
 * run twice changes nothing the second time.
 */
export async function importItems(
  userId: string,
  items: GrouveeItem[],
): Promise<ImportChunkResult> {

  if (!Array.isArray(items) || items.length === 0) {
    return { added: 0, alreadyThere: 0, missing: [] };
  }
  if (items.length > IMPORT_CHUNK) {
    throw new Error(`At most ${IMPORT_CHUNK} at a time`);
  }

  // One request for the whole batch rather than one per game.
  const games = await getGamesByIds(items.map((item) => item.igdbId));
  const byId = new Map(games.map((game) => [game.id, game]));

  const result: ImportChunkResult = { added: 0, alreadyThere: 0, missing: [] };
  const artwork: { workId: string; imageId: string }[] = [];

  for (const item of items) {
    const game = byId.get(item.igdbId);
    if (!game) {
      // IGDB no longer has it, or the id predates a merge upstream.
      result.missing.push(item.name);
      continue;
    }

    const outcome = await db.transaction(async (tx) => {
      const platform = primaryPlatformFor(game);
      const platformId = await upsertPlatform(tx, platform);
      const work = await ensureWorkFromIgdb(tx, game, userId);

      let [version] = await tx
        .select({ id: versions.id })
        .from(versions)
        .where(and(eq(versions.workId, work.id), eq(versions.kind, "original")));

      if (!version) {
        [version] = await tx
          .insert(versions)
          .values({
            workId: work.id,
            name: originalVersionName(platform),
            kind: "original",
            platformId,
            releaseDate: releaseDateFor(game),
            igdbId: game.id,
            source: "igdb",
            createdBy: userId,
          })
          .returning({ id: versions.id });
      }

      const inserted = await tx
        .insert(entries)
        .values({
          userId: userId,
          versionId: version.id,
          status: item.status,
          rating: item.rating,
          review: item.review,
          // Keeps the imported shelf in the order it was built, rather than
          // stamping three hundred games with today's date.
          addedAt: item.addedAt ? new Date(item.addedAt) : undefined,
        })
        .onConflictDoNothing()
        .returning({ id: entries.id });

      return {
        workId: work.id,
        entryId: inserted[0]?.id ?? null,
        needsCover: !work.coverUrl && Boolean(game.cover),
      };
    });

    if (!outcome.entryId) {
      result.alreadyThere += 1;
      continue;
    }

    result.added += 1;

    for (const shelfName of item.shelves) {
      const shelfId = await shelfIdFor(userId, shelfName);
      if (shelfId) {
        await db
          .insert(shelfEntries)
          .values({ shelfId, entryId: outcome.entryId })
          .onConflictDoNothing();
      }
    }

    if (outcome.needsCover && game.cover) {
      artwork.push({ workId: outcome.workId, imageId: game.cover.image_id });
    }
  }

  // Outside the transactions, and a few at a time: three hundred sequential
  // image downloads is minutes, three hundred at once is rude.
  const CONCURRENCY = 6;
  for (let i = 0; i < artwork.length; i += CONCURRENCY) {
    await Promise.all(
      artwork.slice(i, i + CONCURRENCY).map(async ({ workId, imageId }) => {
        const filename = await downloadCover(igdbImageUrl(imageId, "cover_big"), workId);
        if (filename) {
          await db
            .update(works)
            .set({ coverUrl: `/covers/${filename}`, coverSource: "igdb" })
            .where(eq(works.id, workId));
        }
      }),
    );
  }

  return result;
}
