"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import {
  removeSeries as removeNamed,
  renameSeries as renameTo,
  seriesHref,
  takeOutOfSeries as takeOut,
} from "@/lib/series";

function revalidateSeries() {
  revalidatePath("/series/[name]", "page");
  revalidatePath("/work/[slug]", "page");
  revalidatePath("/version/[id]", "page");
  revalidatePath("/");
}

/** Renames, or joins the series of that name (lib/series.ts). */
export async function renameSeries(formData: FormData): Promise<void> {
  await requireUser();

  const from = String(formData.get("from") ?? "");
  const to = await renameTo(from, String(formData.get("to") ?? ""));
  if (!to) redirect(seriesHref(from));

  revalidateSeries();
  redirect(seriesHref(to));
}

/** Takes every game out of a series; the games and your entries stay. */
export async function removeSeries(formData: FormData): Promise<void> {
  await requireUser();
  await removeNamed(String(formData.get("name") ?? ""));
  revalidateSeries();
  redirect("/");
}

/** Takes one game out of a series; the last one out takes the series with it. */
export async function takeOutOfSeries(formData: FormData): Promise<void> {
  await requireUser();

  const name = String(formData.get("name") ?? "");
  const workId = String(formData.get("workId") ?? "");
  if (!name || !workId) return;

  const left = await takeOut(name, workId);
  revalidateSeries();
  if (left === 0) redirect("/");
}
