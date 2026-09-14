/**
 * Title matching for SteamGridDB.
 *
 * There is no IGDB to SteamGridDB id mapping, so everything hangs off the
 * title, and how confident that match is decides whether art is applied
 * silently, applied with a flag, or not applied at all.
 */

const LEADING_ARTICLE = /^(?:the|a|an)\s+/;

const EDITION_SUFFIX =
  /\s+(?:deluxe|definitive|complete|final|gold|ultimate|special|enhanced|extended|remastered|anniversary|legacy|goty|game of the year)(?:\s+edition)?$/;

export function normaliseTitle(value: string): string {
  let title = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    // Punctuation becomes a space rather than nothing, so "Zelda:Ocarina" and
    // "Zelda Ocarina" normalise the same way.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  title = title.replace(LEADING_ARTICLE, "");

  // Editions can stack ("Complete Edition Remastered"), so strip repeatedly.
  let previous: string;
  do {
    previous = title;
    title = title.replace(EDITION_SUFFIX, "").trim();
  } while (title !== previous);

  return title;
}

export type MatchConfidence = "exact" | "fuzzy" | "none";

/**
 * Section 4a's tiers. Exact means the art is applied and trusted; fuzzy means
 * it is applied but flagged for review; none means no art is written at all,
 * because a wrong cover that looks right is worse than no cover.
 */
export function confidenceFor(searched: string, candidate: string): MatchConfidence {
  const a = normaliseTitle(searched);
  const b = normaliseTitle(candidate);

  if (!a || !b) return "none";
  if (a === b) return "exact";
  if (a.includes(b) || b.includes(a)) return "fuzzy";

  return "none";
}
