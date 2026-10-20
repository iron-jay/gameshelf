import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { entries, versions, works } from "@/lib/db/schema";
import { shelfRows, type ShelfFilters, type ShelfRow } from "@/lib/shelf";
import type { Status } from "@/lib/status";

/**
 * DLC lives under its game (Jay, 2026-10-20). It keeps its own shelf, rating
 * and review — that is the point of it being a work (CLAUDE.md §2) — but it is
 * listed on the game's pages rather than standing on the shelf beside it,
 * unless the game is set to show its DLC as games of their own.
 */

/** What the shelf shows, and how much DLC each game is holding under it. */
export type FoldedShelf = {
  rows: ShelfRow[];
  /** Game work id → how many of the rows left out sit under it. */
  under: Map<string, number>;
};

/**
 * The rule, in one place for the web and the phone: a DLC entry leaves the
 * shelf when its game is on your shelf too and has not asked for its DLC to
 * be shown. "On your shelf" means anywhere within the same platform and tag
 * filters, not only on the shelf being looked at, so the Played shelf does not
 * fill with expansions just because the game itself is still on Playing.
 *
 * One exception: something you are playing is never hidden from Playing by a
 * game that is not. Now playing is where you look for it.
 */
export async function foldedShelfRows(userId: string, filters: ShelfFilters = {}): Promise<FoldedShelf> {
  const rows = await shelfRows(userId, filters);
  const everywhere = filters.status ? await shelfRows(userId, { ...filters, status: undefined }) : rows;
  return foldDlc(rows, everywhere, await gamesShowingDlc());
}

export function foldDlc(
  rows: ShelfRow[],
  everywhere: readonly ShelfRow[],
  showing: ReadonlySet<string>,
): FoldedShelf {
  const shelvesByWork = new Map<string, Set<Status>>();
  for (const row of everywhere) {
    if (!row.workId || !row.status) continue;
    const found = shelvesByWork.get(row.workId) ?? new Set<Status>();
    found.add(row.status);
    shelvesByWork.set(row.workId, found);
  }

  const under = new Map<string, number>();
  const kept = rows.filter((row) => {
    const parent = row.parentWorkId;
    if (!parent || showing.has(parent)) return true;
    const parentShelves = shelvesByWork.get(parent);
    // A DLC whose game is not here at all would otherwise vanish entirely.
    if (!parentShelves) return true;
    if (row.status === "playing" && !parentShelves.has("playing")) return true;
    under.set(parent, (under.get(parent) ?? 0) + 1);
    return false;
  });

  return { rows: kept, under };
}

/** The games set to show their DLC on the shelf. A handful at most, so read whole. */
export async function gamesShowingDlc(): Promise<Set<string>> {
  const rows = await db.select({ id: works.id }).from(works).where(eq(works.dlcOnShelf, true));
  return new Set(rows.map((row) => row.id));
}

export type DlcItem = {
  workId: string;
  slug: string;
  title: string;
  workKind: string;
  year: number | null;
  coverUrl: string | null;
  /** The version a tap opens: the one on your shelf, else the first. */
  versionId: string | null;
  /** Your entry on it, if it is on your shelf. */
  entryId: string | null;
  status: Status | null;
  rating: number | null;
};

/** A game's DLC, oldest first, each with your shelf state beside it. */
export async function dlcOf(userId: string, workId: string): Promise<DlcItem[]> {
  const children = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      workKind: works.workKind,
      firstReleaseDate: works.firstReleaseDate,
      coverUrl: works.coverUrl,
    })
    .from(works)
    .where(eq(works.parentWorkId, workId))
    .orderBy(asc(works.firstReleaseDate), asc(works.title));
  if (children.length === 0) return [];

  const childIds = children.map((child) => child.id);
  const versionRows = await db
    .select({ id: versions.id, workId: versions.workId, coverUrl: versions.coverUrl })
    .from(versions)
    .where(inArray(versions.workId, childIds))
    .orderBy(asc(versions.createdAt));
  const mine = await db
    .select({
      id: entries.id,
      versionId: entries.versionId,
      status: entries.status,
      rating: entries.rating,
    })
    .from(entries)
    .innerJoin(versions, eq(versions.id, entries.versionId))
    .where(and(eq(entries.userId, userId), inArray(versions.workId, childIds)));
  const entryByVersion = new Map(mine.map((entry) => [entry.versionId, entry]));

  return children.map((child) => {
    const own = versionRows.filter((version) => version.workId === child.id);
    const shelved = own.find((version) => entryByVersion.has(version.id));
    const version = shelved ?? own[0];
    const entry = shelved ? entryByVersion.get(shelved.id) : undefined;
    return {
      workId: child.id,
      slug: child.slug,
      title: child.title,
      workKind: child.workKind,
      year: child.firstReleaseDate ? Number(child.firstReleaseDate.slice(0, 4)) : null,
      // DLC versions are official releases, so the work's art stands in.
      coverUrl: version?.coverUrl ?? child.coverUrl,
      versionId: version?.id ?? null,
      entryId: entry?.id ?? null,
      status: entry?.status ?? null,
      rating: entry?.rating ?? null,
    };
  });
}

/** Turns a game's "show its DLC on the shelf" on or off. False when there is no such game. */
export async function setDlcOnShelf(workId: string, show: boolean): Promise<boolean> {
  const updated = await db
    .update(works)
    .set({ dlcOnShelf: show })
    .where(eq(works.id, workId))
    .returning({ id: works.id });
  return updated.length > 0;
}

/**
 * "Destiny 2: Forsaken" is "Forsaken" under Destiny 2. IGDB names DLC after
 * its game, which reads as a stutter in a list that already says whose it is.
 */
export function shortDlcTitle(title: string, gameTitle: string): string {
  if (!title.toLowerCase().startsWith(gameTitle.toLowerCase())) return title;
  const rest = title.slice(gameTitle.length).replace(/^\s*[:\-–—]\s*/, "").trim();
  return rest || title;
}

/** DLC, seasons, episodes and bundles are more of a game; anything else can have more of it. */
export function canHaveDlc(workKind: string): boolean {
  return !["dlc", "season", "episode", "bundle"].includes(workKind);
}

/** IGDB's answer to "whose DLC is this", from the payload stored on add. */
export function parentIgdbIdOf(workKind: string, payload: unknown): number | null {
  if (workKind === "main_game" || !payload || typeof payload !== "object") return null;
  const id = (payload as { parent_game?: unknown }).parent_game;
  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
}
