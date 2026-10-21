import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { seriesHref } from "@/lib/series";

import { removeSeries } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  return { title: `Remove ${decodeURIComponent((await params).name)}` };
}

/** Its own page, as deleting a game is: one tap on the series page should not undo a series. */
export default async function RemoveSeriesPage({ params }: { params: Promise<{ name: string }> }) {
  await requireUser();
  const name = decodeURIComponent((await params).name);

  const [found] = await db.select({ n: count() }).from(works).where(eq(works.series, name));
  if (!found || found.n === 0) notFound();

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={seriesHref(name)} className="underline">
          {name}
        </Link>
      </p>
      <h1 className="mb-4 font-display text-3xl">Remove the series {name}?</h1>
      <p className="max-w-xl">
        Its {found.n === 1 ? "game stays" : `${found.n} games stay`} where{" "}
        {found.n === 1 ? "it is" : "they are"}, on your shelf and off it, with your ratings and reviews. Only
        the series goes.
      </p>

      <form action={removeSeries} className="mt-6 flex items-center gap-4">
        <input type="hidden" name="name" value={name} />
        <button type="submit" className="btn btn-danger">
          Remove the series
        </button>
        <Link href={seriesHref(name)} className="font-narrow text-ink-dim underline hover:text-ink">
          Keep it
        </Link>
      </form>
    </main>
  );
}
