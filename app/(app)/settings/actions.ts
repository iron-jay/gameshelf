"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { listCoverFiles } from "@/lib/covers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
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

export type AccountState = { ok: boolean; message: string } | null;

/** Letters, digits and the punctuation people actually put in usernames. */
const USERNAME = /^[a-zA-Z0-9._-]{2,32}$/;

/**
 * Rename the account. ADMIN_USERNAME only ever named it at creation, so this is
 * the thing that decides what it is called from then on — including for the
 * no-sign-in path, which falls back to the oldest account when the environment
 * variable no longer matches anybody.
 */
export async function updateAccount(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();

  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!USERNAME.test(username)) {
    return {
      ok: false,
      message: "Two to thirty-two characters: letters, digits, dot, dash or underscore.",
    };
  }

  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), ne(users.id, user.id)));

  if (clash) {
    return { ok: false, message: "Somebody already has that name." };
  }

  await db
    .update(users)
    .set({ username, displayName: displayName || null })
    .where(eq(users.id, user.id));

  // Sessions key on the user id, so renaming does not sign anybody out.
  revalidatePath("/settings");
  revalidatePath("/");

  return { ok: true, message: "Saved." };
}
