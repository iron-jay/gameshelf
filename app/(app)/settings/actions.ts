"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { listCoverFiles } from "@/lib/covers";
import { orphanedCoverFiles, removeCoverFiles } from "@/lib/works/removal";
import { searchGames } from "@/lib/igdb/search";
import { IgdbError, IgdbNotConfiguredError } from "@/lib/igdb/types";
import { lookupArt, SgdbNotConfiguredError } from "@/lib/sgdb";

export type ConnectionReport = {
  igdb: { ok: boolean; detail: string };
  sgdb: { ok: boolean; detail: string };
} | null;

/**
 * A real request to each service rather than an env-var check. "Configured" and
 * "working" are different questions, and the one worth answering is the second.
 */
export async function checkConnections(): Promise<ConnectionReport> {
  await requireUser();

  const igdb = await (async () => {
    try {
      const results = await searchGames("the legend of zelda", 1);
      return { ok: true, detail: `Working — search returned ${results.length} result.` };
    } catch (err) {
      if (err instanceof IgdbNotConfiguredError) {
        return { ok: false, detail: "IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are not set." };
      }
      if (err instanceof IgdbError) {
        return { ok: false, detail: `Request failed (${err.status ?? "no response"}).` };
      }
      return { ok: false, detail: "Request failed." };
    }
  })();

  const sgdb = await (async () => {
    try {
      const result = await lookupArt("ship of harkinian");
      return {
        ok: true,
        detail: `Working — matched "${result.matchedName ?? "nothing"}" with ${result.candidates.length} grids.`,
      };
    } catch (err) {
      if (err instanceof SgdbNotConfiguredError) {
        return { ok: false, detail: "SGDB_API_KEY is not set." };
      }
      return { ok: false, detail: "Request failed." };
    }
  })();

  return { igdb, sgdb };
}

/**
 * Cover files nothing points at any more. Deleting a work or version clears its
 * art, so this should normally find nothing — it exists for the cases that got
 * away, like rows removed directly in SQL.
 */
export async function sweepOrphanedCovers(): Promise<{ removed: number }> {
  await requireUser();

  const orphans = await orphanedCoverFiles(await listCoverFiles());
  await removeCoverFiles(orphans);

  revalidatePath("/settings");
  return { removed: orphans.length };
}
