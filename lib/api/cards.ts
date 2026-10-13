import type { EntryDetail } from "@/lib/entries/read";
import type { ShelfRow } from "@/lib/shelf";

/**
 * The one shape a shelf item has on the phone, in both apps. What only games
 * have sits under `extra`, so the phone's grid is written once for books and
 * games and only the detail screens differ.
 */
export type Card = {
  id: string;
  versionId: string;
  workSlug: string;
  title: string;
  subtitle: string;
  creator: string | null;
  coverUrl: string | null;
  shelf: string;
  rating: number | null;
  completion: string | null;
  isFavourite: boolean;
  year: number | null;
  addedAt: string | null;
  lastFinishedOn: string | null;
  series: { name: string; position: null } | null;
  extra: {
    platform: string | null;
    kind: string | null;
    community: boolean;
    workKind: string | null;
    parentWorkId: string | null;
    parentWorkTitle: string | null;
    coverNeedsReview: boolean;
  };
};

/** Dates arrive from the view as Date or as text depending on the column; both leave as ISO strings. */
function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function cardFrom(row: ShelfRow): Card {
  return {
    id: row.entryId ?? "",
    versionId: row.versionId ?? "",
    workSlug: row.workSlug ?? "",
    title: row.workTitle ?? "Untitled",
    subtitle: row.versionName ?? "",
    creator: row.versionAuthor,
    coverUrl: row.coverUrl,
    shelf: row.status ?? "backlog",
    rating: row.rating,
    completion: row.completion,
    isFavourite: row.isFavourite ?? false,
    year: row.releaseYear,
    addedAt: iso(row.addedAt),
    lastFinishedOn: iso(row.lastFinishedOn),
    // Games have no position within a series; the field is there so a book's
    // and a game's card read the same.
    series: row.series ? { name: row.series, position: null } : null,
    extra: {
      platform: row.platformName,
      kind: row.versionKind,
      community: row.isCommunityVersion ?? false,
      workKind: row.workKind,
      parentWorkId: row.parentWorkId,
      parentWorkTitle: row.parentWorkTitle,
      coverNeedsReview: row.coverNeedsReview ?? false,
    },
  };
}

/** One entry in full: its card, plus what the shelf leaves out. */
export function entryJson(detail: EntryDetail) {
  return {
    ...cardFrom(detail.row),
    review: detail.review,
    reviewHasSpoilers: detail.reviewHasSpoilers,
    isPrivate: detail.isPrivate,
    tags: detail.tags,
  };
}
