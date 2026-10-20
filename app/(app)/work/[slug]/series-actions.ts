"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { canonicalSeries, seriesInUse } from "@/lib/series";

/** What was stored, so the form can say "Saved" for exactly that. */
export type SeriesSaved = { saved: string | null } | null;

/**
 * Sets or clears a work's series.
 *
 * Any signed-in user can, the same as any of them can add a version: §5 is
 * explicit that there is no approval step on your own server. The series is a
 * fact about the work, so this changes it for everyone who has it shelved —
 * which is the honest reading, and what the platform field already does.
 */
export async function setSeries(_prev: SeriesSaved, formData: FormData): Promise<SeriesSaved> {
  await requireUser();

  const slug = String(formData.get("slug") ?? "");
  if (!slug) return null;

  const typed = String(formData.get("series") ?? "").slice(0, 120);
  const name = canonicalSeries(typed, await seriesInUse());

  await db
    .update(works)
    .set({ series: name === "" ? null : name })
    .where(eq(works.slug, slug));

  revalidatePath(`/work/${slug}`);
  // Set from a version's page as well, and shown on the series pages.
  revalidatePath("/version/[id]", "page");
  revalidatePath("/series/[name]", "page");
  // The shelf can sort by it, so the sorted view is stale now too.
  revalidatePath("/");

  return { saved: name === "" ? null : name };
}
