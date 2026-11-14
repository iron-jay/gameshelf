"use server";

import { requireUser } from "@/lib/auth";
import { applyGrid, applyReference, resolveArt, uploadArtBytes } from "@/lib/art-changes";
import type { ArtCandidate } from "@/lib/sgdb";
import { lookupArt } from "@/lib/sgdb";
import type { ArtActionState } from "@/lib/versions/types";

// The rules live in lib/art-changes.ts, shared with the phone's API.

const GONE = { ok: false, message: "That no longer exists." };

function target(formData: FormData) {
  return resolveArt(String(formData.get("slug") ?? ""), (formData.get("versionId") as string) || null);
}

export async function searchArt(term: string, includeAdult: boolean): Promise<ArtCandidate[]> {
  await requireUser();
  if (!term.trim()) return [];
  try {
    return (await lookupArt(term, includeAdult)).candidates;
  } catch {
    return [];
  }
}

/** Apply a grid the user picked out of the results. */
export async function applyArt(_prev: ArtActionState, formData: FormData): Promise<ArtActionState> {
  await requireUser();
  const resolved = await target(formData);
  if (!resolved) return GONE;
  return applyGrid(resolved, String(formData.get("imageUrl") ?? ""), Number(formData.get("sgdbGameId") ?? 0) || null);
}

/** Apply art from a pasted SteamGridDB URL or game id. */
export async function applyArtFromReference(_prev: ArtActionState, formData: FormData): Promise<ArtActionState> {
  await requireUser();
  const resolved = await target(formData);
  if (!resolved) return GONE;
  return applyReference(resolved, String(formData.get("reference") ?? ""));
}

/** Apply a file the user uploaded directly. */
export async function uploadArt(_prev: ArtActionState, formData: FormData): Promise<ArtActionState> {
  await requireUser();
  const resolved = await target(formData);
  if (!resolved) return GONE;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an image file." };
  return uploadArtBytes(resolved, await file.arrayBuffer(), file.type);
}
