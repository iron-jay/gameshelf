"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { type SeriesBackfillResult } from "@/lib/series-backfill";
import { clearEverySeries, fillSeriesChunk, igdbIdsNeedingSeries } from "@/lib/series-fill";

/** Settings → Series; the rules are `lib/series-fill.ts`, shared with the API. */

export async function worksNeedingSeries(): Promise<number[]> {
  await requireUser();
  return igdbIdsNeedingSeries();
}

export async function fillSeriesForChunk(igdbIds: number[]): Promise<SeriesBackfillResult> {
  await requireUser();
  const result = await fillSeriesChunk(igdbIds);
  revalidatePath("/");
  return result;
}

export async function clearAllSeries(): Promise<{ cleared: number }> {
  await requireUser();
  const result = await clearEverySeries();
  revalidatePath("/");
  return result;
}
