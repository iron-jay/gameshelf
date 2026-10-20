import { ApiError, json, pageFrom, withUser } from "@/lib/api";
import { cardFrom } from "@/lib/api/cards";
import { foldedShelfRows } from "@/lib/dlc";
import { isShelfSort, shelfRows } from "@/lib/shelf";
import { isStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

/**
 * The shelf as cards: `?shelf=playing&tag=couch-co-op&platform=PC&sort=rated`,
 * paged with `limit` and `offset`. Every card carries `extra.parentWorkId`.
 *
 * `dlc=fold` leaves out DLC that sits under its game, by the web's rule
 * (lib/dlc.ts), and says how many in `dlcUnder`. Without it every entry is
 * listed, as before, so an older phone build sees what it always did.
 */
export const GET = withUser(async (request, { user }) => {
  const url = new URL(request.url);
  const shelf = url.searchParams.get("shelf") || undefined;
  const sort = url.searchParams.get("sort") || undefined;

  if (shelf !== undefined && !isStatus(shelf)) {
    throw new ApiError("invalid", "No such shelf.", { fields: { shelf: "Unknown shelf." } });
  }
  if (sort !== undefined && !isShelfSort(sort)) {
    throw new ApiError("invalid", "No such sort.", { fields: { sort: "Unknown sort." } });
  }

  const { limit, offset } = pageFrom(url);

  // One person's shelf is a few thousand rows at most, so it is read whole and
  // paged here, which keeps every sort and filter in one query shared with the web.
  const filters = {
    status: shelf,
    platform: url.searchParams.get("platform")?.trim() || undefined,
    tag: url.searchParams.get("tag")?.trim() || undefined,
    sort,
  };
  const fold = url.searchParams.get("dlc") === "fold";
  const { rows, under } = fold
    ? await foldedShelfRows(user.id, filters)
    : { rows: await shelfRows(user.id, filters), under: null };

  return json({
    total: rows.length,
    ...(under ? { dlcUnder: [...under.values()].reduce((sum, count) => sum + count, 0) } : {}),
    limit,
    offset,
    items: rows.slice(offset, offset + limit).map(cardFrom),
  });
});
