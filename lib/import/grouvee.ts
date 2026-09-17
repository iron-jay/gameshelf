import type { logStatus } from "@/lib/db/schema";

type Status = (typeof logStatus.enumValues)[number];

export type GrouveeItem = {
  igdbId: number;
  name: string;
  status: Status;
  /** 1..10 half-stars, the way entries.rating stores it. */
  rating: number | null;
  review: string | null;
  /** ISO timestamp, so the imported shelf keeps its original order. */
  addedAt: string | null;
  /** Shelf names that were not just a status in disguise. */
  shelves: string[];
};

export type GrouveeParse = {
  account: string | null;
  exportedAt: string | null;
  items: GrouveeItem[];
  /** Entries with no IGDB id — nothing to match them to. */
  unmatched: string[];
};

/**
 * Grouvee's built-in shelves are a status by another name, so they become one
 * rather than a tag. Anything the user invented stays a shelf.
 */
const SHELF_STATUS: Readonly<Record<string, Status>> = {
  played: "played",
  playing: "playing",
  "currently playing": "playing",
  "to play": "backlog",
  backlog: "backlog",
  "wish list": "wishlist",
  wishlist: "wishlist",
  // Grouvee distinguishes stopping from finishing; gameshelf has four shelves
  // and does not. All of these mean you played it, and how far you got is a
  // play's completion rather than a shelf.
  "did not finish": "played",
  dropped: "played",
  abandoned: "played",
  "on hold": "played",
  shelved: "played",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Reads a Grouvee JSON export.
 *
 * Deliberately forgiving: it is somebody's data and a field they never filled
 * in should not stop the rest importing. Anything it cannot use is reported
 * rather than dropped silently.
 */
export function parseGrouvee(input: unknown): GrouveeParse {
  const doc = asRecord(input);
  if (!doc) {
    throw new Error("That does not look like a Grouvee export.");
  }

  const collection = Array.isArray(doc.collection) ? doc.collection : null;
  if (!collection) {
    throw new Error("No collection in that file — is it the JSON export rather than the CSV?");
  }

  // Reviews live in their own list and carry the rating, so index them by game.
  const reviews = new Map<number, { rating: number | null; text: string | null }>();
  if (Array.isArray(doc.reviews)) {
    for (const entry of doc.reviews) {
      const review = asRecord(entry);
      const game = asRecord(review?.game);
      const igdbId = Number(game?.igdb_id);
      if (!review || !Number.isInteger(igdbId) || igdbId <= 0) continue;

      const parts = [text(review.title), text(review.text)].filter(Boolean);
      reviews.set(igdbId, {
        rating: typeof review.rating === "number" ? review.rating : null,
        text: parts.length ? parts.join("\n\n") : null,
      });
    }
  }

  const items: GrouveeItem[] = [];
  const unmatched: string[] = [];

  for (const entry of collection) {
    const game = asRecord(entry);
    if (!game) continue;

    const name = text(game.name) ?? "Untitled";
    const igdbId = Number(game.igdb_id);

    if (!Number.isInteger(igdbId) || igdbId <= 0) {
      unmatched.push(name);
      continue;
    }

    const shelfNames = Object.keys(asRecord(game.shelves) ?? {});
    let status: Status = "backlog";
    const shelves: string[] = [];

    for (const shelf of shelfNames) {
      const mapped = SHELF_STATUS[shelf.trim().toLowerCase()];
      if (mapped) {
        // "Played" beats "To Play" when a game somehow sits on both.
        if (status === "backlog") status = mapped;
      } else {
        shelves.push(shelf.trim());
      }
    }

    const review = reviews.get(igdbId);
    const rawRating =
      typeof game.rating === "number" ? game.rating : (review?.rating ?? null);

    items.push({
      igdbId,
      name,
      status,
      // Grouvee rates out of five; this app stores half-stars out of ten.
      rating: rawRating ? Math.max(1, Math.min(10, Math.round(rawRating * 2))) : null,
      review: text(game.review) ?? review?.text ?? null,
      addedAt: text(game.date_added_to_collection),
      shelves,
    });
  }

  const account = asRecord(doc.account);

  return {
    account: text(account?.username),
    exportedAt: text(doc.exported_at),
    items,
    unmatched,
  };
}
