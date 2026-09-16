/**
 * Values both the server action and the browser need.
 *
 * Kept out of `run.ts` because that pulls in the database, and out of the
 * action file because a `"use server"` module may only export async functions —
 * exporting this number from there breaks every action on the page, silently at
 * build time and loudly at runtime.
 */

/** Small enough to stay well inside one IGDB request and to report progress usefully. */
export const IMPORT_CHUNK = 40;

export type ImportChunkResult = {
  added: number;
  alreadyThere: number;
  missing: string[];
};
