import { cache } from "react";

import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { readSessionToken, validateSessionToken, type SessionUser } from "./session";

/**
 * Turns off sign-in entirely, for a single-user server on a network you trust.
 *
 * Everything the app can do becomes available to anything that can reach the
 * port — reading, rating, editing and deleting — so it is only sensible while
 * that port is genuinely private. It is deliberately a whole-app switch rather
 * than a per-route one: half-authenticated is a worse place to be than either
 * end.
 */
export function authDisabled(): boolean {
  return process.env.AUTH_DISABLED === "true";
}

/**
 * Who you are when there is no sign-in. ADMIN_USERNAME when it matches someone,
 * otherwise the oldest account — which on a single-user install is the only one.
 */
async function assumedUser(): Promise<SessionUser | null> {
  const username = process.env.ADMIN_USERNAME;

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(username ? eq(users.username, username) : undefined)
    .orderBy(asc(users.createdAt))
    .limit(1);

  return user ?? null;
}

/**
 * Deduplicated per request: a layout and the page inside it both asking who is
 * logged in should cost one round trip, not two.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (authDisabled()) {
    return assumedUser();
  }

  const token = await readSessionToken();
  if (!token) return null;
  return validateSessionToken(token);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export type { SessionUser };
