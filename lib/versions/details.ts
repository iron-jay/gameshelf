import { and, asc, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { platforms, versionKind, versions, works } from "@/lib/db/schema";
import { sortTitleFor } from "@/lib/igdb/mapping";
import { platformsInUse, resolvePlatform } from "@/lib/platforms";
import { isUuid } from "@/lib/uuid";

import { KIND_LABELS, OTHER_PLATFORM, type FormKind } from "./types";

/**
 * The two edit pages, `/work/{slug}/edit` and `/version/{id}/edit`: loading
 * and saving, shared by their server actions and the phone's `/details`
 * routes so both say and refuse the same things.
 */

export type SaveResult = { ok: boolean; message: string; workSlug?: string };

function optional(form: FormData, field: string): string | null {
  const value = form.get(field);
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : text;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real day: the shape alone lets 1998-13-01 through to Postgres, which refuses it with a 500. */
function isDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * A game's own details: its title, release date and summary. Mostly wanted
 * for romhacks, which start from their original's and are their own after
 * that (2026-10-20), but any game can be put right here. The slug stays, so
 * links and bookmarks keep working after a rename.
 */
export async function saveWorkDetails(slug: string, form: FormData): Promise<SaveResult> {
  const text = (field: string, max: number) => optional(form, field)?.slice(0, max) ?? null;
  const title = text("title", 500);
  const releaseDate = text("releaseDate", 10);
  if (!slug) return { ok: false, message: "Bad request." };
  if (!title) return { ok: false, message: "The title is required." };
  if (releaseDate && !isDay(releaseDate)) return { ok: false, message: "That release date is not a date." };

  const [updated] = await db
    .update(works)
    .set({ title, sortTitle: sortTitleFor(title), firstReleaseDate: releaseDate, summary: text("summary", 50_000) })
    .where(eq(works.slug, slug))
    .returning({ id: works.id });
  if (!updated) return { ok: false, message: "That game no longer exists." };
  return { ok: true, message: "Saved", workSlug: slug };
}

export async function workDetailsValues(slug: string) {
  const [work] = await db
    .select({ title: works.title, releaseDate: works.firstReleaseDate, summary: works.summary })
    .from(works)
    .where(eq(works.slug, slug));
  return work ? { title: work.title, releaseDate: work.releaseDate ?? "", summary: work.summary ?? "" } : null;
}

function isVersionKind(value: string): value is (typeof versionKind.enumValues)[number] {
  return (versionKind.enumValues as readonly string[]).includes(value);
}

/**
 * The form's "Something else…" option normally swaps itself for a text box
 * before it can be submitted. With scripting off it cannot, so the sentinel has
 * to mean no platform rather than become one.
 */
function platformFrom(form: FormData): string | null {
  const name = optional(form, "platformName");
  return name === OTHER_PLATFORM ? null : name;
}

/** A version's own details, from the edit form's fields (`versionId` among them). */
export async function saveVersionDetails(form: FormData): Promise<SaveResult> {
  const versionId = optional(form, "versionId");
  const name = optional(form, "name");
  const kind = form.get("kind");

  if (!versionId || !isUuid(versionId)) return { ok: false, message: "Bad request." };
  if (!name) return { ok: false, message: "Name is required." };
  if (typeof kind !== "string" || !isVersionKind(kind)) return { ok: false, message: "Pick what kind of release this is." };

  const [existing] = await db
    .select({ id: versions.id, workId: versions.workId, kind: versions.kind, basedOnWorkId: works.basedOnWorkId })
    .from(versions)
    .innerJoin(works, eq(works.id, versions.workId))
    .where(eq(versions.id, versionId));
  if (!existing) return { ok: false, message: "That version no longer exists." };

  // A romhack is a game of its own, so being one is not an edit: turning a
  // translation into one, or one into a port, would be a different game.
  if ((existing.kind === "romhack") !== (kind === "romhack")) {
    return { ok: false, message: "A romhack is a game of its own, so it cannot become another kind or be made from one." };
  }

  const requestedBase = optional(form, "baseVersionId");
  let baseVersionId: string | null = null;
  // A romhack patches a release of its original; anything else, a sibling.
  const baseWorkId = existing.kind === "romhack" ? existing.basedOnWorkId : existing.workId;
  if (requestedBase && requestedBase !== versionId && baseWorkId && isUuid(requestedBase)) {
    // Never itself — the schema forbids it — and never another game's.
    const [sibling] = await db
      .select({ id: versions.id })
      .from(versions)
      .where(and(eq(versions.id, requestedBase), eq(versions.workId, baseWorkId)));
    baseVersionId = sibling?.id ?? null;
  }

  const releaseDate = optional(form, "releaseDate");
  if (releaseDate && !isDay(releaseDate)) return { ok: false, message: "That release date is not a date." };

  const platformName = platformFrom(form);
  const workSlug = await db.transaction(async (tx) => {
    const platformId = await resolvePlatform(tx, platformName);
    await tx
      .update(versions)
      .set({
        name,
        kind,
        platformId,
        baseVersionId,
        author: optional(form, "author"),
        versionLabel: optional(form, "versionLabel"),
        releaseDate,
        url: optional(form, "url"),
        notes: optional(form, "notes"),
      })
      .where(eq(versions.id, versionId));
    const [work] = await tx.select({ slug: works.slug }).from(works).where(eq(works.id, existing.workId));
    return work.slug;
  });
  return { ok: true, message: "Saved", workSlug };
}

/** What a kind is called on the form: the community ones by name, the rest as written. */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind as FormKind] ?? kind.replace(/_/g, " ");
}

/** `/version/{id}/edit` as data: the fields, and the choices for kind, platform and base. */
export async function versionEditForm(versionId: string) {
  if (!isUuid(versionId)) return null;
  const [row] = await db
    .select({ version: versions, workSlug: works.slug, workTitle: works.title, basedOnWorkId: works.basedOnWorkId, platformName: platforms.name })
    .from(versions)
    .innerJoin(works, eq(works.id, versions.workId))
    .leftJoin(platforms, eq(platforms.id, versions.platformId))
    .where(eq(versions.id, versionId));
  if (!row) return null;

  // Siblings only, and never itself; a romhack's base is a release of its original.
  const romhack = row.version.kind === "romhack";
  const baseWorkId = romhack ? row.basedOnWorkId : row.version.workId;
  const siblings = baseWorkId
    ? await db
        .select({ id: versions.id, name: versions.name })
        .from(versions)
        .where(and(eq(versions.workId, baseWorkId), ne(versions.id, row.version.id)))
        .orderBy(asc(versions.createdAt))
    : [];
  // Every kind, not just the community ones, except a romhack, which is a
  // game of its own rather than a kind of release of this one.
  const kinds = romhack ? ["romhack"] : versionKind.enumValues.filter((value) => value !== "romhack");

  return {
    workSlug: row.workSlug,
    workTitle: row.workTitle,
    values: {
      name: row.version.name,
      kind: row.version.kind,
      platformName: row.platformName ?? "",
      author: row.version.author ?? "",
      versionLabel: row.version.versionLabel ?? "",
      releaseDate: row.version.releaseDate ?? "",
      url: row.version.url ?? "",
      notes: row.version.notes ?? "",
      baseVersionId: row.version.baseVersionId ?? "",
    },
    kinds: kinds.map((value) => ({ value, label: kindLabel(value) })),
    platforms: await platformsInUse(),
    siblings,
  };
}
