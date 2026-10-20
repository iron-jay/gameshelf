import { igdbRequest } from "./client";
import type { IgdbGame } from "./types";

export const SEARCH_FIELDS = [
  "id",
  "name",
  "slug",
  "summary",
  "first_release_date",
  "cover.image_id",
  "platforms.id",
  "platforms.name",
  "platforms.abbreviation",
  // Wider than a search result needs to render, but the platform picker has to
  // default to the same release primaryPlatformFor would pick on the server,
  // and that answer is only as good as the release dates it is given.
  "release_dates.date",
  "release_dates.platform",
  "game_type.id",
  "parent_game",
].join(",");

/**
 * Apicalypse has no parameter binding, so the term is escaped by hand. Only
 * quotes and backslashes can break out of a quoted string.
 */
function escapeTerm(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function searchGames(term: string, limit = 20): Promise<IgdbGame[]> {
  const trimmed = term.trim();
  if (!trimmed) {
    return [];
  }

  const query = `search "${escapeTerm(trimmed)}"; fields ${SEARCH_FIELDS}; limit ${limit};`;
  return igdbRequest<IgdbGame[]>("games", query);
}

/**
 * The DLC, expansions, episodes and seasons IGDB hangs off a game, oldest
 * first, in the search projection so each can be added the way a search
 * result is. Bundles are left out: a bundle is not more of the game.
 */
export async function dlcOfGame(igdbId: number, limit = 100): Promise<IgdbGame[]> {
  if (!Number.isInteger(igdbId) || igdbId <= 0) return [];
  return igdbRequest<IgdbGame[]>(
    "games",
    `fields ${SEARCH_FIELDS}; where parent_game = ${igdbId} & game_type = (1,2,4,6,7); sort first_release_date asc; limit ${limit};`,
  );
}
