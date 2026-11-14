"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { artForName, baseGameOptions, createVersionFromForm } from "@/lib/versions/create";
import { saveVersionDetails } from "@/lib/versions/details";
import type { ArtLookupState, BaseGameOption, CreateVersionState } from "@/lib/versions/types";

/**
 * Fired on blur of the name field while the form is still open. Nothing is
 * persisted — no draft rows, no orphan cleanup, and abandoning the form leaves
 * no trace.
 */
export async function lookupArtForName(name: string): Promise<ArtLookupState> {
  await requireUser();
  return artForName(name);
}

/** Inline base-game search for the door that does not already know the work. */
export async function searchBaseGames(term: string): Promise<BaseGameOption[]> {
  await requireUser();
  return baseGameOptions(term);
}

export async function createVersion(
  _prev: CreateVersionState,
  formData: FormData,
): Promise<CreateVersionState> {
  const user = await requireUser();
  // The rules live in lib/versions/create.ts, shared with the phone's API.
  const result = await createVersionFromForm(user.id, formData);
  if (result.ok && result.workSlug) {
    revalidatePath("/");
    revalidatePath(`/work/${result.workSlug}`);
  }
  return { ok: result.ok, message: result.message, workSlug: result.workSlug };
}

/**
 * Edit a version's own details. Deliberately does not move it to a different
 * work: that is not an edit, it is a different version of a different game.
 *
 * Any signed-in user can edit, the same as any of them can add one. It is your
 * server — section 5 is explicit that there is no approval step.
 */
export async function updateVersion(
  _prev: CreateVersionState,
  formData: FormData,
): Promise<CreateVersionState> {
  await requireUser();
  // The rules live in lib/versions/details.ts, shared with the phone's API.
  const result = await saveVersionDetails(formData);
  if (!result.ok || !result.workSlug) return result;

  revalidatePath("/");
  revalidatePath(`/version/${String(formData.get("versionId"))}`);
  revalidatePath(`/work/${result.workSlug}`);
  return result;
}
