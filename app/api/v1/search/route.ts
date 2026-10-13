import { json, withUser } from "@/lib/api";
import { searchGames } from "@/lib/igdb/search";
import { IgdbError, IgdbNotConfiguredError } from "@/lib/igdb/types";
import { igdbResultFor, searchLocalWorks, type IgdbResult } from "@/lib/search";

export const dynamic = "force-dynamic";

/**
 * `?q=` across your server and IGDB. Local results come back even when IGDB
 * cannot be reached; `igdbError` then says why its half is empty, the same
 * way the web's search page shows a notice rather than failing.
 */
export const GET = withUser(async (request, { user }) => {
  const term = (new URL(request.url).searchParams.get("q") ?? "").trim();

  const local = await searchLocalWorks(user.id, term);

  let igdb: IgdbResult[] = [];
  let igdbError: string | null = null;

  if (term) {
    try {
      igdb = (await searchGames(term)).map(igdbResultFor);
    } catch (err) {
      igdbError =
        err instanceof IgdbNotConfiguredError
          ? "not_configured"
          : err instanceof IgdbError
            ? `failed (${err.status ?? "no response"})`
            : "failed";
    }
  }

  return json({ q: term, local, igdb, igdbError });
});
