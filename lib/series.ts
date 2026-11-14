import { and, asc, count, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { entries, platforms, versions, works } from "@/lib/db/schema";

/**
 * The series already in use, for the form to suggest.
 *
 * Free text with suggestions rather than a table: a series has nothing but a
 * name, and a table of names is a table whose only job is to be joined. The
 * platform list earned its table by carrying IGDB ids and abbreviations; this
 * carries neither. If that changes, so should this.
 */
export async function seriesInUse(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ series: works.series })
    .from(works)
    .where(isNotNull(works.series))
    .orderBy(asc(works.series));

  return rows.map((row) => row.series).filter((name): name is string => Boolean(name));
}

/**
 * Matched case-insensitively against what is already there, so typing "zelda"
 * when "Zelda" exists joins that series rather than starting a rival spelling
 * of it. The stored name stays whatever it was first written as.
 */
export function canonicalSeries(name: string, existing: readonly string[]): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  return existing.find((known) => known.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}

/** Where a series' own page lives. Names, not slugs: a series has no row to hang a slug on. */
export function seriesHref(name: string): string {
  return `/series/${encodeURIComponent(name)}`;
}

export type SeriesShelfRow = {
  workId: string | null;
  series: string | null;
  status: string | null;
  coverUrl: string | null;
  releaseYear: number | null;
};

export type SeriesOnShelf = {
  name: string;
  /** Games, not entries: two platforms of Ocarina are one Zelda game. */
  games: number;
  played: number;
  /** The earliest game's art, so a series is fronted by where it starts. */
  coverUrl: string | null;
};

/**
 * The series your shelf touches, folded from the rows the shelf already has
 * rather than asked for again. Alphabetical, the same order the wall groups by.
 */
export function seriesOnShelf(rows: readonly SeriesShelfRow[]): SeriesOnShelf[] {
  const byName = new Map<
    string,
    { works: Set<string>; played: Set<string>; cover: { year: number; url: string } | null }
  >();

  for (const row of rows) {
    if (!row.series || !row.workId) continue;
    const found = byName.get(row.series) ?? { works: new Set(), played: new Set(), cover: null };
    found.works.add(row.workId);
    if (row.status === "played") found.played.add(row.workId);
    if (row.coverUrl) {
      const year = row.releaseYear ?? Number.POSITIVE_INFINITY;
      if (!found.cover || year < found.cover.year) found.cover = { year, url: row.coverUrl };
    }
    byName.set(row.series, found);
  }

  return [...byName.entries()]
    .map(([name, found]) => ({
      name,
      games: found.works.size,
      played: found.played.size,
      coverUrl: found.cover?.url ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A series in release order, games you have not shelved included, with your
 * entries on each: the series page, and the phone's (GET /series/{name}).
 * Null when no game carries the name.
 */
export async function seriesDetail(userId: string, name: string) {
  const members = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      workKind: works.workKind,
      firstReleaseDate: works.firstReleaseDate,
      coverUrl: works.coverUrl,
    })
    .from(works)
    .where(eq(works.series, name))
    .orderBy(sql`${works.firstReleaseDate} asc nulls last`, asc(works.title));
  if (members.length === 0) return null;

  const mine = await db
    .select({
      workId: versions.workId,
      entryId: entries.id,
      versionId: versions.id,
      versionName: versions.name,
      platformName: platforms.name,
      status: entries.status,
      rating: entries.rating,
    })
    .from(entries)
    .innerJoin(versions, eq(versions.id, entries.versionId))
    .leftJoin(platforms, eq(platforms.id, versions.platformId))
    .where(
      and(
        eq(entries.userId, userId),
        inArray(
          versions.workId,
          members.map((work) => work.id),
        ),
      ),
    );

  return {
    name,
    played: new Set(mine.filter((entry) => entry.status === "played").map((entry) => entry.workId)).size,
    works: members.map((work) => ({
      ...work,
      entries: mine
        .filter((entry) => entry.workId === work.id)
        .map((entry) => ({
          entryId: entry.entryId,
          versionId: entry.versionId,
          versionName: entry.versionName,
          platformName: entry.platformName,
          status: entry.status,
          rating: entry.rating,
        })),
    })),
  };
}

/**
 * Renames a series on every game in it. A name already in use joins the two,
 * the same case-insensitive match the series box makes; the series' own name
 * is left out of that match so "zelda" can become "Zelda". Returns the name
 * it ends up with, or null when nothing was typed.
 */
export async function renameSeries(from: string, typed: string): Promise<string | null> {
  const others = (await seriesInUse()).filter((name) => name !== from);
  const to = canonicalSeries(typed.slice(0, 120), others);
  if (!from || !to) return null;
  await db.update(works).set({ series: to }).where(eq(works.series, from));
  return to;
}

/** Takes every game out of a series. Games and entries stay: a series is only a name on them. */
export async function removeSeries(name: string): Promise<void> {
  if (name) await db.update(works).set({ series: null }).where(eq(works.series, name));
}

/** One game out of a series. Returns how many games are left in it; at none, the series is gone. */
export async function takeOutOfSeries(name: string, workId: string): Promise<number> {
  await db
    .update(works)
    .set({ series: null })
    .where(and(eq(works.id, workId), eq(works.series, name)));
  const [left] = await db.select({ n: count() }).from(works).where(eq(works.series, name));
  return left?.n ?? 0;
}
