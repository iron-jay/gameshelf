import { and, count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { completionLevel, entries, plays, shelfEntries, shelves, versions } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";
import type { Status } from "@/lib/status";

/**
 * Everything that changes one person's shelf row, for the version page's server
 * actions and the phone's API alike. Callers check who is asking and parse their
 * own input; nothing here reads a form or a request.
 */

export type Completion = (typeof completionLevel.enumValues)[number];

export function isCompletion(value: unknown): value is Completion {
  return (
    typeof value === "string" && (completionLevel.enumValues as readonly string[]).includes(value)
  );
}

/**
 * The entry is the shelf row, unique per (user, version). It is created on
 * demand, so opening a version you have not shelved and rating it does the
 * obvious thing rather than erroring. Null only when the version does not exist.
 */
export async function entryIdFor(versionId: string, userId: string): Promise<string | null> {
  const [version] = await db.select({ id: versions.id }).from(versions).where(eq(versions.id, versionId));
  if (!version) return null;

  const [existing] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.versionId, versionId)));

  if (existing) return existing.id;

  const [created] = await db
    .insert(entries)
    .values({ userId, versionId, status: "backlog" })
    .onConflictDoNothing()
    .returning({ id: entries.id });

  if (created) return created.id;

  const [raced] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.versionId, versionId)));

  return raced?.id ?? null;
}

export type EntryChanges = {
  status?: Status;
  completion?: Completion | null;
  /** 1 to 10; null clears it. */
  rating?: number | null;
  /** Blank clears it. */
  review?: string | null;
  reviewHasSpoilers?: boolean;
  isFavourite?: boolean;
  isPrivate?: boolean;
};

/** Ratings are whole numbers out of ten; anything else is no rating at all. */
export function ratingFrom(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

/**
 * Applies whichever fields are present, creating the entry first if need be.
 * False when the version does not exist. `on` dates the play arriving on
 * played records (today if left out): the phone passes the day it made a
 * change while out of reach of the server.
 */
export async function updateEntry(
  userId: string,
  versionId: string,
  changes: EntryChanges,
  on: string = today(),
): Promise<boolean> {
  const entryId = await entryIdFor(versionId, userId);
  if (!entryId) return false;

  const set: Partial<typeof entries.$inferInsert> = {};
  if (changes.status !== undefined) set.status = changes.status;
  if (changes.completion !== undefined) set.completion = changes.completion;
  if (changes.rating !== undefined) set.rating = changes.rating;
  if (changes.review !== undefined) {
    const text = changes.review?.trim() ?? "";
    set.review = text === "" ? null : text;
  }
  if (changes.reviewHasSpoilers !== undefined) set.reviewHasSpoilers = changes.reviewHasSpoilers;
  if (changes.isFavourite !== undefined) set.isFavourite = changes.isFavourite;
  if (changes.isPrivate !== undefined) set.isPrivate = changes.isPrivate;

  if (Object.keys(set).length === 0) return true;

  const [before] = await db.select({ status: entries.status }).from(entries).where(eq(entries.id, entryId));
  await db.update(entries).set(set).where(eq(entries.id, entryId));

  // Arriving on played is finishing it, so it records a play finished today:
  // that is what puts it first on Recently played. Choosing played again, or
  // changing how far you got, is not a second finish.
  if (changes.status === "played" && before?.status !== "played") {
    await db.insert(plays).values({
      entryId,
      finishedOn: on,
      completion: changes.completion ?? null,
    });
  }
  return true;
}

/** Today where the server is, as bookshelf dates its reads. */
function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * Marking something done. The level is given each time, so 'credits' is one
 * click and the other two are also one click — never a dropdown you have to
 * answer before you can finish a game.
 */
export function markDone(
  userId: string,
  versionId: string,
  completion: Completion,
  rating?: number | null,
) {
  return updateEntry(userId, versionId, {
    status: "played",
    completion,
    ...(rating ? { rating } : {}),
  });
}

/** Longest tag name kept; the rest is cut rather than refused. */
const TAG_NAME_MAX = 60;

/**
 * Tags, deliberately separate from the shelf: the shelf is a state machine
 * holding one value, while a game can carry any number of tags. A name that
 * does not exist yet is created, the way Goodreads does it — there is no
 * "manage tags" step to get through first.
 *
 * The table is still called shelves; only the interface changed. See CLAUDE.md §2.
 * False when the version does not exist or the name is blank.
 */
export async function tagEntry(userId: string, versionId: string, rawName: string): Promise<boolean> {
  const name = rawName.trim().slice(0, TAG_NAME_MAX);
  if (!name) return false;

  const entryId = await entryIdFor(versionId, userId);
  if (!entryId) return false;

  const slug = slugify(name);

  const findShelf = async () =>
    (
      await db
        .select({ id: shelves.id })
        .from(shelves)
        .where(and(eq(shelves.userId, userId), eq(shelves.slug, slug)))
    )[0]?.id;

  let shelfId = await findShelf();

  if (!shelfId) {
    const [created] = await db
      .insert(shelves)
      .values({ userId, name, slug })
      .onConflictDoNothing()
      .returning({ id: shelves.id });
    // onConflictDoNothing returns nothing when another request won the race.
    shelfId = created?.id ?? (await findShelf());
  }

  if (!shelfId) return false;

  await db.insert(shelfEntries).values({ shelfId, entryId }).onConflictDoNothing();
  return true;
}

export async function untagEntry(userId: string, versionId: string, shelfId: string): Promise<boolean> {
  // entryId comes from this user's own entry, so the pair can only ever name a
  // link that belongs to them.
  const entryId = await entryIdFor(versionId, userId);
  if (!entryId) return false;

  await db
    .delete(shelfEntries)
    .where(and(eq(shelfEntries.shelfId, shelfId), eq(shelfEntries.entryId, entryId)));

  await dropTagsIfEmpty(userId, [shelfId]);
  return true;
}

/**
 * A free-form tag with nothing on it is nothing. Dropping the empty shelf
 * keeps the filter list honest and means a mistyped name does not need a
 * whole management screen to get rid of.
 */
async function dropTagsIfEmpty(userId: string, shelfIds: string[]): Promise<void> {
  for (const shelfId of shelfIds) {
    const [remaining] = await db
      .select({ total: count() })
      .from(shelfEntries)
      .where(eq(shelfEntries.shelfId, shelfId));

    if (remaining.total === 0) {
      await db.delete(shelves).where(and(eq(shelves.id, shelfId), eq(shelves.userId, userId)));
    }
  }
}

/**
 * One of this user's tags by its name as typed, matched the way tagEntry
 * matches: by slug, so "Couch co-op" and "couch co-op" are the same tag.
 */
export async function tagIdByName(userId: string, rawName: string): Promise<string | null> {
  const slug = slugify(rawName.trim().slice(0, TAG_NAME_MAX));
  if (!slug) return null;

  const [shelf] = await db
    .select({ id: shelves.id })
    .from(shelves)
    .where(and(eq(shelves.userId, userId), eq(shelves.slug, slug)));
  return shelf?.id ?? null;
}

/**
 * Puts a version on this user's shelf at the given status. An entry that is
 * already there keeps its status, the way adding from search does: adding
 * twice is not a way to move something. Null when the version does not exist.
 */
export async function shelveVersion(
  userId: string,
  versionId: string,
  status: Status,
  on: string = today(),
): Promise<{ entryId: string; created: boolean } | null> {
  const [version] = await db.select({ id: versions.id }).from(versions).where(eq(versions.id, versionId));
  if (!version) return null;

  const [created] = await db
    .insert(entries)
    .values({ userId, versionId, status })
    .onConflictDoNothing()
    .returning({ id: entries.id });
  if (created) {
    // As updateEntry: arriving on played is finishing it, so a DLC pressed
    // straight to Played from the phone leads Recently played too.
    if (status === "played") await db.insert(plays).values({ entryId: created.id, finishedOn: on });
    return { entryId: created.id, created: true };
  }

  const [existing] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.versionId, versionId)));
  return existing ? { entryId: existing.id, created: false } : null;
}

/**
 * Takes a version off this user's shelf: the entry, its rating and review, its
 * tags and any plays recorded against it. The version and work stay, since
 * they are the catalogue rather than your shelf. False when the entry is not
 * this user's.
 */
export async function removeEntry(userId: string, entryId: string): Promise<boolean> {
  const tagIds = (
    await db
      .select({ id: shelfEntries.shelfId })
      .from(shelfEntries)
      .innerJoin(entries, eq(entries.id, shelfEntries.entryId))
      .where(and(eq(shelfEntries.entryId, entryId), eq(entries.userId, userId)))
  ).map((row) => row.id);

  const removed = await db
    .delete(entries)
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId)))
    .returning({ id: entries.id });
  if (removed.length === 0) return false;

  await dropTagsIfEmpty(userId, tagIds);
  return true;
}
