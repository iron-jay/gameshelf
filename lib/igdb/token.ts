import { db } from "@/lib/db";
import { igdbTokens } from "@/lib/db/schema";

import { IgdbError, IgdbNotConfiguredError } from "./types";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";

/**
 * Treat a token as spent an hour before Twitch does, so a request can never
 * straddle the expiry boundary and come back 401 for a reason we could have
 * predicted.
 */
const SKEW_MS = 60 * 60 * 1000;

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

export function igdbCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new IgdbNotConfiguredError();
  }

  return { clientId, clientSecret };
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const [row] = await db.select().from(igdbTokens).limit(1);
    if (row && row.expiresAt.getTime() - SKEW_MS > Date.now()) {
      return row.accessToken;
    }
  }

  return refreshAccessToken();
}

async function refreshAccessToken(): Promise<string> {
  const { clientId, clientSecret } = igdbCredentials();

  // Credentials go in the body rather than the query string: query strings end
  // up in proxy and server logs.
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new IgdbError(
      `Twitch token request failed (${res.status})`,
      res.status,
      await res.text().catch(() => undefined),
    );
  }

  const body = (await res.json()) as TwitchTokenResponse;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + body.expires_in * 1000);

  await db
    .insert(igdbTokens)
    .values({ id: true, accessToken: body.access_token, expiresAt, obtainedAt: now })
    .onConflictDoUpdate({
      target: igdbTokens.id,
      set: { accessToken: body.access_token, expiresAt, obtainedAt: now },
    });

  return body.access_token;
}
