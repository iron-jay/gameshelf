"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { versions, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";
import {
  inspectVersionRemoval,
  inspectWorkRemoval,
  removeCoverFiles,
} from "@/lib/works/removal";

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
  const [version] = await db
    .select({ workId: versions.workId })
    .from(versions)
    .where(eq(versions.id, versionId));
  if (!version) redirect("/");

  const [siblings] = await db
    .select({ total: count() })
    .from(versions)
    .where(eq(versions.workId, version.workId));

  if (formData.get("scope") === "version" && siblings.total > 1) {
    await removeVersion(versionId);
  } else {
    await removeWork(version.workId);
  }
}

async function removeVersion(versionId: string): Promise<void> {
  const removal = await inspectVersionRemoval(versionId);
  if (!removal) redirect("/");

  const [version] = await db
    .select({ workId: versions.workId })
    .from(versions)
    .where(eq(versions.id, versionId));

  const [work] = await db
    .select({ slug: works.slug })
    .from(works)
    .where(eq(works.id, version.workId));

  await db.delete(versions).where(eq(versions.id, versionId));
  await removeCoverFiles(removal.coverFiles);

  revalidatePath("/");
  revalidatePath(`/work/${work.slug}`);
  redirect(`/work/${work.slug}`);
}

export async function deleteWork(formData: FormData): Promise<void> {
  await requireUser();
  // Deleting from the list of games not on your shelf goes back to the list.
  const back = formData.get("from") === "off-shelf" ? "/off-shelf" : "/";
  await removeWork(String(formData.get("workId") ?? ""), back);
}

async function removeWork(workId: string, back = "/"): Promise<void> {
  const removal = await inspectWorkRemoval(workId);
  if (!removal) redirect("/");

  await db.delete(works).where(eq(works.id, workId));
  await removeCoverFiles(removal.coverFiles);

  revalidatePath("/");
  revalidatePath("/off-shelf");
  redirect(back);
}
