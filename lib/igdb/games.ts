import { igdbRequest } from "./client";
import type { IgdbGame } from "./types";

/**
 * Wider than the search projection: this is the payload that gets stored in
 * works.igdb_payload, so fields can be re-derived later without a refetch.
 */
const FIELDS = [
  "id",
  "name",
  "slug",
  "summary",
  "storyline",
  "first_release_date",
  "cover.image_id",
  "platforms.id",
  "platforms.name",
  "platforms.abbreviation",
  "release_dates.date",
  "release_dates.platform",
  "game_type.id",
  "game_type.type",
  "parent_game",
  "franchises.name",
  "collections.name",
  "genres.name",
  "involved_companies.company.name",
  "involved_companies.developer",
  "involved_companies.publisher",
  "url",
].join(",");

export async function getGameById(id: number): Promise<IgdbGame | null> {
  const rows = await igdbRequest<IgdbGame[]>("games", `fields ${FIELDS}; where id = ${id}; limit 1;`);
  return rows[0] ?? null;
}

/** IGDB refuses more than this in one response. */
export const MAX_GAMES_PER_REQUEST = 500;

/**
 * Several games in one round trip. An import of a few hundred would otherwise
 * be a few hundred requests at four a second, which is several minutes of
 * waiting for data IGDB is happy to hand over all at once.
 */
export async function getGamesByIds(ids: number[]): Promise<IgdbGame[]> {
  const wanted = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (wanted.length === 0) return [];
  if (wanted.length > MAX_GAMES_PER_REQUEST) {
    throw new Error(`Too many ids for one request: ${wanted.length}`);
  }

  return igdbRequest<IgdbGame[]>(
    "games",
    `fields ${FIELDS}; where id = (${wanted.join(",")}); limit ${wanted.length};`,
  );
}

/**
 * A game's DLC, expansions and standalone expansions as full payloads, for
 * filling them in under the game in one request rather than one per DLC.
 * Seasons and episodes are left to "Add DLC": Destiny 2 has more seasons than
 * anyone wants listed by default.
 */
export async function getDlcOfGame(igdbId: number): Promise<IgdbGame[]> {
  if (!Number.isInteger(igdbId) || igdbId <= 0) return [];
  return igdbRequest<IgdbGame[]>(
    "games",
    `fields ${FIELDS}; where parent_game = ${igdbId} & game_type = (1,2,4); sort first_release_date asc; limit ${MAX_GAMES_PER_REQUEST};`,
  );
}
