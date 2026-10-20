import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, plays, shelfEntries, versions, works } from "@/lib/db/schema";
import { applySgdbArt, artForPlaced, placeIgdbGame, type Placed } from "@/lib/entries/add";
import { getGamesByIds } from "@/lib/igdb/games";
import { slugify, sortTitleFor } from "@/lib/igdb/mapping";
import { IgdbError, igdbImageUrl, type IgdbGame } from "@/lib/igdb/types";
import { resolvePlatform } from "@/lib/platforms";
import { gridsForGame, lookupArt } from "@/lib/sgdb";
import { isCommunityKind } from "@/lib/works/read";
import { ensureWorkFromIgdb, primaryPlatformFor, type Tx } from "@/lib/works/ensure";

import type { RestoreRow } from "./restore";
import { shelfIdFor } from "./run";

export type RestoreOutcome = {
  line: number;
  title: string;
  result: "added" | "already" | "failed";
  message?: string;
};

/** The game already here: by IGDB id, or a local game of the same name and kind. */
async function findWork(tx: Tx | typeof db, row: RestoreRow): Promise<string | null> {
  const { work } = row;
  const [hit] = await tx
    .select({ id: works.id })
    .from(works)
    .where(
      work.igdbId
        ? eq(works.igdbId, work.igdbId)
        : and(isNull(works.igdbId), eq(sql`lower(${works.title})`, work.title.toLowerCase()), eq(works.workKind, work.workKind)),
    )
    .limit(1);
  return hit?.id ?? null;
}

async function parentFor(tx: Tx, row: RestoreRow): Promise<string | null> {
  const { parentIgdbId, parentWork } = row.work;
  const by = parentIgdbId ? eq(works.igdbId, parentIgdbId) : parentWork ? eq(sql`lower(${works.title})`, parentWork.toLowerCase()) : null;
  if (!by) return null;
  const [hit] = await tx.select({ id: works.id }).from(works).where(by).limit(1);
  return hit?.id ?? null;
}

/** A game IGDB does not have (or no longer has), from the file's own details. */
async function insertLocalWork(tx: Tx, row: RestoreRow, userId: string): Promise<string> {
  const { work } = row;
  const base = slugify(work.title);
  const [clash] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, base));
  const [created] = await tx
    .insert(works)
    .values({
      slug: clash ? `${base}-${Date.now().toString(36)}` : base,
      title: work.title,
      workKind: work.workKind,
      series: work.series,
      sortTitle: sortTitleFor(work.title),
      summary: work.summary,
      firstReleaseDate: work.firstReleaseDate,
      dlcOnShelf: work.dlcOnShelf,
      sgdbGameId: work.sgdbGameId,
      source: "local",
      createdBy: userId,
    })
    .returning({ id: works.id });
  return created.id;
}

/**
 * The version the entry is on: one of that game's by the same name and kind,
 * else a new one from the file.
 */
async function ensureVersion(tx: Tx, row: RestoreRow, workId: string, userId: string): Promise<{ id: string; created: boolean }> {
  const { version } = row;
  const [same] = await tx
    .select({ id: versions.id })
    .from(versions)
    .where(
      and(
        eq(versions.workId, workId),
        eq(versions.kind, version.kind),
        eq(sql`lower(${versions.name})`, version.name.toLowerCase()),
      ),
    )
    .limit(1);
  if (same) return { id: same.id, created: false };

  const [created] = await tx
    .insert(versions)
    .values({
      workId,
      name: version.name,
      kind: version.kind,
      platformId: await resolvePlatform(tx, version.platform),
      releaseDate: version.releaseDate,
      versionLabel: version.versionLabel,
      author: version.author,
      url: version.url,
      notes: version.notes,
      sgdbGameId: version.sgdbGameId,
      igdbId: version.igdbId,
      source: version.igdbId ? "igdb" : "local",
      createdBy: userId,
    })
    .returning({ id: versions.id });

  // What it patches or ports, by name within the game. The file puts these
  // last, so the base is here by now if it was exported at all.
  if (version.baseVersion) {
    const [base] = await tx
      .select({ id: versions.id })
      .from(versions)
      .where(and(eq(versions.workId, workId), eq(versions.name, version.baseVersion), ne(versions.id, created.id)))
      .limit(1);
    if (base) await tx.update(versions).set({ baseVersionId: base.id }).where(eq(versions.id, created.id));
  }
  return { id: created.id, created: true };
}

type Placement = {
  workId: string;
  versionId: string;
  /** The entry this restore made; null when one was already on the shelf. */
  entryId: string | null;
  added: boolean;
  workCreated: boolean;
  versionCreated: boolean;
  game: IgdbGame | null;
  /** A DLC's game, brought in without an entry as an add would. */
  parent: { placed: Placed; game: IgdbGame } | null;
};

async function place(tx: Tx, row: RestoreRow, userId: string, games: Map<number, IgdbGame>): Promise<Placement> {
  const { work } = row;
  let workId = await findWork(tx, row);
  const workCreated = !workId;
  const game = !workId && work.igdbId ? (games.get(work.igdbId) ?? null) : null;
  let parent: Placement["parent"] = null;

  if (!workId && game) {
    // The game before its DLC, so the DLC hangs off it as it is created.
    const parentGame = work.parentIgdbId ? games.get(work.parentIgdbId) : undefined;
    if (parentGame && !(await parentFor(tx, row))) {
      parent = { game: parentGame, placed: await placeIgdbGame(tx, userId, parentGame, primaryPlatformFor(parentGame), null) };
    }
    workId = (await ensureWorkFromIgdb(tx, game, userId)).id;
    // Restored as you left it, over what IGDB says today.
    await tx
      .update(works)
      .set({
        title: work.title,
        sortTitle: sortTitleFor(work.title),
        ...(work.series ? { series: work.series } : {}),
        ...(work.summary ? { summary: work.summary } : {}),
        dlcOnShelf: work.dlcOnShelf,
        ...(work.sgdbGameId ? { sgdbGameId: work.sgdbGameId } : {}),
      })
      .where(eq(works.id, workId));
  } else if (!workId) {
    workId = await insertLocalWork(tx, row, userId);
  }

  if (work.workKind !== "main_game") {
    const parentId = await parentFor(tx, row);
    if (parentId && parentId !== workId) {
      await tx.update(works).set({ parentWorkId: parentId }).where(and(eq(works.id, workId), isNull(works.parentWorkId)));
    }
  }

  const version = await ensureVersion(tx, row, workId, userId);

  const [entry] = await tx
    .insert(entries)
    .values({
      userId,
      versionId: version.id,
      status: row.status,
      completion: row.completion,
      rating: row.rating,
      review: row.review,
      reviewHasSpoilers: row.reviewHasSpoilers,
      isFavourite: row.isFavourite,
      isPrivate: row.isPrivate,
      addedAt: new Date(row.addedAt),
    })
    .onConflictDoNothing()
    .returning({ id: entries.id });
  if (entry && row.plays.length > 0) {
    await tx.insert(plays).values(row.plays.map((p) => ({ entryId: entry.id, ...p })));
  }

  return {
    workId,
    versionId: version.id,
    entryId: entry?.id ?? null,
    added: Boolean(entry),
    workCreated,
    versionCreated: version.created,
    game,
    parent,
  };
}

/** The top SteamGridDB grid for a game you matched by hand before. */
async function sgdbGrid(sgdbGameId: number, name: string): Promise<string | null> {
  try {
    return (await gridsForGame(sgdbGameId, name))[0]?.imageUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Art for what this row created, in §4a's order: IGDB's cover for a game,
 * else the SteamGridDB game it was matched to, else a lookup by title — and a
 * community version by its own name, never its game's.
 */
async function artFor(row: RestoreRow, placed: Placement): Promise<void> {
  if (placed.parent) await artForPlaced(placed.parent.placed, placed.parent.game);

  if (placed.workCreated) {
    const url = placed.game?.cover
      ? igdbImageUrl(placed.game.cover.image_id, "cover_big")
      : row.work.sgdbGameId
        ? await sgdbGrid(row.work.sgdbGameId, row.work.title)
        : null;
    const filename = url ? await downloadCover(url, placed.workId) : null;
    if (filename) {
      await db
        .update(works)
        .set({ coverUrl: `/covers/${filename}`, coverSource: placed.game?.cover ? "igdb" : "steamgriddb" })
        .where(eq(works.id, placed.workId));
    } else {
      await applySgdbArt(placed.workId, row.work.title);
    }
  }

  if (placed.versionCreated && isCommunityKind(row.version.kind)) {
    let url: string | null = null;
    let review = false;
    let sgdbGameId = row.version.sgdbGameId;
    if (sgdbGameId) {
      url = await sgdbGrid(sgdbGameId, row.version.name);
    } else {
      const lookup = await lookupArt(row.version.name).catch(() => null);
      if (lookup && lookup.confidence !== "none" && lookup.candidates[0]) {
        url = lookup.candidates[0].imageUrl;
        review = lookup.confidence === "fuzzy";
        sgdbGameId = lookup.candidates[0].sgdbGameId;
      }
    }
    const filename = url ? await downloadCover(url, placed.versionId) : null;
    if (filename) {
      await db
        .update(versions)
        .set({ coverUrl: `/covers/${filename}`, coverSource: "steamgriddb", coverNeedsReview: review, sgdbGameId })
        .where(eq(versions.id, placed.versionId));
    }
  }
}

/**
 * Restores a batch of a gameshelf export. Idempotent: a game already here is
 * joined rather than doubled, and an entry already on the shelf is left
 * exactly as it is — so running the same file twice changes nothing, and a
 * run that stopped carries on where it left off.
 *
 * Details come from the file: titles, series, summaries and versions as you
 * left them. IGDB is asked, once for the batch, only for games not here yet —
 * for the payload every IGDB work keeps, and its cover.
 */
export async function restoreRows(userId: string, rows: RestoreRow[]): Promise<RestoreOutcome[]> {
  const wanted: number[] = [];
  for (const row of rows) {
    if (row.work.igdbId && !(await findWork(db, row))) {
      wanted.push(row.work.igdbId);
      if (row.work.parentIgdbId) wanted.push(row.work.parentIgdbId);
    }
  }

  let games = new Map<number, IgdbGame>();
  let igdbFailure: string | null = null;
  try {
    games = new Map((await getGamesByIds(wanted)).map((game) => [game.id, game]));
  } catch (error) {
    // IGDB down or not set up: the games it was needed for fail, and running
    // the file again picks them up. Everything else carries on.
    if (!(error instanceof IgdbError) && !(error instanceof TypeError)) throw error;
    igdbFailure = error instanceof IgdbError ? error.message : "IGDB could not be reached.";
  }

  const outcomes: RestoreOutcome[] = [];
  for (const row of rows) {
    const base = { line: row.line, title: row.work.title };
    if (igdbFailure && row.work.igdbId && wanted.includes(row.work.igdbId)) {
      outcomes.push({ ...base, result: "failed", message: igdbFailure });
      continue;
    }
    try {
      const placed = await db.transaction((tx) => place(tx, row, userId, games));
      if (placed.entryId) {
        for (const name of row.shelves) {
          const shelfId = await shelfIdFor(userId, name);
          if (shelfId) await db.insert(shelfEntries).values({ shelfId, entryId: placed.entryId }).onConflictDoNothing();
        }
      }
      // Art is a nicety: the game is restored whether or not a cover comes.
      await artFor(row, placed).catch((error: unknown) => console.error(`[restore] art for entry ${row.line}`, error));
      outcomes.push({ ...base, result: placed.added ? "added" : "already" });
    } catch (error) {
      console.error(`[restore] entry ${row.line}`, error);
      outcomes.push({ ...base, result: "failed", message: "Something went wrong on this one; the server log has it." });
    }
  }
  return outcomes;
}
