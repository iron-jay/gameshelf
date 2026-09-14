import { igdbRequest } from "./client";
import type { IgdbGame } from "./types";

const FIELDS = [
  "id",
  "name",
  "slug",
  "summary",
  "first_release_date",
  "cover.image_id",
  "platforms.name",
  "platforms.abbreviation",
  "category",
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

  const query = `search "${escapeTerm(trimmed)}"; fields ${FIELDS}; limit ${limit};`;
  return igdbRequest<IgdbGame[]>("games", query);
}
