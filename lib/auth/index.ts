import { cache } from "react";

import { redirect } from "next/navigation";

import { readSessionToken, validateSessionToken, type SessionUser } from "./session";

/**
 * Deduplicated per request: a layout and the page inside it both asking who is
 * logged in should cost one round trip, not two.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
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
