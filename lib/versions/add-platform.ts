import { and, eq, sql } from "drizzle-orm";

import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { versions, works } from "@/lib/db/schema";
import { resolvePlatform } from "@/lib/platforms";
import { isRomhackWork } from "@/lib/romhacks";
import { lookupArt } from "@/lib/sgdb";
import type { PlatformKind } from "@/lib/versions/platform-kinds";

export { viaOf } from "@/lib/versions/platform-kinds";

export type AddPlatformResult =
  | { ok: true; versionId: string; existed: boolean }
  | { ok: false; message: string };

/**
 * Adds a platform a game runs on as a version of the game: the platform,
 * optionally what it runs through, and how. Nothing goes on your shelf; the
 * version's page has the shelf, as for any version.
 *
 * Not on a romhack's own game, whose versions are its ways to play and say
 * what they patch: that is "Add a way to play".
 */
export async function addPlatform(
  userId: string,
  workId: string,
  input: { platform: string; via: string | null; kind: PlatformKind },
): Promise<AddPlatformResult> {
  const platform = input.platform.trim().slice(0, 80);
  const via = input.via?.trim().slice(0, 120) || null;
  if (!platform) return { ok: false, message: "Choose or type a platform." };

  const [work] = await db.select({ id: works.id }).from(works).where(eq(works.id, workId));
  if (!work) return { ok: false, message: "That game is no longer here." };
  if (await isRomhackWork(db, workId)) {
    return { ok: false, message: "A romhack's ways to play are added with Add a way to play." };
  }

  const name = via ?? platform;

  const outcome = await db.transaction(async (tx) => {
    const platformId = (await resolvePlatform(tx, platform))!;

    // Adding the same thing twice finds the first, rather than a second copy.
    const [same] = await tx
      .select({ id: versions.id })
      .from(versions)
      .where(
        and(
          eq(versions.workId, workId),
          eq(versions.platformId, platformId),
          sql`lower(${versions.name}) = lower(${name})`,
        ),
      );
    if (same) return { versionId: same.id, existed: true };

    const [created] = await tx
      .insert(versions)
      .values({
        workId,
        name,
        kind: input.kind,
        platformId,
        source: "local",
        createdBy: userId,
      })
      .returning({ id: versions.id });
    return { versionId: created.id, existed: false };
  });

  // A community release never borrows the work's boxart (§4a), so a named
  // port looks for its own, by its own name, after the row is safely in.
  // One with no name of its own has nothing to search by and keeps the
  // placeholder.
  if (!outcome.existed && via) {
    await artFor(outcome.versionId, via).catch(() => undefined);
  }

  return { ok: true, ...outcome };
}

async function artFor(versionId: string, name: string): Promise<void> {
  const found = await lookupArt(name);
  const best = found.candidates[0];
  if (found.confidence === "none" || !best) return;

  const filename = await downloadCover(best.imageUrl, versionId);
  if (!filename) return;

  await db
    .update(versions)
    .set({
      coverUrl: `/covers/${filename}`,
      coverSource: "steamgriddb",
      coverNeedsReview: found.confidence !== "exact",
      sgdbGameId: found.sgdbGameId,
    })
    .where(eq(versions.id, versionId));
}
