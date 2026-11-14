import { json, withUser } from "@/lib/api";
import { artForName } from "@/lib/versions/create";

export const dynamic = "force-dynamic";

/**
 * The form's art lookup for a typed `?name=` (§4a): `{ confidence, matchedName,
 * sgdbGameId, candidates, error }`. An exact or fuzzy match is pre-selected on
 * the form; nothing is saved until the add.
 */
export const GET = withUser(async (request) => {
  return json(await artForName(new URL(request.url).searchParams.get("name") ?? ""));
});
