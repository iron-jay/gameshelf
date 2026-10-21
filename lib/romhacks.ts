import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { versions, works } from "@/lib/db/schema";
import { slugify, sortTitleFor } from "@/lib/igdb/mapping";
import type { Tx } from "@/lib/works/ensure";

/**
 * A romhack is a game of its own (Jay, 2026-10-20): its own page, year, ways
 * to play and details. It starts from the game it was built on — that game's
 * series, summary and year — and is edited apart from it after that. The link
 * back is `based_on_work_id`, which only forgets when the original goes.
 */

type Reader = Tx | typeof db;

/**
 * Whether a work is a romhack's own. The link is the usual answer; a version
 * of kind romhack covers one whose original was deleted, which left the hack
 * standing without it.
 */
export async function isRomhackWork(tx: Reader, workId: string): Promise<boolean> {
  const [hit] = await tx
    .select({ id: works.id })
    .from(works)
    .where(
      and(
        eq(works.id, workId),
        or(
          isNotNull(works.basedOnWorkId),
          sql`exists (select 1 from ${versions} where ${versions.workId} = ${works.id} and ${versions.kind} = 'romhack')`,
        ),
      ),
    )
    .limit(1);
  return Boolean(hit);
}

/** A new romhack's own game, made from what the original has. */
export async function createRomhackWork(
  tx: Tx,
  input: {
    name: string;
    baseWorkId: string | null;
    releaseDate: string | null;
    userId: string;
    /** The form's own series and summary, edited from the original's before adding. */
    details?: { series: string | null; summary: string | null };
  },
): Promise<{ id: string; slug: string }> {
  const [base] = input.baseWorkId
    ? await tx
        .select({ series: works.series, summary: works.summary, firstReleaseDate: works.firstReleaseDate })
        .from(works)
        .where(eq(works.id, input.baseWorkId))
    : [];

  const slugBase = slugify(input.name);
  const [clash] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, slugBase));
  const [created] = await tx
    .insert(works)
    .values({
      slug: clash ? `${slugBase}-${Date.now().toString(36)}` : slugBase,
      title: input.name,
      workKind: "main_game",
      basedOnWorkId: base ? input.baseWorkId : null,
      series: input.details ? input.details.series : (base?.series ?? null),
      sortTitle: sortTitleFor(input.name),
      summary: input.details ? input.details.summary : (base?.summary ?? null),
      firstReleaseDate: input.releaseDate ?? base?.firstReleaseDate ?? null,
      source: "local",
      createdBy: input.userId,
    })
    .returning({ id: works.id, slug: works.slug });
  return created;
}

export type WorkLink = { slug: string; title: string };

export async function basedOnOf(basedOnWorkId: string | null): Promise<WorkLink | null> {
  if (!basedOnWorkId) return null;
  const [row] = await db
    .select({ slug: works.slug, title: works.title })
    .from(works)
    .where(eq(works.id, basedOnWorkId));
  return row ?? null;
}

export type RomhackItem = WorkLink & { year: number | null; coverUrl: string | null };

/** The romhacks built on a game, oldest first, for its page. */
export async function romhacksOf(workId: string): Promise<RomhackItem[]> {
  const rows = await db
    .select({ slug: works.slug, title: works.title, firstReleaseDate: works.firstReleaseDate, coverUrl: works.coverUrl })
    .from(works)
    .where(eq(works.basedOnWorkId, workId))
    .orderBy(sql`${works.firstReleaseDate} asc nulls last`, asc(works.title));
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    year: row.firstReleaseDate ? Number(row.firstReleaseDate.slice(0, 4)) : null,
    coverUrl: row.coverUrl,
  }));
}
