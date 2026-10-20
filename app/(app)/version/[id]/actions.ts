"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  entryIdFor,
  isCompletion,
  markDone as markEntryDone,
  ratingFrom,
  tagEntry,
  untagEntry,
  updateEntry,
} from "@/lib/entries";
import { isStatus } from "@/lib/status";

// The rules live in lib/entries, shared with the phone's API. These only read
// the form and refresh the pages that show the result.

function refresh(versionId: string) {
  revalidatePath(`/version/${versionId}`);
  revalidatePath("/");
}

function versionIdFrom(formData: FormData): string {
  return String(formData.get("versionId") ?? "");
}

export async function shelveVersion(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = versionIdFrom(formData);
  await entryIdFor(versionId, user.id);
  refresh(versionId);
}

export async function setStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = versionIdFrom(formData);
  const status = formData.get("status");
  if (!isStatus(status)) return;

  if (await updateEntry(user.id, versionId, { status })) refresh(versionId);
}

export async function markDone(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = versionIdFrom(formData);
  const completion = formData.get("completion");
  if (!isCompletion(completion)) return;

  // Finishing from the shelves asks for a rating on the way; skipping it, or
  // finishing from the game's page, sends none and leaves the rating alone.
  const rating = ratingFrom(formData.get("rating"));

  if (await markEntryDone(user.id, versionId, completion, rating)) refresh(versionId);
}

export async function setRating(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = versionIdFrom(formData);
  // 0 is the clear button, and ratingFrom turns it into null.
  const rating = ratingFrom(formData.get("rating") ?? 0);

  if (await updateEntry(user.id, versionId, { rating })) refresh(versionId);
}

export async function saveReview(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = versionIdFrom(formData);

  const saved = await updateEntry(user.id, versionId, {
    review: String(formData.get("review") ?? ""),
    reviewHasSpoilers: formData.get("spoilers") === "on",
  });
  if (saved) refresh(versionId);
}

export async function toggleFlag(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = versionIdFrom(formData);
  const flag = formData.get("flag");
  const next = formData.get("next") === "true";

  const changes =
    flag === "favourite" ? { isFavourite: next } : flag === "private" ? { isPrivate: next } : null;
  if (!changes) return;

  if (await updateEntry(user.id, versionId, changes)) refresh(versionId);
}

export async function tagWithShelf(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = versionIdFrom(formData);

  if (await tagEntry(user.id, versionId, String(formData.get("shelfName") ?? ""))) {
    refresh(versionId);
  }
}

export async function untagShelf(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = versionIdFrom(formData);

  if (await untagEntry(user.id, versionId, String(formData.get("shelfId") ?? ""))) {
    refresh(versionId);
  }
}
