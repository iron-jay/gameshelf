"use server";

import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { getGamesByIds } from "@/lib/igdb/games";
import { seriesFor } from "@/lib/igdb/mapping";
import { canonicalSeries } from "@/lib/series";
import { type SeriesBackfillResult } from "@/lib/series-backfill";

/**
 * The works a backfill would touch: from IGDB, and with no series yet.
 *
 * **Never one that already has a series.** Refilling those would overwrite
 * whatever was typed by hand with whatever IGDB thinks, which is the opposite
 * of helpful and is not undoable.
 */
export async function worksNeedingSeries(): Promise<number[]> {
  await requireUser();

  const rows = await db
    .select({ igdbId: works.igdbId })
    .from(works)
    .where(and(isNotNull(works.igdbId), isNull(works.series)))
    .orderBy(asc(works.title));

  return rows.map((row) => row.igdbId).filter((id): id is number => id !== null);
}

/**
 * Fills in the series for one chunk of IGDB ids.
 *
 * Driven a chunk at a time from the browser rather than run as one long action,
 * the same way the Grouvee import is: a few hundred works is a minute of IGDB
 * round trips, and a request that long with no sign of progress looks hung.
 */
export async function fillSeriesForChunk(igdbIds: number[]): Promise<SeriesBackfillResult> {
  await requireUser();

  const wanted = igdbIds.filter((id) => Number.isInteger(id) && id > 0);
  if (wanted.length === 0) return { filled: 0, blank: 0, missing: 0 };

  const games = await getGamesByIds(wanted);

  // Read once per chunk rather than once per work: the list barely moves, and
  // names added within this chunk are folded in below.
  const known = await db
    .selectDistinct({ series: works.series })
    .from(works)
    .where(isNotNull(works.series));
  const existing = known
    .map((row) => row.series)
    .filter((name): name is string => Boolean(name));

  let filled = 0;
  let blank = 0;

  for (const game of games) {
    const found = seriesFor(game);
    if (!found) {
      blank += 1;
      continue;
    }

    const name = canonicalSeries(found, existing);
    if (!name) {
      blank += 1;
      continue;
    }

    // Still only where it is null: someone may have typed one between the
    // listing and this chunk, and they outrank IGDB.
    const updated = await db
      .update(works)
      .set({ series: name })
      .where(and(eq(works.igdbId, game.id), isNull(works.series)))
      .returning({ id: works.id });

    if (updated.length > 0) {
      filled += 1;
      if (!existing.includes(name)) existing.push(name);
    }
  }

  revalidatePath("/");

  return { filled, blank, missing: wanted.length - games.length };
}

/** Clears every series at once, for undoing a backfill that guessed badly. */
export async function clearAllSeries(): Promise<{ cleared: number }> {
  await requireUser();

  const cleared = await db
    .update(works)
    .set({ series: null })
    .where(isNotNull(works.series))
    .returning({ id: works.id });

  revalidatePath("/");

  return { cleared: cleared.length };
}
