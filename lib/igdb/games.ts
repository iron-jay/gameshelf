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
  "category",
  "parent_game",
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
