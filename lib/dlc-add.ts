import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { entries, platforms, versions, works } from "@/lib/db/schema";
import { shortDlcTitle } from "@/lib/dlc";
import { applySgdbArt } from "@/lib/entries/add";
import { slugify, workKindFor } from "@/lib/igdb/mapping";
import { dlcOfGame } from "@/lib/igdb/search";
import { IgdbError, IgdbNotConfiguredError, type IgdbGame } from "@/lib/igdb/types";
import { igdbResultFor, type IgdbResult } from "@/lib/search";
import { isStatus, type Status } from "@/lib/status";

/**
 * Add DLC (`/work/{slug}/dlc`, §2), shared by the page and the phone's
 * `/works/{slug}/dlc`: what IGDB hangs off the game, which of it is here, and
 * DLC made by hand under it.
 */

export type DlcChoice = {
  result: IgdbResult;
  /** The name without the game's in front ("The Witch Queen"). */
  name: string;
  kindLabel: string;
  /** The platform Add starts on: the game's, when the DLC came out there too. */
  platformId: number | null;
  /** Here already: its version, and your shelf for it if any. */
  known: { versionId: string; status: Status | null } | null;
};

export type DlcChoices = {
  game: { id: string; slug: string; title: string; igdbId: number | null };
  /** Why IGDB's list is missing, when it is; adding by hand still works. */
  notice: string | null;
  /** IGDB was asked and listed nothing. */
  noneListed: boolean;
  groups: { title: string; items: DlcChoice[] }[];
};

export async function dlcChoices(userId: string, slug: string): Promise<DlcChoices | null> {
  const [game] = await db
    .select({ id: works.id, slug: works.slug, title: works.title, igdbId: works.igdbId })
    .from(works)
    .where(eq(works.slug, slug));
  if (!game) return null;

  // DLC is played where the game is, so Add starts on the game's platform
  // when the DLC came out there too, not on IGDB's earliest release.
  const [gamePlatform] = await db
    .select({ igdbId: platforms.igdbId })
    .from(versions)
    .innerJoin(platforms, eq(platforms.id, versions.platformId))
    .where(eq(versions.workId, game.id))
    .orderBy(asc(versions.createdAt))
    .limit(1);

  let listed: IgdbGame[] = [];
  let notice: string | null = null;
  if (game.igdbId) {
    try {
      listed = await dlcOfGame(game.igdbId);
    } catch (err) {
      notice =
        err instanceof IgdbNotConfiguredError
          ? "IGDB credentials are not set, so its DLC cannot be listed. You can still add it by hand."
          : err instanceof IgdbError
            ? `IGDB could not be reached (${err.status ?? "no response"}). You can still add DLC by hand.`
            : "IGDB could not be reached. You can still add DLC by hand.";
    }
  }

  // Which of those are here already, and which of those you have shelved, so
  // each opens rather than offering to add it twice.
  const here = listed.length
    ? await db
        .select({ igdbId: works.igdbId, versionId: versions.id, status: entries.status })
        .from(works)
        .innerJoin(versions, eq(versions.workId, works.id))
        .leftJoin(entries, and(eq(entries.versionId, versions.id), eq(entries.userId, userId)))
        .where(
          inArray(
            works.igdbId,
            listed.map((item) => item.id),
          ),
        )
    : [];
  const hereById = new Map<number, { versionId: string; status: Status | null }>();
  for (const row of here) {
    if (row.igdbId === null) continue;
    const known = hereById.get(row.igdbId);
    if (!known || (!known.status && row.status)) hereById.set(row.igdbId, { versionId: row.versionId, status: row.status });
  }

  const choice = (item: IgdbGame): DlcChoice => {
    const result = igdbResultFor(item);
    const onGames = result.platformOptions.some((option) => option.id === gamePlatform?.igdbId);
    return {
      result,
      name: shortDlcTitle(item.name, game.title),
      kindLabel: workKindFor(item).replace(/_/g, " "),
      platformId: onGames ? (gamePlatform?.igdbId ?? null) : null,
      known: hereById.get(item.id) ?? null,
    };
  };

  // Destiny 2 has more seasons than expansions. They are DLC too, but a list
  // that leads with twenty of them buries the four you came for.
  const isSeason = (item: IgdbGame) => ["season", "episode"].includes(workKindFor(item));
  const groups = [
    { title: "Expansions and DLC", items: listed.filter((item) => !isSeason(item)).map(choice) },
    { title: "Seasons and episodes", items: listed.filter(isSeason).map(choice) },
  ].filter((group) => group.items.length > 0);

  return { game, notice, noneListed: Boolean(game.igdbId) && !notice && listed.length === 0, groups };
}

export type DlcByHand = { ok: true; gameSlug: string; versionId: string } | { ok: false; message: string };

/**
 * DLC IGDB does not list, made by hand under the game: a local work hanging
 * off it, with one version on the game's own platform, and your entry. The
 * same three rows any add makes; nothing about it is second-class.
 */
export async function addDlcByHandFor(userId: string, formData: FormData): Promise<DlcByHand> {
  const gameId = String(formData.get("workId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const kind = formData.get("kind") === "expansion" ? "expansion" : "dlc";
  const asked = formData.get("status");
  const status = isStatus(asked) ? asked : "backlog";
  if (!name) return { ok: false, message: "Name the DLC first." };

  const outcome = await db.transaction(async (tx) => {
    const [game] = gameId
      ? await tx.select({ id: works.id, slug: works.slug }).from(works).where(eq(works.id, gameId))
      : [];
    if (!game) return null;

    // The DLC is played where the game is, so it starts on the game's platform.
    const [gameVersion] = await tx
      .select({ platformId: versions.platformId })
      .from(versions)
      .where(eq(versions.workId, game.id))
      .orderBy(asc(versions.createdAt))
      .limit(1);

    const base = slugify(name);
    const [clash] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, base));
    const [work] = await tx
      .insert(works)
      .values({
        slug: clash ? `${base}-${Date.now().toString(36)}` : base,
        title: name,
        workKind: kind,
        parentWorkId: game.id,
        source: "local",
        createdBy: userId,
      })
      .returning({ id: works.id });

    const [version] = await tx
      .insert(versions)
      .values({
        workId: work.id,
        name: "Original release",
        kind: "original",
        platformId: gameVersion?.platformId ?? null,
        source: "local",
        createdBy: userId,
      })
      .returning({ id: versions.id });

    await tx.insert(entries).values({ userId, versionId: version.id, status }).onConflictDoNothing();

    return { gameSlug: game.slug, workId: work.id, versionId: version.id };
  });
  if (!outcome) return { ok: false, message: "That game is no longer here." };

  // As homebrew: a local work has no IGDB cover, so SteamGridDB is asked once.
  await applySgdbArt(outcome.workId, name);
  return { ok: true, gameSlug: outcome.gameSlug, versionId: outcome.versionId };
}
