import { json, withUser } from "@/lib/api";
import { baseGameOptions } from "@/lib/versions/create";

export const dynamic = "force-dynamic";

/** The form's base-game search: IGDB's games for `?q=`, `{ items: [{ igdbId, title, year, series, summary }] }`. */
export const GET = withUser(async (request) => {
  return json({ items: await baseGameOptions(new URL(request.url).searchParams.get("q") ?? "") });
});
