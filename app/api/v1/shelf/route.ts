import { ApiError, json, pageFrom, withUser } from "@/lib/api";
import { cardFrom } from "@/lib/api/cards";
import { isShelfSort, shelfRows } from "@/lib/shelf";
import { isStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

/**
 * The shelf as cards: `?shelf=playing&tag=couch-co-op&platform=PC&sort=rated`,
 * paged with `limit` and `offset`. DLC is not nested here; each card carries
 * `extra.parentWorkId`, so the phone can group it the way the web does.
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
  const rows = await shelfRows(user.id, {
    status: shelf,
    platform: url.searchParams.get("platform")?.trim() || undefined,
    tag: url.searchParams.get("tag")?.trim() || undefined,
    sort,
  });

  return json({
    total: rows.length,
    limit,
    offset,
    items: rows.slice(offset, offset + limit).map(cardFrom),
  });
});
