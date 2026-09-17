"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  completionLevel,
  entries,
  shelfEntries,
  shelves,
  versions,
} from "@/lib/db/schema";
import { slugify } from "@/lib/slug";
import { isStatus } from "@/lib/status";

type Completion = (typeof completionLevel.enumValues)[number];

function isCompletion(value: unknown): value is Completion {
  return (
    typeof value === "string" && (completionLevel.enumValues as readonly string[]).includes(value)
  );
}

function refresh(versionId: string) {
  revalidatePath(`/version/${versionId}`);
  revalidatePath("/");
}

/**
 * The entry is the shelf row, unique per (user, version). Every action here
 * creates it on demand, so opening a version you have not shelved and rating it
 * does the obvious thing rather than erroring.
 */
async function entryIdFor(versionId: string, userId: string): Promise<string | null> {
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

export async function shelveVersion(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");
  await entryIdFor(versionId, user.id);
  refresh(versionId);
}

export async function setStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");
  const status = formData.get("status");
  if (!isStatus(status)) return;

  const entryId = await entryIdFor(versionId, user.id);
  if (!entryId) return;

  await db.update(entries).set({ status }).where(eq(entries.id, entryId));
  refresh(versionId);
}

/**
 * Marking something done. The level comes in as a value on the button, so
 * 'credits' is one click and the other two are also one click — never a
 * dropdown you have to answer before you can finish a game.
 */
export async function markDone(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");
  const completion = formData.get("completion");
  if (!isCompletion(completion)) return;

  const entryId = await entryIdFor(versionId, user.id);
  if (!entryId) return;

  await db.update(entries).set({ status: "played", completion }).where(eq(entries.id, entryId));
  refresh(versionId);
}

export async function setRating(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");
  const raw = Number(formData.get("rating") ?? 0);
  // 1..10 whole numbers; 0 is the clear button.
  const rating = Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : null;

  const entryId = await entryIdFor(versionId, user.id);
  if (!entryId) return;

  await db.update(entries).set({ rating }).where(eq(entries.id, entryId));
  refresh(versionId);
}

export async function saveReview(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");
  const text = String(formData.get("review") ?? "").trim();

  const entryId = await entryIdFor(versionId, user.id);
  if (!entryId) return;

  await db
    .update(entries)
    .set({
      review: text === "" ? null : text,
      reviewHasSpoilers: formData.get("spoilers") === "on",
    })
    .where(eq(entries.id, entryId));

  refresh(versionId);
}

export async function toggleFlag(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");
  const flag = formData.get("flag");
  const next = formData.get("next") === "true";

  const entryId = await entryIdFor(versionId, user.id);
  if (!entryId) return;

  if (flag === "favourite") {
    await db.update(entries).set({ isFavourite: next }).where(eq(entries.id, entryId));
  } else if (flag === "private") {
    await db.update(entries).set({ isPrivate: next }).where(eq(entries.id, entryId));
  }

  refresh(versionId);
}

/**
 * Tags, deliberately separate from the shelf: the shelf is a state machine
 * holding one value, while a game can carry any number of tags. Typing a name
 * that does not exist yet creates it, the way Goodreads does — there is no
 * "manage tags" step to get through first.
 *
 * The table and these functions are still called shelves; only the interface
 * changed. See CLAUDE.md §2.
 */
export async function tagWithShelf(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");
  const name = String(formData.get("shelfName") ?? "").trim().slice(0, 60);
  if (!name) return;

  const entryId = await entryIdFor(versionId, user.id);
  if (!entryId) return;

  const slug = slugify(name);

  const findShelf = async () =>
    (
      await db
        .select({ id: shelves.id })
        .from(shelves)
        .where(and(eq(shelves.userId, user.id), eq(shelves.slug, slug)))
    )[0]?.id;

  let shelfId = await findShelf();

  if (!shelfId) {
    const [created] = await db
      .insert(shelves)
      .values({ userId: user.id, name, slug })
      .onConflictDoNothing()
      .returning({ id: shelves.id });
    // onConflictDoNothing returns nothing when another request won the race.
    shelfId = created?.id ?? (await findShelf());
  }

  if (!shelfId) return;

  await db.insert(shelfEntries).values({ shelfId, entryId }).onConflictDoNothing();
  refresh(versionId);
}

export async function untagShelf(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");
  const shelfId = String(formData.get("shelfId") ?? "");

  // entryId comes from this user's own entry, so the pair can only ever name a
  // link that belongs to them.
  const entryId = await entryIdFor(versionId, user.id);
  if (!entryId) return;

  await db
    .delete(shelfEntries)
    .where(and(eq(shelfEntries.shelfId, shelfId), eq(shelfEntries.entryId, entryId)));

  // A free-form tag with nothing on it is nothing. Dropping the empty shelf
  // keeps the filter list honest and means a mistyped name does not need a
  // whole management screen to get rid of.
  const [remaining] = await db
    .select({ total: count() })
    .from(shelfEntries)
    .where(eq(shelfEntries.shelfId, shelfId));

  if (remaining.total === 0) {
    await db.delete(shelves).where(and(eq(shelves.id, shelfId), eq(shelves.userId, user.id)));
  }

  refresh(versionId);
}
