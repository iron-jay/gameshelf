import { createSerialiser, sleep } from "@/lib/rate-limit";

import { getAccessToken, igdbCredentials } from "./token";
import { IgdbError } from "./types";

const API_URL = "https://api.igdb.com/v4";

/** IGDB allows roughly four requests a second. */
const MIN_INTERVAL_MS = 250;
const MAX_ATTEMPTS = 3;

const serialise = createSerialiser(MIN_INTERVAL_MS);

export function igdbRequest<T>(endpoint: string, query: string): Promise<T> {
  return serialise(() => send<T>(endpoint, query, 0));
}

async function send<T>(endpoint: string, query: string, attempt: number): Promise<T> {
  const { clientId } = igdbCredentials();

  // Only a retry forces a new token; the happy path reads the cached row.
  const token = await getAccessToken(attempt > 0);

  const res = await fetch(`${API_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body: query,
    cache: "no-store",
  });

  if (res.ok) {
    return (await res.json()) as T;
  }

  // 401 means the cached token went stale early; 429 means we were too quick.
  // Both deserve another go — the first with a fresh token, the second after
  // backing off. Retrying inside the queue keeps other callers waiting too,
  // which is the point.
  const retriable = res.status === 401 || res.status === 429;
  if (retriable && attempt + 1 < MAX_ATTEMPTS) {
    if (res.status === 429) {
      await sleep(MIN_INTERVAL_MS * 2 ** (attempt + 1));
    }
    return send<T>(endpoint, query, attempt + 1);
  }

  throw new IgdbError(
    `IGDB ${endpoint} request failed (${res.status})`,
    res.status,
    await res.text().catch(() => undefined),
  );
}
