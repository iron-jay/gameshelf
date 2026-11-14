import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { setDlcOnShelf } from "@/lib/dlc";
import { setWorkSeries } from "@/lib/series";
import { deleteWork } from "@/lib/works/removal";
import { workDetail } from "@/lib/works/read";

export const dynamic = "force-dynamic";

/** A work with its versions (and which are on your shelf) and its DLC, with your shelf state on each. */
export const GET = withUser<{ slug: string }>(async (_request, { params, user }) => {
  const detail = await workDetail(user.id, (await params).slug);
  if (!detail) throw new ApiError("not_found", "No such game.");
  return json(detail);
});

/**
 * `{ "dlcOnShelf": true }` puts the game's DLC on the shelf as games of their
 * own; false keeps it under the game. `{ "series": "Zelda" }` sets its series
 * as the web's series box does (a name in use is joined without regard to
 * case; "" clears it). Either or both. Answers with the work.
 */
export const PATCH = withUser<{ slug: string }>(async (request, { params, user }) => {
  const slug = (await params).slug;
  const body = await readObject(request);
  if (body.dlcOnShelf === undefined && body.series === undefined) {
    throw new ApiError("invalid", "Nothing to change.", { fields: { dlcOnShelf: "Give dlcOnShelf or series." } });
  }
  if (body.dlcOnShelf !== undefined && typeof body.dlcOnShelf !== "boolean") {
    throw new ApiError("invalid", "dlcOnShelf is true or false.", { fields: { dlcOnShelf: "Must be true or false." } });
  }
  if (body.series !== undefined && body.series !== null && typeof body.series !== "string") {
    throw new ApiError("invalid", "series is text.", { fields: { series: "Must be text." } });
  }

  const [work] = await db.select({ id: works.id }).from(works).where(eq(works.slug, slug));
  if (!work) throw new ApiError("not_found", "No such game.");
  if (typeof body.dlcOnShelf === "boolean") await setDlcOnShelf(work.id, body.dlcOnShelf);
  if (body.series !== undefined) await setWorkSeries(slug, body.series ?? "");

  revalidatePath("/");
  revalidatePath(`/work/${slug}`);
  revalidatePath("/version/[id]", "page");
  revalidatePath("/series/[name]", "page");

  return json(await workDetail(user.id, slug));
});

/** Deletes the game, its versions, DLC and everyone's entries on them, as the web's Delete. 204. */
export const DELETE = withUser<{ slug: string }>(async (_request, { params }) => {
  const slug = (await params).slug;
  const [work] = await db.select({ id: works.id }).from(works).where(eq(works.slug, slug));
  if (!work) throw new ApiError("not_found", "No such game.");
  await deleteWork(work.id);
  revalidatePath("/");
  revalidatePath("/off-shelf");
  return new Response(null, { status: 204 });
});
