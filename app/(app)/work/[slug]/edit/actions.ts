"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { saveWorkDetails } from "@/lib/versions/details";

export type WorkDetailsState = { ok: boolean; message: string } | null;

/** The game's title, release date and summary (`lib/versions/details.ts`, shared with the API). */
export async function updateWorkDetails(_prev: WorkDetailsState, formData: FormData): Promise<WorkDetailsState> {
  await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const result = await saveWorkDetails(slug, formData);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath("/");
  revalidatePath(`/work/${slug}`);
  revalidatePath("/version/[id]", "page");
  revalidatePath("/series/[name]", "page");
  return { ok: true, message: result.message };
}
