import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entries, entryCards, plays } from "@/lib/db/schema";

import { ShelfLink } from "../shelf-link";

export const dynamic = "force-dynamic";

/**
 * A play with a finish date but `unfinished` is where you stopped, not where you
 * got to the end. Only these three count as finishing something.
 */
const FINISHED = ["credits", "completed", "mastered"] as const;

function hours(value: string | number | null): string {
  const n = Number(value ?? 0);
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

/** A hairline of proportional width. Enough to read a shape from, not a chart. */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <span className="block h-px bg-ink-dim" style={{ width: `${Math.max(pct, 2)}%` }} />
  );
}

export default async function StatsPage() {
  const user = await requireUser();

  const finishedYear = sql`extract(year from ${plays.finishedOn})::int`;

  const perYear = await db
    .select({
      year: sql<number>`${finishedYear}`,
      games: sql<number>`count(distinct ${entries.id})::int`,
      finishes: count(),
      hours: sql<string>`coalesce(sum(${plays.hours}), 0)`,
    })
    .from(plays)
    .innerJoin(entries, eq(entries.id, plays.entryId))
    .where(
      and(
        eq(entries.userId, user.id),
        isNotNull(plays.finishedOn),
        inArray(plays.completion, [...FINISHED]),
      ),
    )
    .groupBy(finishedYear)
    .orderBy(desc(finishedYear));

  // Every play, not just the finished ones: time spent on something you dropped
  // was still time spent.
  const [totals] = await db
    .select({
      hours: sql<string>`coalesce(sum(${plays.hours}), 0)`,
      playCount: count(),
    })
    .from(plays)
    .innerJoin(entries, eq(entries.id, plays.entryId))
    .where(eq(entries.userId, user.id));

  const byPlatform = await db
    .select({ name: entryCards.platformName, total: count() })
    .from(entryCards)
    .where(eq(entryCards.userId, user.id))
    .groupBy(entryCards.platformName)
    .orderBy(desc(count()));

  const byProvenance = await db
    .select({ community: entryCards.isCommunityVersion, total: count() })
    .from(entryCards)
    .where(eq(entryCards.userId, user.id))
    .groupBy(entryCards.isCommunityVersion);

  const shelfTotal = byPlatform.reduce((sum, row) => sum + row.total, 0);
  const platformMax = Math.max(1, ...byPlatform.map((row) => row.total));
  const yearMax = Math.max(1, ...perYear.map((row) => row.games));
  const community = byProvenance.find((row) => row.community)?.total ?? 0;
  const official = byProvenance.find((row) => !row.community)?.total ?? 0;

  return (
    <main className="flex-1 p-6 tabular-nums">
      <h1 className="mb-6 text-xl font-medium">Stats</h1>

      <div className="flex max-w-3xl flex-col gap-10">
        <section className="flex flex-wrap gap-10">
          <div>
            <p className="text-2xl">{shelfTotal}</p>
            <p className="font-narrow text-ink-dim">on the shelf</p>
          </div>
          <div>
            <p className="text-2xl">{hours(totals?.hours ?? 0)}</p>
            <p className="font-narrow text-ink-dim">
              hours across {totals?.playCount ?? 0} {totals?.playCount === 1 ? "play" : "plays"}
            </p>
          </div>
          <div>
            <p className="text-2xl">{community}</p>
            <p className="font-narrow text-ink-dim">community releases</p>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-medium">Finished per year</h2>
          {perYear.length === 0 ? (
            <p className="font-narrow text-ink-dim">
              Nothing finished yet. Record a play with a finish date and it shows up here.
            </p>
          ) : (
            <ul className="flex flex-col">
              {perYear.map((row) => (
                <li key={row.year} className="border-b border-line py-2">
                  <div className="flex items-baseline gap-4">
                    <span className="w-12 font-mono">{row.year}</span>
                    <span className="w-28 font-narrow">
                      {row.games} {row.games === 1 ? "game" : "games"}
                    </span>
                    <span className="font-narrow text-ink-dim">
                      {hours(row.hours)}h
                      {row.finishes > row.games
                        ? ` · ${row.finishes} finishes including replays`
                        : ""}
                    </span>
                  </div>
                  <Bar value={row.games} max={yearMax} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-medium">Platforms</h2>
          <ul className="flex flex-col">
            {byPlatform.map((row) => (
              <li key={row.name ?? "none"} className="border-b border-line py-2">
                <div className="flex items-baseline gap-4">
                  <span className="w-56 truncate font-narrow">{row.name ?? "No platform"}</span>
                  <span className="font-narrow text-ink-dim">{row.total}</span>
                </div>
                <Bar value={row.total} max={platformMax} />
              </li>
            ))}
          </ul>
          <p className="mt-3 font-narrow text-ink-dim">
            {official} official {official === 1 ? "release" : "releases"}, {community} community.
            Romhacks, ports and translations count the same as anything else.
          </p>
        </section>

        <p className="font-narrow text-ink-dim">
          <ShelfLink className="underline">Back to the shelf</ShelfLink>
        </p>
      </div>
    </main>
  );
}
