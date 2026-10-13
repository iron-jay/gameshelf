import { and, eq } from "drizzle-orm";

import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, platforms, versions, works } from "@/lib/db/schema";
import { getGameById } from "@/lib/igdb/games";
import { originalVersionName, releaseDateFor } from "@/lib/igdb/mapping";
import { IgdbError, igdbImageUrl } from "@/lib/igdb/types";
import type { Status } from "@/lib/status";
import { ensureWorkFromIgdb, primaryPlatformFor, upsertPlatform } from "@/lib/works/ensure";

export type AddFromIgdbResult =
  | { kind: "gone" }
  | {
      kind: "added" | "already";
      workId: string;
      versionId: string;
      /**
       * The original version already existed on another platform, so the one
       * asked for was not applied. Saying which it is beats letting the choice
       * look like it took.
       */
      keptOn: string | null;
    };

/**
 * Adding a game from IGDB: its work, its one 'original' version and your entry,
 * in one transaction. Ports, romhacks and the rest arrive through the version
 * form, which is a different door.
 *
 * Throws IgdbError when IGDB cannot be reached; "gone" means it answered but no
 * longer has the game.
 */
export async function addFromIgdb(
  userId: string,
  input: { igdbId: number; platformId?: number | null; status: Status },
): Promise<AddFromIgdbResult> {
  // Fetched here rather than taken from the caller: this is the payload stored
  // in igdb_payload, and a client-supplied copy is not something to trust.
  let game;
  try {
    game = await getGameById(input.igdbId);
  } catch (err) {
    // No network at all surfaces as fetch's own TypeError. To a caller it is the
    // same failure as IGDB answering badly, so it is reported as one.
    if (err instanceof IgdbError) throw err;
    throw new IgdbError("IGDB request failed (no response)");
  }
  if (!game) return { kind: "gone" };

  // Whichever release was picked, checked against the game IGDB just returned
  // rather than believed. Absent or unknown, it falls back to the earliest one.
  const igdbPlatform =
    (game.platforms ?? []).find((platform) => platform.id === input.platformId) ??
    primaryPlatformFor(game);

  const outcome = await db.transaction(async (tx) => {
    const platformId = await upsertPlatform(tx, igdbPlatform);
    const work = await ensureWorkFromIgdb(tx, game, userId);

    const [existing] = await tx
      .select({ id: versions.id, platformName: platforms.name })
      .from(versions)
      .leftJoin(platforms, eq(platforms.id, versions.platformId))
      .where(and(eq(versions.workId, work.id), eq(versions.kind, "original")));

    let versionId = existing?.id;

    if (!versionId) {
      const [created] = await tx
        .insert(versions)
        .values({
          workId: work.id,
          name: originalVersionName(igdbPlatform),
          kind: "original",
          platformId,
          releaseDate: releaseDateFor(game),
          igdbId: game.id,
          source: "igdb",
          createdBy: userId,
        })
        .returning({ id: versions.id });
      versionId = created.id;
    }

    const inserted = await tx
      .insert(entries)
      .values({ userId, versionId, status: input.status })
      .onConflictDoNothing()
      .returning({ id: entries.id });

    return {
      workId: work.id,
      versionId,
      added: inserted.length > 0,
      keptOn:
        existing && existing.platformName !== igdbPlatform?.name ? existing.platformName : null,
      needsCover: !work.coverUrl && Boolean(game.cover),
    };
  });

  // Outside the transaction on purpose: this is network I/O that should not
  // hold a database transaction open, and a failed download must not roll back
  // an otherwise correct shelf row.
  if (outcome.needsCover && game.cover) {
    const filename = await downloadCover(
      igdbImageUrl(game.cover.image_id, "cover_big"),
      outcome.workId,
    );
    if (filename) {
      await db
        .update(works)
        .set({ coverUrl: `/covers/${filename}`, coverSource: "igdb" })
        .where(eq(works.id, outcome.workId));
    }
  }

  return {
    kind: outcome.added ? "added" : "already",
    workId: outcome.workId,
    versionId: outcome.versionId,
    keptOn: outcome.keptOn,
  };
}
