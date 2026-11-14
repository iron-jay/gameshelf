import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { moveToPlatform, moveToShelf, putInSeries } from "@/lib/bulk";

export const dynamic = "force-dynamic";

/**
 * The wall's select mode: `{ entryIds, do, value }`, where `do` is `shelf`
 * (`value` a shelf), `platform` (a platform's name, made if new; blank for
 * none) or `series` (a series name). Only your own entries are touched.
 * Answers `{ ok, message }` in the page's words; a refusal is `invalid` with
 * its message.
 */
export const POST = withUser(async (request, { user }) => {
  const body = await readObject(request);
  const ids = Array.isArray(body.entryIds) ? body.entryIds : [];
  const value = typeof body.value === "string" ? body.value : "";
  const run = { shelf: moveToShelf, platform: moveToPlatform, series: putInSeries }[String(body.do)];
  if (!run) throw new ApiError("invalid", "Say what to do: shelf, platform or series.", { fields: { do: "One of shelf, platform, series." } });
  const result = await run(user.id, ids, value);
  if (!result.ok) throw new ApiError("invalid", result.message);
  revalidatePath("/");
  return json(result);
});
