import { and, asc, count, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { entryCards, shelfEntries, shelves } from "@/lib/db/schema";
import type { Status } from "@/lib/status";

/**
 * Reading a shelf, for the web's home page and the phone's API alike. How the
 * rows are grouped and drawn is each caller's business; which rows, in what
 * order, is decided here once.
 */

// Section 5 names these. Title sorting would need works.sort_title on the view,
// which is not worth a column until someone asks for it.
export const SHELF_SORTS = {
  added: "Recently added",
  rated: "Rating",
  finished: "Recently finished",
  series: "Series",
} as const;
export type ShelfSort = keyof typeof SHELF_SORTS;

export function isShelfSort(value: unknown): value is ShelfSort {
  return typeof value === "string" && value in SHELF_SORTS;
}

const ORDER_BY: Readonly<Record<ShelfSort, SQL>> = {
  added: sql`added_at desc`,
  rated: sql`rating desc nulls last, added_at desc`,
  finished: sql`last_finished_on desc nulls last, added_at desc`,
  // Within a series, the order a series is played in is the order it came out
  // in, which release_year already knows. Anything with no series sorts last
  // rather than leading the page under a blank heading.
  series: sql`series asc nulls last, release_year asc nulls last, work_title asc`,
};

export type ShelfFilters = {
  status?: Status;
  platform?: string;
  /** A tag's slug. */
  tag?: string;
  sort?: ShelfSort;
};

export type ShelfRow = typeof entryCards.$inferSelect;

export async function shelfRows(userId: string, filters: ShelfFilters = {}): Promise<ShelfRow[]> {
  const where = [eq(entryCards.userId, userId)];
  if (filters.status) where.push(eq(entryCards.status, filters.status));
  if (filters.platform) where.push(eq(entryCards.platformName, filters.platform));
  if (filters.tag) {
    where.push(
      inArray(
        entryCards.entryId,
        db
          .select({ id: shelfEntries.entryId })
          .from(shelfEntries)
          .innerJoin(shelves, eq(shelves.id, shelfEntries.shelfId))
          .where(and(eq(shelves.userId, userId), eq(shelves.slug, filters.tag))),
      ),
    );
  }

  return db
    .select()
    .from(entryCards)
    .where(and(...where))
    .orderBy(ORDER_BY[filters.sort ?? "added"]);
}

/** Only the platforms actually on this shelf, so a filter never offers a choice that returns nothing. */
export async function shelfPlatforms(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: entryCards.platformName })
    .from(entryCards)
    .where(eq(entryCards.userId, userId));
  return rows
    .map((row) => row.name)
    .filter((name): name is string => Boolean(name))
    .sort();
}

/** The free-form tags, which the table still calls shelves (CLAUDE.md §2). */
export async function userTags(userId: string): Promise<{ slug: string; name: string }[]> {
  return db
    .select({ slug: shelves.slug, name: shelves.name })
    .from(shelves)
    .where(eq(shelves.userId, userId))
    .orderBy(asc(shelves.name));
}

/** Your tags with how many entries carry each, for a filter that shows its own sizes. */
export async function tagsWithCounts(
  userId: string,
): Promise<{ id: string; slug: string; name: string; count: number }[]> {
  return db
    .select({ id: shelves.id, slug: shelves.slug, name: shelves.name, count: count(shelfEntries.entryId) })
    .from(shelves)
    .leftJoin(shelfEntries, eq(shelfEntries.shelfId, shelves.id))
    .where(eq(shelves.userId, userId))
    .groupBy(shelves.id)
    .orderBy(asc(shelves.name));
}
