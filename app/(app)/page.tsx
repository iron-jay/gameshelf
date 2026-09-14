import { and, eq, sql, type SQL } from "drizzle-orm";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryCards, logStatus } from "@/lib/db/schema";

import { ShelfTile, type ShelfCard } from "./shelf-tile";

export const dynamic = "force-dynamic";

type Status = (typeof logStatus.enumValues)[number];

// Section 5 names these three. Title sorting would need works.sort_title on the
// view, which is not worth a column until someone asks for it.
const SORTS = {
  added: "Recently added",
  rated: "Rating",
  finished: "Recently finished",
} as const;
type Sort = keyof typeof SORTS;

const ORDER_BY: Readonly<Record<Sort, SQL>> = {
  added: sql`added_at desc`,
  rated: sql`rating desc nulls last, added_at desc`,
  finished: sql`last_finished_on desc nulls last, added_at desc`,
};

type Params = {
  status?: string;
  platform?: string;
  sort?: string;
  group?: string;
  review?: string;
};

function isStatus(value: string | undefined): value is Status {
  return Boolean(value) && (logStatus.enumValues as readonly string[]).includes(value!);
}

function isSort(value: string | undefined): value is Sort {
  return Boolean(value) && value! in SORTS;
}

function hrefWith(current: Params, patch: Params): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...patch })) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `/?${qs}` : "/";
}

export default async function ShelfPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;

  const status = isStatus(params.status) ? params.status : undefined;
  const sort: Sort = isSort(params.sort) ? params.sort : "added";
  const platform = params.platform?.trim() || undefined;
  const grouped = params.group !== "off";

  const filters = [eq(entryCards.userId, user.id)];
  if (status) filters.push(eq(entryCards.status, status));
  if (platform) filters.push(eq(entryCards.platformName, platform));
  // Section 4a: art applied from a fuzzy match is findable again.
  if (params.review === "needed") filters.push(eq(entryCards.coverNeedsReview, true));

  const rows = await db
    .select()
    .from(entryCards)
    .where(and(...filters))
    .orderBy(ORDER_BY[sort]);

  // Only the platforms actually on the shelf, so the filter never offers a
  // choice that returns nothing.
  const platformRows = await db
    .selectDistinct({ name: entryCards.platformName })
    .from(entryCards)
    .where(eq(entryCards.userId, user.id));
  const platforms = platformRows
    .map((row) => row.name)
    .filter((name): name is string => Boolean(name))
    .sort();

  // A Destiny 2 player's shelf is otherwise 90% Destiny 2. A child whose parent
  // is not itself on the shelf still shows, or it would vanish entirely.
  const presentWorkIds = new Set(rows.map((row) => row.workId));
  const visible = grouped
    ? rows.filter((row) => !row.parentWorkId || !presentWorkIds.has(row.parentWorkId))
    : rows;

  const hiddenCount = rows.length - visible.length;

  const cards: ShelfCard[] = visible.map((row) => ({
    entryId: row.entryId ?? "",
    workSlug: row.workSlug ?? "",
    workTitle: row.workTitle ?? "Untitled",
    versionName: row.versionName ?? "",
    versionAuthor: row.versionAuthor,
    platformName: row.platformName,
    status: row.status ?? "backlog",
    rating: row.rating,
    coverUrl: row.coverUrl,
    isCommunityVersion: row.isCommunityVersion ?? false,
    coverNeedsReview: row.coverNeedsReview ?? false,
  }));

  return (
    <main className="flex-1 p-6">
      <nav className="mb-4 flex flex-wrap items-center gap-4 font-narrow">
        <Link
          href={hrefWith(params, { status: undefined })}
          className={status ? "text-ink-dim hover:text-ink" : "font-medium"}
        >
          All
        </Link>
        {logStatus.enumValues.map((value) => (
          <Link
            key={value}
            href={hrefWith(params, { status: value })}
            className={status === value ? "font-medium" : "text-ink-dim hover:text-ink"}
          >
            {value}
          </Link>
        ))}
      </nav>

      <form action="/" className="mb-6 flex flex-wrap items-center gap-3 font-narrow">
        {status ? <input type="hidden" name="status" value={status} /> : null}

        <select
          name="sort"
          defaultValue={sort}
          className="border border-line bg-panel px-2 py-1.5 text-ink"
        >
          {Object.entries(SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          name="platform"
          defaultValue={platform ?? ""}
          className="border border-line bg-panel px-2 py-1.5 text-ink"
        >
          <option value="">All platforms</option>
          {platforms.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-ink-dim">
          <input type="checkbox" name="group" value="off" defaultChecked={!grouped} />
          Show DLC separately
        </label>

        <button
          type="submit"
          className="border border-line bg-panel px-3 py-1.5 hover:border-ink-dim"
        >
          Apply
        </button>

        <Link
          href={hrefWith(params, { review: params.review === "needed" ? undefined : "needed" })}
          className={params.review === "needed" ? "font-medium" : "text-ink-dim hover:text-ink"}
        >
          Covers needing review
        </Link>

        <span className="text-ink-dim">
          {visible.length} {visible.length === 1 ? "entry" : "entries"}
          {hiddenCount > 0 ? ` · ${hiddenCount} grouped under parents` : ""}
        </span>
      </form>

      {cards.length === 0 ? (
        <p className="font-narrow text-ink-dim">
          Nothing here yet. <Link href="/search" className="underline">Search for a game</Link> to
          start a shelf.
        </p>
      ) : (
        <ul className="grid gap-px [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
          {/* Gaps show the page ground rather than a container colour: a filled
              background would paint the empty cells of the last row as a slab. */}
          {cards.map((card, index) => (
            <ShelfTile key={card.entryId} card={card} index={index} />
          ))}
        </ul>
      )}
    </main>
  );
}
