import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entries, versions, works } from "@/lib/db/schema";
import { draftFromIgdb } from "@/lib/entries/draft";
import { getGameById } from "@/lib/igdb/games";
import { igdbImageUrl, IgdbError } from "@/lib/igdb/types";
import { igdbResultFor } from "@/lib/search";
import { seriesInUse } from "@/lib/series";

import { safeBack } from "./href";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Add a game" };

/**
 * Between picking a search result and it being saved: IGDB's details, to
 * put right first (Jay, 2026-10-21). This page only reads; the form's Add
 * writes everything in one go, and leaving it leaves no trace.
 */
export default async function AddFromIgdbPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string; platform?: string }>;
}) {
  const user = await requireUser();
  const igdbId = Number((await params).id);
  if (!Number.isInteger(igdbId) || igdbId <= 0) notFound();
  const query = await searchParams;
  const back = safeBack(query.back);

  let game;
  let failure: string | null = null;
  try {
    game = await getGameById(igdbId);
  } catch (err) {
    failure = err instanceof IgdbError ? `IGDB did not answer (${err.status ?? "no response"})` : "IGDB could not be reached";
  }
  if (!game) {
    return (
      <main className="flex-1 px-4 py-6 sm:px-10">
        <p role="status" className="max-w-2xl border-l-2 border-ink-dim pl-3 font-narrow">
          {failure ? `${failure}, so there is nothing to add it from. Try again in a moment.` : "IGDB no longer has that game."}{" "}
          <Link href={back} className="underline">
            Go back
          </Link>
        </p>
      </main>
    );
  }

  const [here] = await db
    .select({ id: works.id, slug: works.slug, title: works.title, coverUrl: works.coverUrl })
    .from(works)
    .where(eq(works.igdbId, igdbId));
  const [mine] = here
    ? await db
        .select({ versionId: versions.id })
        .from(entries)
        .innerJoin(versions, eq(versions.id, entries.versionId))
        .where(and(eq(entries.userId, user.id), eq(versions.workId, here.id), eq(versions.kind, "original")))
        .limit(1)
    : [];

  const result = igdbResultFor(game);
  const asked = Number(query.platform);
  const platformId = result.platformOptions.some((option) => option.id === asked) ? asked : result.defaultPlatformId;

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={back} className="underline">
          {back.startsWith("/search") ? "Back to search" : "Back"}
        </Link>
      </p>
      <h1 className="mb-2 font-display text-3xl">Add {here?.title ?? game.name}</h1>
      <p className="mb-6 max-w-2xl font-narrow text-ink-dim">
        {here ? (
          <>
            This game is on your server already, so its details are the ones it has here; change them with{" "}
            <Link href={`/work/${here.slug}/edit`} className="underline">
              Edit details
            </Link>{" "}
            on its page.
          </>
        ) : (
          "These are IGDB's details. Put anything right before adding: nothing is saved until you do."
        )}
      </p>

      {mine ? (
        <p className="mb-6 max-w-2xl font-narrow">
          Already on your shelf:{" "}
          <Link href={`/version/${mine.versionId}`} className="underline">
            open it
          </Link>
          .
        </p>
      ) : null}

      <ReviewForm
        igdbId={igdbId}
        draft={here ? null : draftFromIgdb(game)}
        seriesNames={here ? [] : await seriesInUse()}
        cover={here ? here.coverUrl : game.cover ? igdbImageUrl(game.cover.image_id, "cover_big") : null}
        platforms={result.platformOptions}
        defaultPlatformId={platformId}
        defaultStatus={result.defaultStatus}
        cancelHref={back}
      />
    </main>
  );
}
