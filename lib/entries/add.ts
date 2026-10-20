import { and, eq } from "drizzle-orm";

import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, platforms, versions, works } from "@/lib/db/schema";
import { getGameById } from "@/lib/igdb/games";
import { originalVersionName, releaseDateFor, workKindFor } from "@/lib/igdb/mapping";
import { IgdbError, igdbImageUrl, type IgdbGame, type IgdbPlatform } from "@/lib/igdb/types";
import { lookupArt, SgdbError } from "@/lib/sgdb";
import type { Status } from "@/lib/status";
import { ensureWorkFromIgdb, primaryPlatformFor, upsertPlatform, type Tx } from "@/lib/works/ensure";

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
  input: {
    igdbId: number;
    platformId?: number | null;
    /** null adds the game without shelving it: a DLC's game, fetched so the DLC has somewhere to live. */
    status: Status | null;
  },
  depth = 0,
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

  // DLC lives under its game (2026-10-20), so a DLC added before its game
  // brings the game in with it: the work and its original version, not an
  // entry — you asked for the DLC, not the game. The depth stops a DLC of an
  // expansion of a DLC from walking IGDB for ever.
  if (workKindFor(game) !== "main_game" && game.parent_game && depth < 3) {
    const [parent] = await db.select({ id: works.id }).from(works).where(eq(works.igdbId, game.parent_game));
    if (!parent) await addFromIgdb(userId, { igdbId: game.parent_game, status: null }, depth + 1);
  }

  // Whichever release was picked, checked against the game IGDB just returned
  // rather than believed. Absent or unknown, it falls back to the earliest one.
  const igdbPlatform =
    (game.platforms ?? []).find((platform) => platform.id === input.platformId) ??
    primaryPlatformFor(game);

  const outcome = await db.transaction((tx) => placeIgdbGame(tx, userId, game, igdbPlatform, input.status));

  // Outside the transaction on purpose: this is network I/O that should not
  // hold a database transaction open, and a failed download must not roll back
  // an otherwise correct shelf row.
  await artForPlaced(outcome, game);

  return {
    kind: outcome.added ? "added" : "already",
    workId: outcome.workId,
    versionId: outcome.versionId,
    keptOn: outcome.keptOn,
  };
}

/**
 * IGDB had no cover, so SteamGridDB is asked on the work's own title (§4a,
 * case 1). An exact match is applied as is, a fuzzy one flagged for review on
 * /art, and anything weaker leaves the placeholder. Art is a nicety here: no
 * key, no answer or a failed download all leave the game added without it.
 */
export async function applySgdbArt(workId: string, title: string): Promise<void> {
  let lookup;
  try {
    lookup = await lookupArt(title);
  } catch (err) {
    if (err instanceof SgdbError) return;
    throw err;
  }
  const best = lookup.candidates[0];
  if (lookup.confidence === "none" || !best) return;

  const filename = await downloadCover(best.imageUrl, workId);
  if (!filename) return;
  await db
    .update(works)
    .set({
      coverUrl: `/covers/${filename}`,
      coverSource: "steamgriddb",
      coverNeedsReview: lookup.confidence === "fuzzy",
      sgdbGameId: best.sgdbGameId,
    })
    .where(eq(works.id, workId));
}

export type Placed = {
  workId: string;
  versionId: string;
  /** An entry was made by this call. */
  added: boolean;
  keptOn: string | null;
  needsCover: boolean;
  needsArt: boolean;
};

/**
 * An IGDB game's work, its one 'original' version and, given a shelf, your
 * entry: the rows every add from IGDB makes, inside the caller's transaction.
 * Without a shelf it is the game made known here and not shelved, as a DLC's
 * game, or a game's DLC filled in under it.
 */
export async function placeIgdbGame(
  tx: Tx,
  userId: string,
  game: IgdbGame,
  igdbPlatform: IgdbPlatform | undefined,
  status: Status | null,
): Promise<Placed> {
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

  const inserted = status
    ? await tx
        .insert(entries)
        .values({ userId, versionId, status })
        .onConflictDoNothing()
        .returning({ id: entries.id })
    : [];

  return {
    workId: work.id,
    versionId,
    added: inserted.length > 0,
    keptOn: existing && existing.platformName !== igdbPlatform?.name ? existing.platformName : null,
    needsCover: !work.coverUrl && Boolean(game.cover),
    // Only a work this add created: the lookup runs once, on add (§4a), and
    // never again because someone else shelves a game that still has none.
    needsArt: work.created && !work.coverUrl && !game.cover,
  };
}

/** IGDB's cover for a work just placed, else one SteamGridDB lookup (§4a). */
export async function artForPlaced(placed: Placed, game: IgdbGame): Promise<void> {
  if (placed.needsCover && game.cover) {
    const filename = await downloadCover(igdbImageUrl(game.cover.image_id, "cover_big"), placed.workId);
    if (filename) {
      await db
        .update(works)
        .set({ coverUrl: `/covers/${filename}`, coverSource: "igdb" })
        .where(eq(works.id, placed.workId));
    }
  }
  if (placed.needsArt) await applySgdbArt(placed.workId, game.name);
}
