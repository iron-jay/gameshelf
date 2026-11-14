import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { downloadCover, extensionFor, MAX_UPLOAD_BYTES, removeCover, saveCoverBytes } from "@/lib/covers";
import { db } from "@/lib/db";
import { isCommunityVersionKind, versions, works } from "@/lib/db/schema";
import { gameNameFor, gridsForGame, parseSgdbReference, SgdbError } from "@/lib/sgdb";
import type { ArtTarget } from "@/lib/versions/types";
import { isUuid } from "@/lib/uuid";

/**
 * What the art page (`/work/{slug}/art`) does, shared by its server actions and
 * the phone's `/art` routes, so both apply the same rules and say the same
 * things (§4a).
 */

export type ArtResult = { ok: boolean; message: string };

export type ResolvedArt = {
  target: ArtTarget;
  workSlug: string;
  /** The filename currently in use, so a superseded file can be removed. */
  currentFile: string | null;
};

/**
 * Resolves and re-validates the target. A slug and an optional version id; a
 * version that does not belong to that work is rejected rather than trusted.
 */
export async function resolveArt(slug: string, versionId: string | null): Promise<ResolvedArt | null> {
  const [work] = await db
    .select({ id: works.id, slug: works.slug, coverUrl: works.coverUrl })
    .from(works)
    .where(eq(works.slug, slug));
  if (!work) return null;

  if (!versionId) {
    return { target: { kind: "work", id: work.id }, workSlug: work.slug, currentFile: work.coverUrl?.split("/").pop() ?? null };
  }
  if (!isUuid(versionId)) return null;
  const [version] = await db
    .select({ id: versions.id, coverUrl: versions.coverUrl })
    .from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.workId, work.id)));
  if (!version) return null;
  return { target: { kind: "version", id: version.id }, workSlug: work.slug, currentFile: version.coverUrl?.split("/").pop() ?? null };
}

/**
 * The art page's state. A community release searches on its own name: the
 * parent work's title returns the original's boxart, which looks correct and
 * is wrong (§4a).
 */
export async function artState(slug: string, versionId: string | null) {
  const [work] = await db.select().from(works).where(eq(works.slug, slug));
  if (!work) return null;
  if (!versionId) {
    return { title: work.title, versionName: null, coverUrl: work.coverUrl, needsReview: work.coverNeedsReview, seedTitle: work.title };
  }
  if (!isUuid(versionId)) return null;
  const [version] = await db
    .select()
    .from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.workId, work.id)));
  if (!version) return null;
  return {
    title: work.title,
    versionName: version.name,
    coverUrl: version.coverUrl,
    needsReview: version.coverNeedsReview,
    seedTitle: isCommunityVersionKind(version.kind) ? version.name : work.title,
  };
}

type Patch = {
  coverSource: "steamgriddb" | "upload";
  coverNeedsReview: boolean;
  sgdbGameId?: number | null;
};

async function applyPatch(resolved: ResolvedArt, filename: string, patch: Patch) {
  const values = { ...patch, coverUrl: `/covers/${filename}` };
  if (resolved.target.kind === "work") {
    await db.update(works).set(values).where(eq(works.id, resolved.target.id));
  } else {
    await db.update(versions).set(values).where(eq(versions.id, resolved.target.id));
  }
  // A new file with a different extension would otherwise leave the old one
  // behind for good.
  if (resolved.currentFile && resolved.currentFile !== filename) await removeCover(resolved.currentFile);

  revalidatePath("/");
  revalidatePath(`/work/${resolved.workSlug}`);
}

/** Apply a grid picked out of the results. Choosing by hand is the review (§4a). */
export async function applyGrid(resolved: ResolvedArt, imageUrl: string, sgdbGameId: number | null): Promise<ArtResult> {
  if (!imageUrl) return { ok: false, message: "Pick a cover first." };
  const filename = await downloadCover(imageUrl, resolved.target.id);
  if (!filename) return { ok: false, message: "That image could not be downloaded." };
  await applyPatch(resolved, filename, { coverSource: "steamgriddb", coverNeedsReview: false, sgdbGameId });
  return { ok: true, message: "Cover updated." };
}

/** Apply art from a pasted SteamGridDB URL or game id. */
export async function applyReference(resolved: ResolvedArt, reference: string): Promise<ArtResult> {
  const sgdbGameId = parseSgdbReference(reference);
  if (!sgdbGameId) return { ok: false, message: "Paste a SteamGridDB game URL or a numeric game id." };
  try {
    const name = (await gameNameFor(sgdbGameId)) ?? `SteamGridDB ${sgdbGameId}`;
    // Adult filters off: the id was supplied deliberately.
    const best = (await gridsForGame(sgdbGameId, name, true))[0];
    if (!best) return { ok: false, message: `SteamGridDB has no grids for game ${sgdbGameId}.` };
    const filename = await downloadCover(best.imageUrl, resolved.target.id);
    if (!filename) return { ok: false, message: "That image could not be downloaded." };
    await applyPatch(resolved, filename, { coverSource: "steamgriddb", coverNeedsReview: false, sgdbGameId });
    return { ok: true, message: `Cover taken from ${name}.` };
  } catch (err) {
    return { ok: false, message: err instanceof SgdbError ? "SteamGridDB request failed." : "Could not apply that." };
  }
}

/** Apply an uploaded image. */
export async function uploadArtBytes(resolved: ResolvedArt, bytes: ArrayBuffer, type: string): Promise<ArtResult> {
  if (bytes.byteLength === 0) return { ok: false, message: "Choose an image file." };
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, message: "That file is larger than 8 MB." };
  if (!extensionFor(type)) return { ok: false, message: "Only JPEG, PNG and WebP are accepted." };
  const filename = await saveCoverBytes(bytes, type, resolved.target.id);
  if (!filename) return { ok: false, message: "That file could not be saved." };
  // sgdbGameId is left alone: an upload does not invalidate a match someone
  // made earlier, and a later refresh should still reuse it.
  await applyPatch(resolved, filename, { coverSource: "upload", coverNeedsReview: false });
  return { ok: true, message: "Cover uploaded." };
}
