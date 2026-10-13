import { and, eq, ilike, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { entries, versions, works } from "@/lib/db/schema";
import { platformNameFor, primaryPlatformFor, releaseDateFor } from "@/lib/igdb/mapping";
import { igdbImageUrl, type IgdbGame } from "@/lib/igdb/types";
import type { Status } from "@/lib/status";

/**
 * What a search turns up, for the web's search page and the phone's API alike.
 * Local works and IGDB results are found separately so that an offline or
 * unconfigured server still finds what it already knows about.
 */

export type LocalResult = {
  id: string;
  slug: string;
  title: string;
  year: number | null;
  coverUrl: string | null;
  /** The versions of this work on your shelf. */
  shelvedVersionIds: string[];
};

export type IgdbResult = {
  id: number;
  title: string;
  year: number | null;
  coverUrl: string | null;
  /** Up to four platform abbreviations, for a one-line summary. */
  platforms: string;
  /** Every platform IGDB lists, for the picker. Spelled out, as the name will be. */
  platformOptions: { id: number; name: string }[];
  defaultPlatformId: number | null;
  defaultStatus: Status;
};

export async function searchLocalWorks(userId: string, term: string): Promise<LocalResult[]> {
  if (!term) return [];

  const local = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      firstReleaseDate: works.firstReleaseDate,
      coverUrl: works.coverUrl,
    })
    .from(works)
    .where(ilike(works.title, `%${term}%`))
    .limit(10);

  // Which of those you already have an entry for, so a result you own can open
  // the entry instead of making you find it.
  const shelved = local.length
    ? await db
        .select({ workId: versions.workId, versionId: versions.id })
        .from(entries)
        .innerJoin(versions, eq(versions.id, entries.versionId))
        .where(
          and(
            eq(entries.userId, userId),
            inArray(
              versions.workId,
              local.map((work) => work.id),
            ),
          ),
        )
    : [];

  const byWork = new Map<string, string[]>();
  for (const row of shelved) {
    byWork.set(row.workId, [...(byWork.get(row.workId) ?? []), row.versionId]);
  }

  return local.map((work) => ({
    id: work.id,
    slug: work.slug,
    title: work.title,
    year: work.firstReleaseDate ? Number(work.firstReleaseDate.slice(0, 4)) : null,
    coverUrl: work.coverUrl,
    shelvedVersionIds: byWork.get(work.id) ?? [],
  }));
}

/**
 * Something you cannot have played yet is a wishlist entry; something that is
 * out is a backlog entry. Both are one click from the other, so the cost of
 * guessing wrong is nil and the cost of asking every time is not.
 *
 * A game with no release date at all counts as out: IGDB not knowing when
 * something came out is far more common than it being unreleased.
 */
function defaultStatusFor(game: IgdbGame): Status {
  const released = releaseDateFor(game);
  return released && released > new Date().toISOString().slice(0, 10) ? "wishlist" : "backlog";
}

function yearOf(seconds: number | undefined): number | null {
  return seconds ? new Date(seconds * 1000).getUTCFullYear() : null;
}

export function igdbResultFor(game: IgdbGame): IgdbResult {
  const available = game.platforms ?? [];

  return {
    id: game.id,
    title: game.name,
    year: yearOf(game.first_release_date),
    coverUrl: game.cover ? igdbImageUrl(game.cover.image_id, "cover_small") : null,
    platforms: available
      .map((p) => p.abbreviation ?? p.name)
      .slice(0, 4)
      .join(" · "),
    // Named the same way the row will be, so the picker is not offering one
    // spelling and storing another.
    platformOptions: [...available]
      .map((p) => ({ id: p.id, name: platformNameFor(p) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    // The same call the server makes when nothing is chosen, so what the picker
    // shows is what an untouched Add would produce.
    defaultPlatformId: primaryPlatformFor(game)?.id ?? null,
    defaultStatus: defaultStatusFor(game),
  };
}
