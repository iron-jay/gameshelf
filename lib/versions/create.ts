import { and, asc, eq, isNotNull } from "drizzle-orm";

import { downloadCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, versions, works } from "@/lib/db/schema";
import { artForPlaced, placeIgdbGame, type Placed } from "@/lib/entries/add";
import { getGameById } from "@/lib/igdb/games";
import { seriesFor, slugify, sortTitleFor } from "@/lib/igdb/mapping";
import { searchGames } from "@/lib/igdb/search";
import { resolvePlatform } from "@/lib/platforms";
import { basedOnOf, createRomhackWork, isRomhackWork } from "@/lib/romhacks";
import { canonicalSeries, seriesInUse } from "@/lib/series";
import { isStatus } from "@/lib/status";
import { isUuid } from "@/lib/uuid";
import { lookupArt, SgdbNotConfiguredError } from "@/lib/sgdb";
import { primaryPlatformFor } from "@/lib/works/ensure";

import { isCommunityKind, isFormKind, OTHER_PLATFORM, type ArtLookupState, type BaseGameOption } from "./types";

/**
 * The one add-version form (§5, both doors), read from its own fields, so the
 * web's action and the phone's `POST /versions` (its JSON read into a
 * FormData) apply the same rules and say the same things.
 */

export type CreatedVersion = { ok: boolean; message: string; workSlug?: string; versionId?: string };

/** The form's field names, for reading the phone's JSON as the form. */
export const CREATE_FIELDS = [
  "name",
  "kind",
  "workId",
  "baseGameIgdbId",
  "baseVersionId",
  "platformName",
  "author",
  "versionLabel",
  "releaseDate",
  "url",
  "notes",
  "series",
  "summary",
  "status",
  "artUrl",
  "artSgdbGameId",
  "artConfidence",
] as const;

/** SteamGridDB's art for a name typed on the form (§4a confidence tiers). */
export async function artForName(name: string): Promise<ArtLookupState> {
  const empty: ArtLookupState = { confidence: "none", matchedName: null, sgdbGameId: null, candidates: [], error: null };
  if (!name.trim()) return empty;
  try {
    return { ...(await lookupArt(name)), error: null };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof SgdbNotConfiguredError ? "SGDB_API_KEY is not set, so art cannot be looked up." : "SteamGridDB lookup failed.",
    };
  }
}

/** IGDB's games for the base-game search, as the form lists them. */
export async function baseGameOptions(term: string): Promise<BaseGameOption[]> {
  if (!term.trim()) return [];
  try {
    return (await searchGames(term, 8)).map((game) => ({
      igdbId: game.id,
      title: game.name,
      year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null,
      series: seriesFor(game),
      summary: game.summary ?? null,
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

export async function createVersionFromForm(userId: string, formData: FormData): Promise<CreatedVersion> {

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
  const asked = formData.get("status");
  const status = isStatus(asked) ? asked : "backlog";

  // A new game's own details, as the form showed them (2026-10-21): sent
  // only when this makes a game, a romhack or homebrew. Absent, a romhack
  // takes its original's; a box emptied on the form stays empty.
  const details = formData.has("summary")
    ? {
        summary: optional(formData, "summary"),
        series: canonicalSeries(optional(formData, "series") ?? "", await seriesInUse()) || null,
      }
    : undefined;

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
      const placed = await placeIgdbGame(tx, userId, game!, primaryPlatformFor(game!), null);
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
          sortTitle: sortTitleFor(name),
          series: details?.series ?? null,
          summary: details?.summary ?? null,
          firstReleaseDate: releaseDate,
          workKind: "main_game",
          source: "local",
          createdBy: userId,
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
        const created = await createRomhackWork(tx, { name, baseWorkId, releaseDate, userId: userId, details });
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
        createdBy: userId,
      })
      .returning({ id: versions.id });

    await tx
      .insert(entries)
      .values({ userId: userId, versionId: version.id, status })
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

  return { ok: true, message: "Added to your shelf", workSlug: outcome.workSlug, versionId: outcome.versionId };
}


/**
 * Door B's game, as `/work/{slug}/add-version` knows it: what a release can
 * patch (this game's, or for a romhack's own game its original's), and what a
 * romhack of it starts with.
 */
export async function knownWork(slug: string) {
  const [work] = await db
    .select({ id: works.id, slug: works.slug, title: works.title, basedOnWorkId: works.basedOnWorkId, series: works.series, summary: works.summary })
    .from(works)
    .where(eq(works.slug, slug));
  if (!work) return null;

  // On a romhack's own page this adds another way to play it, and what it
  // patches is a release of the original rather than of the hack.
  const romhack = await isRomhackWork(db, work.id);
  const original = romhack ? await basedOnOf(work.basedOnWorkId) : null;
  const patchable = romhack ? work.basedOnWorkId : work.id;
  const versionRows = patchable
    ? await db
        .select({ id: versions.id, name: versions.name, kind: versions.kind })
        .from(versions)
        .where(eq(versions.workId, patchable))
        .orderBy(asc(versions.createdAt))
    : [];
  return {
    id: work.id,
    slug: work.slug,
    title: work.title,
    versions: versionRows,
    romhack: romhack ? { original: original?.title ?? null } : null,
    series: work.series,
    summary: work.summary,
  };
}
