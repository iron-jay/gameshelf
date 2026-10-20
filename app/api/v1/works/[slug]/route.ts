import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { setDlcOnShelf } from "@/lib/dlc";
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
 * own; false keeps it under the game. The only thing about a work the phone
 * changes; the rest is edited on the web.
 */
export const PATCH = withUser<{ slug: string }>(async (request, { params, user }) => {
  const slug = (await params).slug;
  const body = await readObject(request);
  if (typeof body.dlcOnShelf !== "boolean") {
    throw new ApiError("invalid", "Nothing to change.", { fields: { dlcOnShelf: "Must be true or false." } });
  }

  const [work] = await db.select({ id: works.id }).from(works).where(eq(works.slug, slug));
  if (!work) throw new ApiError("not_found", "No such game.");
  await setDlcOnShelf(work.id, body.dlcOnShelf);

  revalidatePath("/");
  revalidatePath(`/work/${slug}`);
  revalidatePath("/version/[id]", "page");

  return json(await workDetail(user.id, slug));
});
