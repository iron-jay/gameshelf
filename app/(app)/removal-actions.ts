"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { versions, works } from "@/lib/db/schema";
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

export async function deleteVersion(formData: FormData): Promise<void> {
  await requireUser();

  const versionId = String(formData.get("versionId") ?? "");
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

  const workId = String(formData.get("workId") ?? "");
  const removal = await inspectWorkRemoval(workId);
  if (!removal) redirect("/");

  await db.delete(works).where(eq(works.id, workId));
  await removeCoverFiles(removal.coverFiles);

  revalidatePath("/");
  redirect("/");
}
