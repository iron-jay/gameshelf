import { cookies } from "next/headers";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { versionKind } from "@/lib/db/schema";

import { platformsInUse } from "@/lib/platforms";
import {
  isShelfSort,
  SHELF_SORTS,
  shelfPlatforms,
  shelfRows,
  userTags,
  type ShelfSort,
} from "@/lib/shelf";
import { isStatus, STATUS_LABELS, STATUS_ORDER } from "@/lib/status";

import { FilterForm } from "./filter-form";
import { NowPlaying } from "./now-playing";
import { RememberShelfView } from "./remember-shelf-view";
import { ResolveOnce } from "./resolve-once";
import { ShelfGrid, type ShelfSection } from "./shelf-grid";
import { preferencesFrom, SHELF_VIEW_COOKIE } from "./shelf-view";
import { ShelfTile, type ShelfCard } from "./shelf-tile";

export const dynamic = "force-dynamic";

const GROUPINGS = {
  none: "No grouping",
  platform: "Platform",
  year: "Year released",
  status: "Shelf",
  kind: "Kind",
  series: "Series",
} as const;
type GroupBy = keyof typeof GROUPINGS;

type Params = {
  status?: string;
  platform?: string;
  sort?: string;
  dlc?: string;
  shelf?: string;
  groupBy?: string;
  /** "all" for the whole wall; otherwise a bare "/" is the shelves overview. */
  view?: string;
};

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

const SELECT = "field";

/** The overview's rows, in the order you look for things: next, done, wanted, gave up. */
const ROOM_ORDER = ["backlog", "played", "wishlist", "dropped"] as const;
const ROOM_TITLES: Record<(typeof ROOM_ORDER)[number], string> = {
  backlog: "Backlog",
  played: "Recently played",
  wishlist: "Wishlist",
  dropped: "Dropped",
};
/** A strip is a glimpse; "See all" is the whole shelf. */
const STRIP_LENGTH = 24;

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
  series: string | null;
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
    case "series":
      // Same "unknowns last" rule as platform: U+FFFF sorts after any real
      // name, so the games in no series end up at the bottom.
      return { label: row.series ?? "No series", order: row.series ?? "￿" };
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
  const sort: ShelfSort = isShelfSort(params.sort) ? params.sort : "added";
  const groupBy: GroupBy = isGroupBy(params.groupBy) ? params.groupBy : "none";
  const platform = params.platform?.trim() || undefined;
  const shelfSlug = params.shelf?.trim() || undefined;
  // The DLC toggle and the grouping selector are different axes, so they get
  // separate parameters rather than sharing an ambiguous "group".
  const nestDlc = params.dlc !== "separate";

  const rows = await shelfRows(user.id, { status, platform, tag: shelfSlug, sort });
  const platforms = await shelfPlatforms(user.id);
  const shelfOptions = await userTags(user.id);

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

  // A bare "/" is the room: the playing band, then a strip per shelf. Asking
  // for a shelf, a platform, a tag or the whole wall is asking for the wall.
  const overview = !status && !platform && !shelfSlug && params.view !== "all";

  if (overview) {
    const cards = visible.map((row) => toCard(row as Row));
    const playing = cards.filter((card) => card.status === "playing");

    // Played reads newest-finished first: what you last put down is what you
    // came to rate or talk about.
    const finishedOn = new Map(visible.map((row) => [row.entryId ?? "", row.lastFinishedOn ?? ""]));
    const rooms = ROOM_ORDER.map((value) => {
      const all = cards.filter((card) => card.status === value);
      if (value === "played") {
        all.sort((a, b) => (finishedOn.get(b.entryId) ?? "").localeCompare(finishedOn.get(a.entryId) ?? ""));
      }
      return { value, title: ROOM_TITLES[value], count: all.length, cards: all.slice(0, STRIP_LENGTH) };
    }).filter((room) => room.count > 0);

    let tileIndex = 0;

    return (
      <main className="flex-1">
        <RememberShelfView query={queryFor(params)} />
        <NowPlaying cards={playing} />

        <ResolveOnce>
        <div className="px-4 pb-14 sm:px-10">
          {rooms.map((room) => (
            <section key={room.value} className="mt-8">
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-2xl sm:text-[26px]">{room.title}</h2>
                <span className="text-ink-dim">{room.count}</span>
                <div className="flex-1" />
                <Link
                  href={hrefWith({}, { status: room.value })}
                  className="font-narrow text-ink-dim underline underline-offset-4 hover:text-ink"
                >
                  See all {room.count}
                </Link>
              </div>
              <ul className="shelf-strip">
                {room.cards.map((card) => (
                  <ShelfTile
                    key={card.entryId}
                    card={card}
                    index={tileIndex++}
                    className="w-[30vw] max-w-36 sm:w-36"
                    sizes="144px"
                  />
                ))}
              </ul>
              <div className="plank" />
            </section>
          ))}

          {cards.length === 0 ? (
            <p className="mt-8 font-narrow text-ink-dim">
              Nothing here yet.{" "}
              <Link href="/search" className="underline">
                Search for a game
              </Link>{" "}
              to start a shelf.
            </p>
          ) : (
            <p className="mt-10 font-narrow text-ink-dim">
              {cards.length} {cards.length === 1 ? "game" : "games"} on your shelves.{" "}
              <Link href="/?view=all" className="underline underline-offset-4 hover:text-ink">
                See them all, with filters
              </Link>
            </p>
          )}
        </div>
        </ResolveOnce>
      </main>
    );
  }

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
    .map(([label, group]) => ({
      label: groupBy === "status" ? (STATUS_LABELS[label as keyof typeof STATUS_LABELS] ?? label) : label,
      cards: group.cards,
    }));

  return (
    <main className="flex-1 px-4 pt-4 pb-14 sm:px-10">
      <RememberShelfView query={queryFor(params)} />

      <h1 className="mb-4 font-display text-3xl sm:text-4xl">
        {status ? STATUS_LABELS[status] : "All games"}
      </h1>

      {/* One row on a phone, scrolled sideways, rather than wrapping into
          three rows of tabs above the first cover. */}
      <nav className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="segmented inline-flex flex-nowrap">
          <Link
            href={hrefWith(params, { status: undefined, view: "all" })}
            aria-current={status ? undefined : "page"}
          >
            All
          </Link>
          {STATUS_ORDER.map((value) => (
            <Link
              key={value}
              href={hrefWith(params, { status: value, view: undefined })}
              aria-current={status === value ? "page" : undefined}
            >
              {STATUS_LABELS[value]}
            </Link>
          ))}
        </div>
      </nav>

      <FilterForm defaults={{ sort: "added", groupBy: "none" }}>
        {status ? <input type="hidden" name="status" value={status} /> : null}
        {!status ? <input type="hidden" name="view" value="all" /> : null}

        <label>
          <span className="sr-only">Sort</span>
          <select name="sort" defaultValue={sort} className={SELECT}>
            {Object.entries(SHELF_SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Group</span>
          <select name="groupBy" defaultValue={groupBy} className={SELECT}>
            {Object.entries(GROUPINGS).map(([value, label]) => (
              <option key={value} value={value}>
                {value === "none" ? label : `Group by ${label.toLowerCase()}`}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Platform</span>
          <select name="platform" defaultValue={platform ?? ""} className={SELECT}>
            <option value="">All platforms</option>
            {platforms.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        {shelfOptions.length > 0 ? (
          <label>
            <span className="sr-only">Tag</span>
            <select name="shelf" defaultValue={shelfSlug ?? ""} className={SELECT}>
              <option value="">All tags</option>
              {shelfOptions.map((shelf) => (
                <option key={shelf.slug} value={shelf.slug}>
                  {shelf.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex shrink-0 items-center gap-2 text-ink-dim">
          <input type="checkbox" name="dlc" value="separate" defaultChecked={!nestDlc} />
          Show DLC separately
        </label>

        <span className="shrink-0 text-ink-dim">
          {visible.length} {visible.length === 1 ? "game" : "games"}
          {hiddenCount > 0 ? `, ${hiddenCount} more under their parents` : ""}
        </span>
      </FilterForm>

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
