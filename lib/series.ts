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
