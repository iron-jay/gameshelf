"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, platforms, versions, works } from "@/lib/db/schema";
import { getGameById } from "@/lib/igdb/games";
import { slugify } from "@/lib/igdb/mapping";
import { searchGames } from "@/lib/igdb/search";
import { lookupArt, SgdbNotConfiguredError } from "@/lib/sgdb";
import type {
  ArtLookupState,
  BaseGameOption,
  CreateVersionState,
} from "@/lib/versions/types";
import { isCommunityKind, isFormKind } from "@/lib/versions/types";
import { ensureWorkFromIgdb } from "@/lib/works/ensure";

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

  const platformName = optional(formData, "platformName");

  const outcome = await db.transaction(async (tx) => {
    // Matched case-insensitively by name, because the alternative is two
    // rows differing only by a capital letter. A platform IGDB has never
    // heard of is a local row, which the schema allows for exactly this.
    let platformId: number | null = null;
    if (platformName) {
      const [existing] = await tx
        .select({ id: platforms.id })
        .from(platforms)
        .where(sql`lower(${platforms.name}) = lower(${platformName})`);

      platformId =
        existing?.id ??
        (
          await tx
            .insert(platforms)
            .values({ name: platformName, source: "local" })
            .returning({ id: platforms.id })
        )[0].id;
    }

    let workId: string;
    let workSlug: string;

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
    } else if (knownWorkId) {
      const [row] = await tx
        .select({ id: works.id, slug: works.slug })
        .from(works)
        .where(eq(works.id, knownWorkId));
      if (!row) throw new Error("That work no longer exists.");
      workId = row.id;
      workSlug = row.slug;
    } else {
      const ensured = await ensureWorkFromIgdb(tx, game!, user.id);
      const [row] = await tx.select({ slug: works.slug }).from(works).where(eq(works.id, ensured.id));
      workId = ensured.id;
      workSlug = row.slug;
    }

    const [version] = await tx
      .insert(versions)
      .values({
        workId,
        name: homebrew ? "Original release" : name,
        kind: homebrew ? "original" : isCommunityKind(kind) ? kind : "other",
        platformId,
        baseVersionId: optional(formData, "baseVersionId"),
        author: optional(formData, "author"),
        versionLabel: optional(formData, "versionLabel"),
        releaseDate: optional(formData, "releaseDate"),
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

    return { workId, workSlug, versionId: version.id, homebrew };
  });

  // Art is downloaded after the transaction, for the same reason as covers on
  // add-to-shelf: failing to fetch a picture must not undo a correct row.
  if (artUrl) {
    // Homebrew art belongs to the work, because the work is the thing. A
    // community version's art belongs to the version — it must never end up on
    // the parent work, where it would become the original's cover.
    const target = outcome.homebrew ? outcome.workId : outcome.versionId;
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

      if (outcome.homebrew) {
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
