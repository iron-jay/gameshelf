"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  downloadCover,
  extensionFor,
  MAX_UPLOAD_BYTES,
  removeCover,
  saveCoverBytes,
} from "@/lib/covers";
import { db } from "@/lib/db";
import { versions, works } from "@/lib/db/schema";
import type { ArtCandidate } from "@/lib/sgdb";
import { gameNameFor, gridsForGame, lookupArt, parseSgdbReference, SgdbError } from "@/lib/sgdb";
import type { ArtActionState, ArtTarget } from "@/lib/versions/types";

type Resolved = {
  target: ArtTarget;
  workSlug: string;
  /** The filename currently in use, so a superseded file can be removed. */
  currentFile: string | null;
};

/**
 * Resolves and re-validates the target. The client sends a slug and an optional
 * version id; a version that does not belong to that work is rejected rather
 * than trusted.
 */
async function resolve(slug: string, versionId: string | null): Promise<Resolved | null> {
  const [work] = await db
    .select({ id: works.id, slug: works.slug, coverUrl: works.coverUrl })
    .from(works)
    .where(eq(works.slug, slug));

  if (!work) return null;

  if (!versionId) {
    return {
      target: { kind: "work", id: work.id },
      workSlug: work.slug,
      currentFile: work.coverUrl?.split("/").pop() ?? null,
    };
  }

  const [version] = await db
    .select({ id: versions.id, coverUrl: versions.coverUrl })
    .from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.workId, work.id)));

  if (!version) return null;

  return {
    target: { kind: "version", id: version.id },
    workSlug: work.slug,
    currentFile: version.coverUrl?.split("/").pop() ?? null,
  };
}

type Patch = {
  coverUrl: string;
  coverSource: "steamgriddb" | "upload";
  coverNeedsReview: boolean;
  sgdbGameId?: number | null;
};

async function applyPatch(resolved: Resolved, filename: string, patch: Omit<Patch, "coverUrl">) {
  const values = { ...patch, coverUrl: `/covers/${filename}` };

  if (resolved.target.kind === "work") {
    await db.update(works).set(values).where(eq(works.id, resolved.target.id));
  } else {
    await db.update(versions).set(values).where(eq(versions.id, resolved.target.id));
  }

  // A new file with a different extension would otherwise leave the old one
  // behind for good.
  if (resolved.currentFile && resolved.currentFile !== filename) {
    await removeCover(resolved.currentFile);
  }

  revalidatePath("/");
  revalidatePath(`/work/${resolved.workSlug}`);
}

export async function searchArt(term: string, includeAdult: boolean): Promise<ArtCandidate[]> {
  await requireUser();
  if (!term.trim()) return [];

  try {
    const result = await lookupArt(term, includeAdult);
    return result.candidates;
  } catch {
    return [];
  }
}

/** Apply a grid the user picked out of the results. */
export async function applyArt(_prev: ArtActionState, formData: FormData): Promise<ArtActionState> {
  await requireUser();

  const slug = String(formData.get("slug") ?? "");
  const versionId = (formData.get("versionId") as string) || null;
  const imageUrl = String(formData.get("imageUrl") ?? "");
  const sgdbGameId = Number(formData.get("sgdbGameId") ?? 0) || null;

  const resolved = await resolve(slug, versionId);
  if (!resolved) return { ok: false, message: "That no longer exists." };
  if (!imageUrl) return { ok: false, message: "Pick a cover first." };

  const filename = await downloadCover(imageUrl, resolved.target.id);
  if (!filename) return { ok: false, message: "That image could not be downloaded." };

  // Choosing by hand is the review. Section 4a.
  await applyPatch(resolved, filename, {
    coverSource: "steamgriddb",
    coverNeedsReview: false,
    sgdbGameId,
  });

  return { ok: true, message: "Cover updated." };
}

/** Apply art from a pasted SteamGridDB URL or game id. */
export async function applyArtFromReference(
  _prev: ArtActionState,
  formData: FormData,
): Promise<ArtActionState> {
  await requireUser();

  const slug = String(formData.get("slug") ?? "");
  const versionId = (formData.get("versionId") as string) || null;
  const reference = String(formData.get("reference") ?? "");

  const resolved = await resolve(slug, versionId);
  if (!resolved) return { ok: false, message: "That no longer exists." };

  const sgdbGameId = parseSgdbReference(reference);
  if (!sgdbGameId) {
    return { ok: false, message: "Paste a SteamGridDB game URL or a numeric game id." };
  }

  try {
    const name = (await gameNameFor(sgdbGameId)) ?? `SteamGridDB ${sgdbGameId}`;
    // Adult filters off: the id was supplied deliberately.
    const candidates = await gridsForGame(sgdbGameId, name, true);
    const best = candidates[0];
    if (!best) return { ok: false, message: `SteamGridDB has no grids for game ${sgdbGameId}.` };

    const filename = await downloadCover(best.imageUrl, resolved.target.id);
    if (!filename) return { ok: false, message: "That image could not be downloaded." };

    await applyPatch(resolved, filename, {
      coverSource: "steamgriddb",
      coverNeedsReview: false,
      sgdbGameId,
    });

    return { ok: true, message: `Cover taken from ${name}.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof SgdbError ? "SteamGridDB request failed." : "Could not apply that.",
    };
  }
}

/** Apply a file the user uploaded directly. */
export async function uploadArt(
  _prev: ArtActionState,
  formData: FormData,
): Promise<ArtActionState> {
  await requireUser();

  const slug = String(formData.get("slug") ?? "");
  const versionId = (formData.get("versionId") as string) || null;
  const file = formData.get("file");

  const resolved = await resolve(slug, versionId);
  if (!resolved) return { ok: false, message: "That no longer exists." };

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose an image file." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "That file is larger than 8 MB." };
  }
  if (!extensionFor(file.type)) {
    return { ok: false, message: "Only JPEG, PNG and WebP are accepted." };
  }

  const filename = await saveCoverBytes(await file.arrayBuffer(), file.type, resolved.target.id);
  if (!filename) return { ok: false, message: "That file could not be saved." };

  // sgdbGameId is left alone: an upload does not invalidate a match someone
  // made earlier, and a later refresh should still reuse it.
  await applyPatch(resolved, filename, { coverSource: "upload", coverNeedsReview: false });

  return { ok: true, message: "Cover uploaded." };
}
