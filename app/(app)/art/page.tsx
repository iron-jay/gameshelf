import { and, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryCards } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Covers that were applied on a fuzzy match and flagged for a second look
 * (§4a).
 *
 * Its own page rather than a filter on the shelf: it is a job you sit down and
 * work through, not a way of looking at what you own, and a permanent line
 * above the grid counting your unfinished chores is not what the shelf is for.
 */
export default async function ArtReviewPage() {
  const user = await requireUser();

  const rows = await db
    .select()
    .from(entryCards)
    .where(and(eq(entryCards.userId, user.id), eq(entryCards.coverNeedsReview, true)));

  return (
    <main className="flex-1 p-6">
      <h1 className="mb-2 text-xl font-medium">Cover art to review</h1>
      <p className="mb-6 max-w-2xl font-narrow text-ink-dim">
        Art that matched on something close rather than exact, so it was applied and flagged.
        Choosing art for one — or keeping what is there — clears the flag.
      </p>

      {rows.length === 0 ? (
        <p className="font-narrow text-ink-dim">
          Nothing flagged.{" "}
          <Link href="/" className="underline">
            Back to the shelf
          </Link>
          .
        </p>
      ) : (
        <ul className="flex max-w-3xl flex-col">
          {rows.map((row) => (
            <li key={row.entryId} className="flex items-center gap-4 border-b border-line py-3">
              <div className="h-16 w-12 shrink-0 bg-panel">
                {row.coverUrl ? (
                  <Image
                    src={row.coverUrl}
                    alt=""
                    width={48}
                    height={64}
                    className="h-16 w-12 object-cover"
                    unoptimized
                  />
                ) : null}
              </div>

              <div className="min-w-0">
                <p className="truncate">{row.workTitle}</p>
                <p className="truncate font-narrow text-ink-dim">
                  {[row.versionName, row.versionAuthor].filter(Boolean).join(" · ")}
                </p>
              </div>

              <Link
                href={`/work/${row.workSlug}/art?version=${row.versionId}`}
                className="ml-auto shrink-0 border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim"
              >
                Review
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
