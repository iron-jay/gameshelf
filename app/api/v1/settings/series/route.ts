import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { SERIES_CHUNK } from "@/lib/series-backfill";
import { clearEverySeries, fillSeriesChunk, igdbIdsNeedingSeries } from "@/lib/series-fill";

export const dynamic = "force-dynamic";

/** Settings → Series: the IGDB ids of games with no series yet, and how many to send at once. */
export const GET = withUser(async () => json({ igdbIds: await igdbIdsNeedingSeries(), chunk: SERIES_CHUNK }));

/**
 * `{ igdbIds }` (at most `chunk`) fills those games' series from IGDB, only
 * where they have none: `{ filled, blank, missing }`. `{ clear: true }` clears
 * every series instead, to undo a backfill that guessed badly: `{ cleared }`.
 */
export const POST = withUser(async (request) => {
  const body = await readObject(request);
  if (body.clear === true) {
    const result = await clearEverySeries();
    revalidatePath("/");
    return json(result);
  }
  if (!Array.isArray(body.igdbIds)) throw new ApiError("invalid", "Send igdbIds, or clear.", { fields: { igdbIds: "A list of IGDB ids." } });
  const ids = body.igdbIds.filter((id): id is number => typeof id === "number").slice(0, SERIES_CHUNK);
  const result = await fillSeriesChunk(ids);
  revalidatePath("/");
  return json(result);
});
