import { ApiError, json, withUser } from "@/lib/api";
import { platformsInUse } from "@/lib/platforms";
import { seriesInUse } from "@/lib/series";
import { knownWork } from "@/lib/versions/create";
import { COMMUNITY_KINDS, KIND_LABELS, type FormKind } from "@/lib/versions/types";

export const dynamic = "force-dynamic";

/**
 * What the add-version form offers: `?kind=` (Door A's choice) or `?work=`
 * (Door B, a game's slug, with `work` as that page knows it: its releases to
 * patch, whether it is a romhack's own game, and the series and summary a
 * romhack of it starts with). `kinds` as `{ value, label }`, `platforms` in
 * use and `seriesNames`.
 */
export const GET = withUser(async (request) => {
  const search = new URL(request.url).searchParams;
  const slug = search.get("work");
  const work = slug ? await knownWork(slug) : null;
  if (slug && !work) throw new ApiError("not_found", "No such game.");
  const asked = search.get("kind") ?? undefined;
  const kinds: readonly FormKind[] = asked === "homebrew" ? ["homebrew"] : work?.romhack ? ["romhack"] : COMMUNITY_KINDS;
  return json({
    work,
    kinds: kinds.map((value) => ({ value, label: KIND_LABELS[value] })),
    platforms: await platformsInUse(),
    seriesNames: await seriesInUse(),
  });
});
