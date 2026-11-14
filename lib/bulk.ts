import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { entries, platforms, versions, works } from "@/lib/db/schema";
import { UNPLACED_ORIGINAL } from "@/lib/igdb/mapping";
import { resolvePlatform } from "@/lib/platforms";
import { canonicalSeries, seriesInUse } from "@/lib/series";
import { isStatus, STATUS_LABELS } from "@/lib/status";
import { OTHER_PLATFORM } from "@/lib/versions/types";

/**
 * The wall's select mode, shared by its server actions and the phone's
 * `POST /entries/bulk`, so both apply the same rules and say the same things.
 * Every change is joined through entries, so a selection only ever reaches
 * your own shelf, whatever was sent.
 */

export type BulkResult = { ok: boolean; message: string };

const NOTHING: BulkResult = { ok: false, message: "Nothing selected." };

function ids(given: readonly unknown[]): string[] {
  return given.filter((value): value is string => typeof value === "string" && value !== "").slice(0, 5000);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Move every selected entry's version onto one platform.
 *
 * This writes to `versions`, which is shared: on a multi-user server it moves
 * the release for everyone, not just for you. That is the honest reading of the
 * model — what a version ran on is a fact about the release, not about your
 * shelf — and it is what the single-version edit form has always done too.
 */
export async function moveToPlatform(userId: string, given: readonly unknown[], typed: string): Promise<BulkResult> {
  const selected = ids(given);
  if (selected.length === 0) return NOTHING;
  const trimmed = typed.trim();
  const name = trimmed === "" || trimmed === OTHER_PLATFORM ? null : trimmed;

  const moved = await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        versionId: versions.id,
        kind: versions.kind,
        versionName: versions.name,
        platformName: platforms.name,
        abbreviation: platforms.abbreviation,
      })
      .from(entries)
      .innerJoin(versions, eq(versions.id, entries.versionId))
      .leftJoin(platforms, eq(platforms.id, versions.platformId))
      .where(and(eq(entries.userId, userId), inArray(entries.id, selected)));

    if (rows.length === 0) return 0;

    const platformId = await resolvePlatform(tx, name);

    // An original release is named after its platform, so moving it has to take
    // the name with it — but only where the name is still the one the platform
    // gave it, including the one it gets when there is no platform at all.
    // "N64 (PAL)" was written by someone and stays.
    const renameable = rows
      .filter(
        (row) =>
          row.kind === "original" &&
          (row.versionName === row.platformName || row.versionName === row.abbreviation || row.versionName === UNPLACED_ORIGINAL),
      )
      .map((row) => row.versionId);

    await tx
      .update(versions)
      .set({ platformId })
      .where(
        inArray(
          versions.id,
          rows.map((row) => row.versionId),
        ),
      );

    if (renameable.length > 0) {
      await tx
        .update(versions)
        .set({ name: name ?? UNPLACED_ORIGINAL })
        .where(inArray(versions.id, renameable));
    }

    return rows.length;
  });

  return { ok: true, message: `${plural(moved, "entry", "entries")} moved to ${name ?? "no platform"}.` };
}

/** Status lives on the entry, so this one really is only ever yours. */
export async function moveToShelf(userId: string, given: readonly unknown[], status: string): Promise<BulkResult> {
  const selected = ids(given);
  if (selected.length === 0) return NOTHING;
  if (!isStatus(status)) return { ok: false, message: "Pick a shelf." };

  const updated = await db
    .update(entries)
    .set({ status })
    .where(and(eq(entries.userId, userId), inArray(entries.id, selected)))
    .returning({ id: entries.id });

  return { ok: true, message: `${plural(updated.length, "entry", "entries")} moved to ${STATUS_LABELS[status]}.` };
}

/**
 * Put every selected game in one series: collecting a franchise from the wall
 * rather than one work page at a time.
 *
 * Like the platform, this writes to shared rows: a series is a fact about the
 * work, so it changes for everyone who has the game. An empty box is refused
 * rather than read as "clear", because clearing a hundred series by forgetting
 * to type is not something anyone means; the work page clears one.
 */
export async function putInSeries(userId: string, given: readonly unknown[], typed: string): Promise<BulkResult> {
  const selected = ids(given);
  if (selected.length === 0) return NOTHING;
  const name = canonicalSeries(typed.slice(0, 120), await seriesInUse());
  if (!name) return { ok: false, message: "Type a series name." };

  const rows = await db
    .selectDistinct({ workId: versions.workId })
    .from(entries)
    .innerJoin(versions, eq(versions.id, entries.versionId))
    .where(and(eq(entries.userId, userId), inArray(entries.id, selected)));

  if (rows.length > 0) {
    await db
      .update(works)
      .set({ series: name })
      .where(
        inArray(
          works.id,
          rows.map((row) => row.workId),
        ),
      );
  }

  return { ok: true, message: `${plural(rows.length, "game", "games")} put in ${name}.` };
}
