import { ApiError, json, withUser } from "@/lib/api";
import { artState } from "@/lib/art-changes";
import { lookupArt } from "@/lib/sgdb";

export const dynamic = "force-dynamic";

/**
 * SteamGridDB's grids, as the art page's picker: `{ items, notice }`, searched
 * on `?q=` or else the page's own seed title (`?version=` for a version's).
 * `?adult=1` includes nsfw and joke art. Send a grid's `imageUrl` and
 * `sgdbGameId` back to apply it. SteamGridDB out of reach is an empty list
 * with the page's notice.
 */
export const GET = withUser<{ slug: string }>(async (request, { params }) => {
  const search = new URL(request.url).searchParams;
  const state = await artState((await params).slug, search.get("version") || null);
  if (!state) throw new ApiError("not_found", "That no longer exists.");
  const term = search.get("q")?.trim() || state.seedTitle;
  try {
    return json({ items: (await lookupArt(term, search.get("adult") === "1")).candidates, notice: null });
  } catch {
    return json({ items: [], notice: "SteamGridDB could not be reached. Pasting an id or uploading a file still works." });
  }
});
