import type { workKind } from "@/lib/db/schema";

import type { IgdbGame, IgdbPlatform, IgdbReleaseDate } from "./types";

type WorkKind = (typeof workKind.enumValues)[number];

/**
 * IGDB's game category, mapped onto work_kind.
 *
 * Only the categories that genuinely add content become non-main_game works.
 * IGDB's remake (8), remaster (9), port (11) and mod (5) describe the same
 * content presented differently, which is a version in this model — but when
 * one is added directly from search it has no parent to hang off, so it becomes
 * a main_game work of its own. Attaching it as a version to something else is
 * the "add version" flow, not this one.
 */
const CATEGORY_TO_WORK_KIND: Readonly<Record<number, WorkKind>> = {
  0: "main_game",
  1: "dlc",
  2: "expansion",
  3: "bundle",
  4: "standalone_expansion",
  6: "episode",
  7: "season",
};

export function workKindFor(game: IgdbGame): WorkKind {
  return CATEGORY_TO_WORK_KIND[game.category ?? 0] ?? "main_game";
}

type DatedRelease = IgdbReleaseDate & { date: number; platform: number };

/**
 * The platform an 'original' version carries has to be the one the game first
 * shipped on. IGDB's platforms array is in no meaningful order — for Ocarina of
 * Time it leads with Wii — so the earliest entry in release_dates decides, and
 * the array order is only a fallback when there are no dated releases.
 */
export function primaryPlatformFor(game: IgdbGame): IgdbPlatform | undefined {
  const available = game.platforms ?? [];
  if (available.length <= 1) return available[0];

  const dated = (game.release_dates ?? []).filter(
    (r): r is DatedRelease => typeof r.date === "number" && typeof r.platform === "number",
  );
  if (dated.length === 0) return available[0];

  const earliest = dated.reduce((a, b) => (b.date < a.date ? b : a));
  return available.find((p) => p.id === earliest.platform) ?? available[0];
}

/** IGDB dates are unix seconds; works.first_release_date is a plain date. */
export function releaseDateFor(game: IgdbGame): string | null {
  if (!game.first_release_date) return null;
  return new Date(game.first_release_date * 1000).toISOString().slice(0, 10);
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "untitled"
  );
}

/**
 * "Legend of Zelda, The" — so an alphabetical shelf does not file half the
 * library under T.
 */
const LEADING_ARTICLE = /^(the|a|an)\s+/i;

export function sortTitleFor(title: string): string | null {
  const match = LEADING_ARTICLE.exec(title);
  if (!match) return null;
  return `${title.slice(match[0].length)}, ${match[1]}`;
}
