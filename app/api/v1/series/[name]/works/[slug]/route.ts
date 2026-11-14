import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ApiError, json, withUser } from "@/lib/api";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { seriesDetail, takeOutOfSeries } from "@/lib/series";

export const dynamic = "force-dynamic";

/**
 * Takes one game out of the series. Answers with what is left of the series,
 * or `{ "series": null }` once the last game is out and it is gone.
 */
export const DELETE = withUser<{ name: string; slug: string }>(async (_request, { params, user }) => {
  const { name: rawName, slug } = await params;
  const name = decodeURIComponent(rawName);
  const [work] = await db.select({ id: works.id, series: works.series }).from(works).where(eq(works.slug, slug));
  if (!work || work.series !== name) throw new ApiError("not_found", "That game isn't in this series.");

  await takeOutOfSeries(name, work.id);
  revalidatePath("/series/[name]", "page");
  revalidatePath("/work/[slug]", "page");
  revalidatePath("/version/[id]", "page");
  revalidatePath("/");
  return json({ series: await seriesDetail(user.id, name) });
});
