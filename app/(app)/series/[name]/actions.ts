"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { canonicalSeries, seriesHref, seriesInUse } from "@/lib/series";

function revalidateSeries() {
  revalidatePath("/series/[name]", "page");
  revalidatePath("/work/[slug]", "page");
  revalidatePath("/version/[id]", "page");
  revalidatePath("/");
}

/**
 * Renames a series on every game in it. Renaming to a series that already
 * exists joins the two, the same case-insensitive match the series box makes;
 * the series' own name is left out of that match so "zelda" can become "Zelda".
 */
export async function renameSeries(formData: FormData): Promise<void> {
  await requireUser();

  const from = String(formData.get("from") ?? "");
  const typed = String(formData.get("to") ?? "").slice(0, 120);
  const others = (await seriesInUse()).filter((name) => name !== from);
  const to = canonicalSeries(typed, others);
  if (!from || !to) redirect(seriesHref(from));

  await db.update(works).set({ series: to }).where(eq(works.series, from));

  revalidateSeries();
  redirect(seriesHref(to));
}

/**
 * Takes every game out of a series. The games and your entries stay where they
 * are: a series is only a name on them, so removing it removes the name.
 */
export async function removeSeries(formData: FormData): Promise<void> {
  await requireUser();

  const name = String(formData.get("name") ?? "");
  if (name) await db.update(works).set({ series: null }).where(eq(works.series, name));

  revalidateSeries();
  redirect("/");
}

/** Takes one game out of a series; the last one out takes the series with it. */
export async function takeOutOfSeries(formData: FormData): Promise<void> {
  await requireUser();

  const name = String(formData.get("name") ?? "");
  const workId = String(formData.get("workId") ?? "");
  if (!name || !workId) return;

  await db
    .update(works)
    .set({ series: null })
    .where(and(eq(works.id, workId), eq(works.series, name)));

  revalidateSeries();

  const [left] = await db.select({ n: count() }).from(works).where(eq(works.series, name));
  if (!left || left.n === 0) redirect("/");
}
