"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { addFromIgdb } from "@/lib/entries/add";
import { readGameDraft } from "@/lib/entries/draft";
import { IgdbError } from "@/lib/igdb/types";
import { isStatus, type Status } from "@/lib/status";

export type ReviewState = { message: string } | null;

/**
 * Art from the form is downloaded by the server, so only SteamGridDB's own
 * image hosts are taken: the form offers nothing else, and a free address
 * would be the server fetching whatever it is told to.
 */
function artFrom(formData: FormData): { url: string; sgdbGameId: number | null } | undefined {
  const raw = formData.get("artUrl");
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !/(^|\.)steamgriddb\.com$/.test(url.hostname)) return undefined;
    return { url: url.toString(), sgdbGameId: Number(formData.get("artSgdbGameId")) || null };
  } catch {
    return undefined;
  }
}

/**
 * The add, once its details have been looked over. Nothing before this
 * wrote anything; Cancel on the page is a plain link away.
 */
export async function addReviewed(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const user = await requireUser();

  const igdbId = Number(formData.get("igdbId"));
  if (!Number.isInteger(igdbId) || igdbId <= 0) return { message: "Bad request." };

  const asked = formData.get("status");
  const status: Status = isStatus(asked) ? asked : "backlog";

  // A game already here sends no details: it keeps its own, which its Edit
  // details page changes.
  let draft;
  if (formData.has("title")) {
    const read = readGameDraft((field) => formData.get(field));
    if (!read.ok) return { message: read.message };
    draft = read.draft;
  }

  let result;
  try {
    result = await addFromIgdb(user.id, {
      igdbId,
      platformId: Number(formData.get("platformId")) || null,
      status,
      draft,
      art: artFrom(formData),
    });
  } catch (err) {
    if (!(err instanceof IgdbError)) throw err;
    return { message: `IGDB request failed (${err.status ?? "no response"}). Nothing was added.` };
  }
  if (result.kind === "gone") return { message: "IGDB no longer has that game." };

  revalidatePath("/");

  if (formData.get("then") === "art") {
    const [work] = await db.select({ slug: works.slug }).from(works).where(eq(works.id, result.workId));
    if (work) redirect(`/work/${work.slug}/art`);
  }
  redirect(`/version/${result.versionId}`);
}
