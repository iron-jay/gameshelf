"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entries, logStatus, platforms, versions } from "@/lib/db/schema";
import { UNPLACED_ORIGINAL } from "@/lib/igdb/mapping";
import { resolvePlatform } from "@/lib/platforms";
import { OTHER_PLATFORM } from "@/lib/versions/types";

export type BulkState = { ok: boolean; message: string } | null;

type Status = (typeof logStatus.enumValues)[number];

function selectedIds(formData: FormData): string[] {
  return formData
    .getAll("entryId")
    .filter((value): value is string => typeof value === "string" && value !== "");
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
export async function changeSelectedPlatform(
  _prev: BulkState,
  formData: FormData,
): Promise<BulkState> {
  const user = await requireUser();

  const ids = selectedIds(formData);
  if (ids.length === 0) return { ok: false, message: "Nothing selected." };

  const raw = formData.get("platformName");
  const typed = typeof raw === "string" ? raw.trim() : "";
  const name = typed === "" || typed === OTHER_PLATFORM ? null : typed;

  const moved = await db.transaction(async (tx) => {
    // Joined through entries so the selection can only ever reach your own
    // shelf, whatever the form was talked into submitting.
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
      .where(and(eq(entries.userId, user.id), inArray(entries.id, ids)));

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
          (row.versionName === row.platformName ||
            row.versionName === row.abbreviation ||
            row.versionName === UNPLACED_ORIGINAL),
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

  revalidatePath("/");

  return {
    ok: true,
    message: `${plural(moved, "entry", "entries")} moved to ${name ?? "no platform"}.`,
  };
}

/** Status lives on the entry, so this one really is only ever yours. */
export async function changeSelectedStatus(
  _prev: BulkState,
  formData: FormData,
): Promise<BulkState> {
  const user = await requireUser();

  const ids = selectedIds(formData);
  if (ids.length === 0) return { ok: false, message: "Nothing selected." };

  const status = formData.get("status");
  if (typeof status !== "string" || !(logStatus.enumValues as readonly string[]).includes(status)) {
    return { ok: false, message: "Pick a status." };
  }

  const updated = await db
    .update(entries)
    .set({ status: status as Status })
    .where(and(eq(entries.userId, user.id), inArray(entries.id, ids)))
    .returning({ id: entries.id });

  revalidatePath("/");

  return { ok: true, message: `${plural(updated.length, "entry", "entries")} moved to ${status}.` };
}
