"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { sortTitleFor } from "@/lib/igdb/mapping";

export type WorkDetailsState = { ok: boolean; message: string } | null;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function text(formData: FormData, field: string, max: number): string | null {
  const value = String(formData.get(field) ?? "").trim().slice(0, max);
  return value === "" ? null : value;
}

/**
 * A game's own details: its title, release date and summary. Mostly wanted
 * for romhacks, which start from their original's and are their own after
 * that (2026-10-20), but any game can be put right here. The slug stays, so
 * links and bookmarks keep working after a rename.
 */
export async function updateWorkDetails(_prev: WorkDetailsState, formData: FormData): Promise<WorkDetailsState> {
  await requireUser();

  const slug = String(formData.get("slug") ?? "");
  const title = text(formData, "title", 500);
  const releaseDate = text(formData, "releaseDate", 10);
  if (!slug) return { ok: false, message: "Bad request." };
  if (!title) return { ok: false, message: "The title is required." };
  if (releaseDate && !DAY.test(releaseDate)) return { ok: false, message: "That release date is not a date." };

  const [updated] = await db
    .update(works)
    .set({
      title,
      sortTitle: sortTitleFor(title),
      firstReleaseDate: releaseDate,
      summary: text(formData, "summary", 50_000),
    })
    .where(eq(works.slug, slug))
    .returning({ id: works.id });
  if (!updated) return { ok: false, message: "That game no longer exists." };

  revalidatePath("/");
  revalidatePath(`/work/${slug}`);
  revalidatePath("/version/[id]", "page");
  revalidatePath("/series/[name]", "page");

  return { ok: true, message: "Saved" };
}
