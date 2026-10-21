"use server";

import { and, asc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, versionKind, versions, works } from "@/lib/db/schema";
import { getGameById } from "@/lib/igdb/games";
import { slugify } from "@/lib/igdb/mapping";
import { searchGames } from "@/lib/igdb/search";
import { lookupArt, SgdbNotConfiguredError } from "@/lib/sgdb";
import type {
  ArtLookupState,
  BaseGameOption,
  CreateVersionState,
} from "@/lib/versions/types";
import { resolvePlatform } from "@/lib/platforms";
import { isCommunityKind, isFormKind, OTHER_PLATFORM } from "@/lib/versions/types";

function isVersionKind(value: string): value is (typeof versionKind.enumValues)[number] {
  return (versionKind.enumValues as readonly string[]).includes(value);
}
import { artForPlaced, placeIgdbGame, type Placed } from "@/lib/entries/add";
import { createRomhackWork, isRomhackWork } from "@/lib/romhacks";
import { isUuid } from "@/lib/uuid";
import { primaryPlatformFor } from "@/lib/works/ensure";

/**
 * Fired on blur of the name field while the form is still open. Nothing is
 * persisted — no draft rows, no orphan cleanup, and abandoning the form leaves
 * no trace.
 */
export async function lookupArtForName(name: string): Promise<ArtLookupState> {
  await requireUser();

  const empty: ArtLookupState = {
    confidence: "none",
    matchedName: null,
    sgdbGameId: null,
    candidates: [],
    error: null,
  };

  if (!name.trim()) return empty;

  try {
    const result = await lookupArt(name);
    return { ...result, error: null };
  } catch (err) {
    return {
      ...empty,
      error:
        err instanceof SgdbNotConfiguredError
          ? "SGDB_API_KEY is not set, so art cannot be looked up."
          : "SteamGridDB lookup failed.",
    };
  }
}

/** Inline base-game search for the door that does not already know the work. */
export async function searchBaseGames(term: string): Promise<BaseGameOption[]> {
  await requireUser();
  if (!term.trim()) return [];

  try {
    const games = await searchGames(term, 8);
    return games.map((game) => ({
      igdbId: game.id,
      title: game.name,
      year: game.first_release_date
        ? new Date(game.first_release_date * 1000).getUTCFullYear()
        : null,
    }));
  } catch {
    return [];
  }
}

function optional(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : text;
}

/**
 * The form's "Something else…" option normally swaps itself for a text box
 * before it can be submitted. With scripting off it cannot, so the sentinel has
 * to mean no platform rather than become one.
 */
function platformFrom(formData: FormData): string | null {
  const name = optional(formData, "platformName");
  return name === OTHER_PLATFORM ? null : name;
}

export async function createVersion(
  _prev: CreateVersionState,
  formData: FormData,
): Promise<CreateVersionState> {
  const user = await requireUser();

  const name = optional(formData, "name");
  const kind = formData.get("kind");

  if (!name) return { ok: false, message: "Name is required." };
  if (typeof kind !== "string" || !isFormKind(kind)) {
    return { ok: false, message: "Pick what kind of release this is." };
  }

  const knownWorkId = optional(formData, "workId");
  const baseGameIgdbId = Number(formData.get("baseGameIgdbId") ?? 0);
  const homebrew = kind === "homebrew";

  if (!homebrew && !knownWorkId && !baseGameIgdbId) {
    return { ok: false, message: "Choose the game this is based on." };
  }

  // Fetched before the transaction: a network round trip should not hold one open.
  let game = null;
  if (!homebrew && !knownWorkId && baseGameIgdbId) {
    game = await getGameById(baseGameIgdbId);
    if (!game) return { ok: false, message: "IGDB no longer has that game." };
  }

  const artUrl = optional(formData, "artUrl");
  const artSgdbGameId = Number(formData.get("artSgdbGameId") ?? 0) || null;
  const artConfidence = optional(formData, "artConfidence");

  const platformName = platformFrom(formData);

  const romhack = kind === "romhack";
  const releaseDate = optional(formData, "releaseDate");

  const outcome = await db.transaction(async (tx) => {
    let platformId = await resolvePlatform(tx, platformName);

    let workId: string;
    let workSlug: string;
    // Where art goes: the work when the work is the thing (homebrew, a
    // romhack's own game), else the version.
    let artOnWork = homebrew;
    // The original's work, for what a romhack patches.
    let baseWorkId: string | null = null;
    let placedBase: { placed: Placed; game: NonNullable<typeof game> } | null = null;

    if (!homebrew && !knownWorkId) {
      // The original arrives with its own release and no entry, as a DLC's
      // game does: it is the game, now here, and you did not shelve it.
      const placed = await placeIgdbGame(tx, user.id, game!, primaryPlatformFor(game!), null);
      placedBase = { placed, game: game! };
    }

    if (homebrew) {
      // Homebrew modifies nothing, so it is a work in its own right rather than
      // a version of something else.
      const base = slugify(name);
      const [clash] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, base));
      const [created] = await tx
        .insert(works)
        .values({
          slug: clash ? `${base}-${Date.now().toString(36)}` : base,
          title: name,
          workKind: "main_game",
          source: "local",
          createdBy: user.id,
        })
        .returning({ id: works.id, slug: works.slug });
      workId = created.id;
      workSlug = created.slug;
    } else {
      const knownId = knownWorkId ?? placedBase!.placed.workId;
      const [known] = await tx
        .select({ id: works.id, slug: works.slug, basedOnWorkId: works.basedOnWorkId })
        .from(works)
        .where(eq(works.id, knownId));
      if (!known) throw new Error("That work no longer exists.");

      if (romhack && (await isRomhackWork(tx, known.id))) {
        // Another way to play a romhack already here: Door B on its own page.
        workId = known.id;
        workSlug = known.slug;
        baseWorkId = known.basedOnWorkId;
        artOnWork = false;
      } else if (romhack) {
        // A romhack is a game of its own (2026-10-20), started from the
        // original's details and edited apart from it afterwards.
        baseWorkId = known.id;
        const created = await createRomhackWork(tx, { name, baseWorkId, releaseDate, userId: user.id });
        workId = created.id;
        workSlug = created.slug;
        artOnWork = true;
      } else {
        workId = known.id;
        workSlug = known.slug;
        baseWorkId = known.id;
      }
    }

    // Only a release of the original can be what this patches.
    let baseVersionId: string | null = null;
    const requestedBase = optional(formData, "baseVersionId");
    if (requestedBase && baseWorkId && isUuid(requestedBase)) {
      const [base] = await tx
        .select({ id: versions.id, platformId: versions.platformId })
        .from(versions)
        .where(and(eq(versions.id, requestedBase), eq(versions.workId, baseWorkId)));
      baseVersionId = base?.id ?? null;
      // A romhack plays where what it patches does, unless the form says otherwise.
      if (romhack && platformId === null) platformId = base?.platformId ?? null;
    }
    if (romhack && platformId === null && baseWorkId) {
      const [first] = await tx
        .select({ platformId: versions.platformId })
        .from(versions)
        .where(and(eq(versions.workId, baseWorkId), isNotNull(versions.platformId)))
        .orderBy(asc(versions.createdAt))
        .limit(1);
      platformId = first?.platformId ?? null;
    }

    const [version] = await tx
      .insert(versions)
      .values({
        workId,
        name: homebrew ? "Original release" : name,
        kind: homebrew ? "original" : isCommunityKind(kind) ? kind : "other",
        platformId,
        baseVersionId,
        author: optional(formData, "author"),
        versionLabel: optional(formData, "versionLabel"),
        releaseDate,
        url: optional(formData, "url"),
        notes: optional(formData, "notes"),
        source: "local",
        createdBy: user.id,
      })
      .returning({ id: versions.id });

    await tx
      .insert(entries)
      .values({ userId: user.id, versionId: version.id, status: "backlog" })
      .onConflictDoNothing();

    return { workId, workSlug, versionId: version.id, artOnWork, placedBase };
  });

  if (outcome.placedBase) {
    await artForPlaced(outcome.placedBase.placed, outcome.placedBase.game).catch(() => undefined);
  }

  // Art is downloaded after the transaction, for the same reason as covers on
  // add-to-shelf: failing to fetch a picture must not undo a correct row.
  if (artUrl) {
    // Art belongs to the work when the work is the thing. A community
    // version's art belongs to the version — it must never end up on the
    // original's work, where it would become the original's cover.
    const target = outcome.artOnWork ? outcome.workId : outcome.versionId;
    const filename = await downloadCover(artUrl, target);

    if (filename) {
      const patch = {
        coverUrl: `/covers/${filename}`,
        coverSource: "steamgriddb" as const,
        // Section 4a: a fuzzy match is applied but flagged, so it can be found
        // again through the "covers needing review" filter.
        coverNeedsReview: artConfidence !== "exact",
        sgdbGameId: artSgdbGameId,
      };

      if (outcome.artOnWork) {
        await db.update(works).set(patch).where(eq(works.id, outcome.workId));
      } else {
        await db.update(versions).set(patch).where(eq(versions.id, outcome.versionId));
      }
    }
  }

  revalidatePath("/");
  revalidatePath(`/work/${outcome.workSlug}`);

  return { ok: true, message: "Added to your shelf", workSlug: outcome.workSlug };
}

/**
 * Edit a version's own details. Deliberately does not move it to a different
 * work: that is not an edit, it is a different version of a different game.
 *
 * Any signed-in user can edit, the same as any of them can add one. It is your
 * server — section 5 is explicit that there is no approval step.
 */
export async function updateVersion(
  _prev: CreateVersionState,
  formData: FormData,
): Promise<CreateVersionState> {
  await requireUser();

  const versionId = optional(formData, "versionId");
  const name = optional(formData, "name");
  const kind = formData.get("kind");

  if (!versionId) return { ok: false, message: "Bad request." };
  if (!name) return { ok: false, message: "Name is required." };
  if (typeof kind !== "string" || !isVersionKind(kind)) {
    return { ok: false, message: "Pick what kind of release this is." };
  }

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

  const requestedBase = optional(formData, "baseVersionId");
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

  const platformName = platformFrom(formData);

  const workSlug = await db.transaction(async (tx) => {
    const platformId = await resolvePlatform(tx, platformName);

    await tx
      .update(versions)
      .set({
        name,
        kind,
        platformId,
        baseVersionId,
        author: optional(formData, "author"),
        versionLabel: optional(formData, "versionLabel"),
        releaseDate: optional(formData, "releaseDate"),
        url: optional(formData, "url"),
        notes: optional(formData, "notes"),
      })
      .where(eq(versions.id, versionId));

    const [work] = await tx
      .select({ slug: works.slug })
      .from(works)
      .where(eq(works.id, existing.workId));

    return work.slug;
  });

  revalidatePath("/");
  revalidatePath(`/version/${versionId}`);
  revalidatePath(`/work/${workSlug}`);

  return { ok: true, message: "Saved", workSlug };
}
