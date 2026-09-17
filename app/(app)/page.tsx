import { and, asc, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entryCards, shelfEntries, shelves, versionKind } from "@/lib/db/schema";

import { platformsInUse } from "@/lib/platforms";
import { isStatus, STATUS_ORDER } from "@/lib/status";

import { FilterForm } from "./filter-form";
import { RememberShelfView } from "./remember-shelf-view";
import { ShelfGrid, type ShelfSection } from "./shelf-grid";
import { preferencesFrom, SHELF_VIEW_COOKIE } from "./shelf-view";
import { type ShelfCard } from "./shelf-tile";

export const dynamic = "force-dynamic";

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

const GROUPINGS = {
  none: "No grouping",
  platform: "Platform",
  year: "Year released",
  status: "Shelf",
  kind: "Kind",
} as const;
type GroupBy = keyof typeof GROUPINGS;

type Params = {
  status?: string;
  platform?: string;
  sort?: string;
  dlc?: string;
  review?: string;
  shelf?: string;
  groupBy?: string;
};

function isSort(value: string | undefined): value is Sort {
  return Boolean(value) && value! in SORTS;
}

function isGroupBy(value: string | undefined): value is GroupBy {
  return Boolean(value) && value! in GROUPINGS;
}

function queryFor(params: Params): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return query.toString();
}

function hrefWith(current: Params, patch: Params): string {
  const qs = queryFor({ ...current, ...patch });
  return qs ? `/?${qs}` : "/";
}

const SELECT = "border border-line bg-panel px-2 py-1.5 text-ink";

type Row = {
  entryId: string | null;
  versionId: string | null;
  workId: string | null;
  workSlug: string | null;
  workTitle: string | null;
  versionName: string | null;
  versionAuthor: string | null;
  versionKind: string | null;
  platformName: string | null;
  parentWorkId: string | null;
  status: string | null;
  rating: number | null;
  coverUrl: string | null;
  isCommunityVersion: boolean | null;
  coverNeedsReview: boolean | null;
  releaseYear: number | null;
};

/**
 * The bucket a row belongs in, plus how to order the buckets. Unknowns sort
 * last everywhere — an entry with no platform should not lead the page.
 */
function bucketFor(row: Row, groupBy: GroupBy): { label: string; order: number | string } {
  switch (groupBy) {
    case "platform":
      return { label: row.platformName ?? "No platform", order: row.platformName ?? "￿" };
    case "year":
      return {
        label: row.releaseYear ? String(row.releaseYear) : "Year unknown",
        // Negated so the newest year sorts first.
        order: row.releaseYear ? -row.releaseYear : Number.POSITIVE_INFINITY,
      };
    case "status":
      return {
        label: row.status ?? "backlog",
        order: (STATUS_ORDER as readonly string[]).indexOf(row.status ?? "backlog"),
      };
    case "kind":
      return {
        label: (row.versionKind ?? "other").replace(/_/g, " "),
        order: (versionKind.enumValues as readonly string[]).indexOf(row.versionKind ?? "other"),
      };
    default:
      return { label: "", order: 0 };
  }
}

export default async function ShelfPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();

  // A bare "/" is not a reset — it is your own way of looking at the shelf. The
  // URL still wins wherever it says anything, so a shared or bookmarked link
  // shows what it says rather than what the reader happens to prefer.
  const asked = await searchParams;
  const params: Params = {
    ...preferencesFrom((await cookies()).get(SHELF_VIEW_COOKIE)?.value),
    ...asked,
  };

  const status = isStatus(params.status) ? params.status : undefined;
  const sort: Sort = isSort(params.sort) ? params.sort : "added";
  const groupBy: GroupBy = isGroupBy(params.groupBy) ? params.groupBy : "none";
  const platform = params.platform?.trim() || undefined;
  const shelfSlug = params.shelf?.trim() || undefined;
  const reviewOnly = params.review === "needed";
  // The DLC toggle and the grouping selector are different axes, so they get
  // separate parameters rather than sharing an ambiguous "group".
  const nestDlc = params.dlc !== "separate";

  const filters = [eq(entryCards.userId, user.id)];
  if (status) filters.push(eq(entryCards.status, status));
  if (platform) filters.push(eq(entryCards.platformName, platform));
  if (reviewOnly) filters.push(eq(entryCards.coverNeedsReview, true));
  if (shelfSlug) {
    filters.push(
      inArray(
        entryCards.entryId,
        db
          .select({ id: shelfEntries.entryId })
          .from(shelfEntries)
          .innerJoin(shelves, eq(shelves.id, shelfEntries.shelfId))
          .where(and(eq(shelves.userId, user.id), eq(shelves.slug, shelfSlug))),
      ),
    );
  }

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

  const shelfOptions = await db
    .select({ slug: shelves.slug, name: shelves.name })
    .from(shelves)
    .where(eq(shelves.userId, user.id))
    .orderBy(asc(shelves.name));

  const [reviewCount] = await db
    .select({ total: count() })
    .from(entryCards)
    .where(and(eq(entryCards.userId, user.id), eq(entryCards.coverNeedsReview, true)));

  // A Destiny 2 player's shelf is otherwise 90% Destiny 2. A child whose parent
  // is not itself on the shelf still shows, or it would vanish entirely.
  const presentWorkIds = new Set(rows.map((row) => row.workId));
  const visible = nestDlc
    ? rows.filter((row) => !row.parentWorkId || !presentWorkIds.has(row.parentWorkId))
    : rows;

  const hiddenCount = rows.length - visible.length;

  const toCard = (row: Row): ShelfCard => ({
    entryId: row.entryId ?? "",
    versionId: row.versionId ?? "",
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
  });

  const groups = new Map<string, { order: number | string; cards: ShelfCard[] }>();
  for (const row of visible) {
    const { label, order } = bucketFor(row as Row, groupBy);
    const group = groups.get(label) ?? { order, cards: [] };
    group.cards.push(toCard(row as Row));
    groups.set(label, group);
  }

  const sections: ShelfSection[] = [...groups.entries()]
    .sort((a, b) =>
      typeof a[1].order === "number" && typeof b[1].order === "number"
        ? a[1].order - b[1].order
        : String(a[1].order).localeCompare(String(b[1].order)),
    )
    .map(([label, group]) => ({ label, cards: group.cards }));

  return (
    <main className="flex-1 p-6">
      <RememberShelfView query={queryFor(params)} />

      <nav className="mb-4 flex flex-wrap items-center gap-4 font-narrow">
        <Link
          href={hrefWith(params, { status: undefined })}
          className={status ? "text-ink-dim hover:text-ink" : "font-medium"}
        >
          All
        </Link>
        {STATUS_ORDER.map((value) => (
          <Link
            key={value}
            href={hrefWith(params, { status: value })}
            className={status === value ? "font-medium" : "text-ink-dim hover:text-ink"}
          >
            {value}
          </Link>
        ))}
      </nav>

      <FilterForm defaults={{ sort: "added", groupBy: "none" }}>
        {status ? <input type="hidden" name="status" value={status} /> : null}
        {reviewOnly ? <input type="hidden" name="review" value="needed" /> : null}

        <select name="sort" defaultValue={sort} className={SELECT}>
          {Object.entries(SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select name="groupBy" defaultValue={groupBy} className={SELECT}>
          {Object.entries(GROUPINGS).map(([value, label]) => (
            <option key={value} value={value}>
              {value === "none" ? label : `Group by ${label.toLowerCase()}`}
            </option>
          ))}
        </select>

        <select name="platform" defaultValue={platform ?? ""} className={SELECT}>
          <option value="">All platforms</option>
          {platforms.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        {shelfOptions.length > 0 ? (
          <select name="shelf" defaultValue={shelfSlug ?? ""} className={SELECT}>
            <option value="">All tags</option>
            {shelfOptions.map((shelf) => (
              <option key={shelf.slug} value={shelf.slug}>
                {shelf.name}
              </option>
            ))}
          </select>
        ) : null}

        <label className="flex items-center gap-2 text-ink-dim">
          <input type="checkbox" name="dlc" value="separate" defaultChecked={!nestDlc} />
          Show DLC separately
        </label>

        <span className="text-ink-dim">
          {visible.length} {visible.length === 1 ? "entry" : "entries"}
          {hiddenCount > 0 ? ` · ${hiddenCount} grouped under parents` : ""}
        </span>
      </FilterForm>

      {/* Only worth offering when there is something to review. Kept visible
          while the filter is on, so turning it off does not require the URL. */}
      {reviewCount.total > 0 || reviewOnly ? (
        <p className="mb-6 font-narrow">
          <Link
            href={hrefWith(params, { review: reviewOnly ? undefined : "needed" })}
            className={
              reviewOnly ? "font-medium underline" : "text-ink-dim underline hover:text-ink"
            }
          >
            {reviewOnly
              ? "Showing covers needing review — show everything"
              : `${reviewCount.total} ${reviewCount.total === 1 ? "cover needs" : "covers need"} review`}
          </Link>
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="font-narrow text-ink-dim">
          Nothing here yet. <Link href="/search" className="underline">Search for a game</Link> to
          start a shelf.
        </p>
      ) : (
        <ShelfGrid
          sections={sections}
          grouped={groupBy !== "none"}
          // Bulk changes reach whatever is selected, so the target list is the
          // same one the version form offers rather than only what is on screen.
          platforms={await platformsInUse()}
          statuses={STATUS_ORDER}
        />
      )}
    </main>
  );
}
