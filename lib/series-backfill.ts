/**
 * Values both the server action and the browser need.
 *
 * In its own module because a `"use server"` file may only export async
 * functions — exporting a number from one breaks every action on the pages that
 * import it, silently at build time and loudly at runtime. `scripts/check-server-actions.ts`
 * exists because that happened once.
 */

/**
 * Works per round trip. One IGDB request each, so the limit is how long a user
 * waits between progress updates rather than anything IGDB minds: it will hand
 * over 500 at once.
 */
export const SERIES_CHUNK = 50;

export type SeriesBackfillResult = {
  /** Works given a series they did not have. */
  filled: number;
  /** Works IGDB has no franchise or collection for. Nothing is wrong with these. */
  blank: number;
  /** Works IGDB no longer returns at all. */
  missing: number;
};
