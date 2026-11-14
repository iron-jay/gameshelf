"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { addDlcByHandFor } from "@/lib/dlc-add";
import { setDlcOnShelf } from "@/lib/dlc";
import { updateEntry } from "@/lib/entries";
import { addFromIgdb } from "@/lib/entries/add";
import { IgdbError } from "@/lib/igdb/types";
import { isStatus } from "@/lib/status";

function refresh(slug: string): void {
  revalidatePath("/");
  revalidatePath(`/work/${slug}`);
  revalidatePath("/version/[id]", "page");
}

/**
 * A game's DLC under it, or on the shelf as games of their own. The game's
 * setting rather than yours, as its series is: on a server with more than one
 * of you, Destiny 2's expansions are separate games for everyone or no one.
 */
export async function setDlcShown(formData: FormData): Promise<void> {
  await requireUser();
  const workId = String(formData.get("workId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!workId) return;
  await setDlcOnShelf(workId, formData.get("show") === "true");
  refresh(slug);
}

/**
 * One press of a DLC's shelf, on its game's page: onto your shelf if it was
 * not, or moved if it was, by the same rules as the version page (a play
 * recorded on arriving at Played).
 */
export async function setDlcStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");
  const status = formData.get("status");
  if (!versionId || !isStatus(status)) return;
  if (await updateEntry(user.id, versionId, { status })) {
    refresh(String(formData.get("slug") ?? ""));
    revalidatePath(`/version/${versionId}`);
  }
}

/**
 * For DLC shelved before DLC lived under its game, whose game is not here: the
 * game is brought in from IGDB (not shelved) and the DLC attaches to it.
 */
export async function bringInGame(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const parentIgdbId = Number(formData.get("parentIgdbId"));
  if (!Number.isInteger(parentIgdbId) || parentIgdbId <= 0) return;
  try {
    await addFromIgdb(user.id, { igdbId: parentIgdbId, status: null });
  } catch (err) {
    // Offline is not an error page: the button is still there to try again.
    if (!(err instanceof IgdbError)) throw err;
    return;
  }
  refresh(slug);
}

/** DLC IGDB does not list, made by hand under the game (`lib/dlc-add.ts`). */
export async function addDlcByHand(formData: FormData): Promise<void> {
  const user = await requireUser();
  const outcome = await addDlcByHandFor(user.id, formData);
  if (!outcome.ok) return;
  refresh(outcome.gameSlug);
  redirect(`/version/${outcome.versionId}`);
}
