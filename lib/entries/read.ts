import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { entries, entryCards, shelfEntries, shelves } from "@/lib/db/schema";
import type { ShelfRow } from "@/lib/shelf";

export type EntryDetail = {
  row: ShelfRow;
  review: string | null;
  reviewHasSpoilers: boolean;
  isPrivate: boolean;
  /** When the entry itself last changed, so the phone can tell a change made on the web since its own. */
  updatedAt: Date;
  tags: { id: string; slug: string; name: string }[];
};

/** One of this user's entries, or null when it is not theirs or does not exist. */
export async function entryDetail(userId: string, entryId: string): Promise<EntryDetail | null> {
  const [row] = await db
    .select()
    .from(entryCards)
    .where(and(eq(entryCards.entryId, entryId), eq(entryCards.userId, userId)));
  if (!row) return null;

  // The view leaves out the long and private fields, so a shelf of hundreds
  // does not carry every review; one entry fetches them.
  const [extra] = await db
    .select({
      review: entries.review,
      reviewHasSpoilers: entries.reviewHasSpoilers,
      isPrivate: entries.isPrivate,
      updatedAt: entries.updatedAt,
    })
    .from(entries)
    .where(eq(entries.id, entryId));

  const tags = await db
    .select({ id: shelves.id, slug: shelves.slug, name: shelves.name })
    .from(shelfEntries)
    .innerJoin(shelves, eq(shelves.id, shelfEntries.shelfId))
    .where(eq(shelfEntries.entryId, entryId))
    .orderBy(asc(shelves.name));

  return { row, ...extra, tags };
}

/** The version an entry is for, so routes addressed by entry can call the version-keyed lib/entries functions. */
export async function versionIdForEntry(userId: string, entryId: string): Promise<string | null> {
  const [row] = await db
    .select({ versionId: entries.versionId })
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId)));
  return row?.versionId ?? null;
}
