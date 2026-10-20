import { asc, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";

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
