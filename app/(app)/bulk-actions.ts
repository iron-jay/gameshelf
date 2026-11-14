"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { moveToPlatform, moveToShelf, putInSeries } from "@/lib/bulk";

/** The wall's select mode; the rules are `lib/bulk.ts`, shared with the API. */

export type BulkState = { ok: boolean; message: string } | null;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function changeSelectedPlatform(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requireUser();
  const result = await moveToPlatform(user.id, formData.getAll("entryId"), text(formData, "platformName"));
  if (result.ok) revalidatePath("/");
  return result;
}

export async function changeSelectedStatus(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requireUser();
  const result = await moveToShelf(user.id, formData.getAll("entryId"), text(formData, "status"));
  if (result.ok) revalidatePath("/");
  return result;
}

export async function changeSelectedSeries(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requireUser();
  const result = await putInSeries(user.id, formData.getAll("entryId"), text(formData, "series"));
  if (result.ok) revalidatePath("/");
  return result;
}
