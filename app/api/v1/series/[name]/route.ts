import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { removeSeries, renameSeries, seriesDetail } from "@/lib/series";

export const dynamic = "force-dynamic";

function revalidateSeries() {
  revalidatePath("/series/[name]", "page");
  revalidatePath("/work/[slug]", "page");
  revalidatePath("/version/[id]", "page");
  revalidatePath("/");
}

/** A series in release order, every game in it, shelved or not, with your entries on each. */
export const GET = withUser<{ name: string }>(async (_request, { params, user }) => {
  const detail = await seriesDetail(user.id, decodeURIComponent((await params).name));
  if (!detail) throw new ApiError("not_found", "No such series.");
  return json(detail);
});

/**
 * `{ "name": "Zelda" }` renames the series on every game in it. A name already
 * in use joins the two, as on the web. Answers with the series under its new name.
 */
export const PATCH = withUser<{ name: string }>(async (request, { params, user }) => {
  const from = decodeURIComponent((await params).name);
  const body = await readObject(request);
  if (typeof body.name !== "string" || !body.name.trim()) {
    throw new ApiError("invalid", "Give the series a name.", { fields: { name: "Required." } });
  }
  if (!(await seriesDetail(user.id, from))) throw new ApiError("not_found", "No such series.");

  const to = await renameSeries(from, body.name);
  revalidateSeries();
  return json(await seriesDetail(user.id, to ?? from));
});

/** Takes every game out of the series. The games and your entries stay. */
export const DELETE = withUser<{ name: string }>(async (_request, { params, user }) => {
  const name = decodeURIComponent((await params).name);
  if (!(await seriesDetail(user.id, name))) throw new ApiError("not_found", "No such series.");
  await removeSeries(name);
  revalidateSeries();
  return new Response(null, { status: 204 });
});
