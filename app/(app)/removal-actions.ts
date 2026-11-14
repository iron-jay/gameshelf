"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/uuid";
import { deleteFromVersion as removeFromVersion, deleteWork as removeWork } from "@/lib/works/removal";

/**
 * Both of these read the art filenames before deleting anything, because once
 * the rows are gone there is nothing left to say which files belonged to them.
 * The files go afterwards: a failed unlink should not undo a delete the user
 * confirmed, it should just leave a file for the sweep to find.
 */

/**
 * Delete on a version's page: the whole game unless "Just this version" was
 * chosen. The last version of a game always takes the game with it, since a
 * work never stands without one.
 */
export async function deleteFromVersion(formData: FormData): Promise<void> {
  await requireUser();

  const versionId = String(formData.get("versionId") ?? "");
  if (!isUuid(versionId)) redirect("/");

  const result = await removeFromVersion(versionId, formData.get("scope") === "version" ? "version" : "work");
  revalidatePath("/");
  revalidatePath("/off-shelf");
  if (result?.deleted === "version") {
    revalidatePath(`/work/${result.workSlug}`);
    redirect(`/work/${result.workSlug}`);
  }
  redirect("/");
}

export async function deleteWork(formData: FormData): Promise<void> {
  await requireUser();
  // Deleting from the list of games not on your shelf goes back to the list.
  const back = formData.get("from") === "off-shelf" ? "/off-shelf" : "/";
  const workId = String(formData.get("workId") ?? "");
  if (isUuid(workId)) await removeWork(workId);

  revalidatePath("/");
  revalidatePath("/off-shelf");
  redirect(back);
}
