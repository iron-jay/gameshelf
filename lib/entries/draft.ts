import { releaseDateFor, seriesFor } from "@/lib/igdb/mapping";
import type { IgdbGame } from "@/lib/igdb/types";

/**
 * A game's details as the add form shows them, before anything is saved
 * (Jay, 2026-10-21: "you need to be able to edit the details before adding").
 * IGDB's answer fills them in; what comes back is what the new work is made
 * from. Only a work the add creates takes them: one already here keeps its
 * own, which its Edit details page changes.
 */
export type GameDraft = {
  title: string;
  releaseDate: string | null;
  summary: string | null;
  series: string | null;
};

/** What an untouched add would store, so the form's defaults are the server's. */
export function draftFromIgdb(game: IgdbGame): GameDraft {
  return {
    title: game.name,
    releaseDate: releaseDateFor(game),
    summary: game.summary ?? null,
    series: seriesFor(game),
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, max: number): string | null {
  const trimmed = typeof value === "string" ? value.trim().slice(0, max) : "";
  return trimmed === "" ? null : trimmed;
}

/**
 * The form's fields, or the API's `details`, read the same way. `get` is
 * FormData's or an object's lookup. A blank box clears the field: emptying
 * IGDB's summary is a choice, not a missing answer.
 */
export function readGameDraft(get: (field: string) => unknown): { ok: true; draft: GameDraft } | { ok: false; message: string } {
  const title = text(get("title"), 500);
  const releaseDate = text(get("releaseDate"), 10);
  if (!title) return { ok: false, message: "The title is required." };
  if (releaseDate && !DAY.test(releaseDate)) return { ok: false, message: "That release date is not a date." };
  return {
    ok: true,
    draft: {
      title,
      releaseDate,
      summary: text(get("summary"), 50_000),
      series: text(get("series"), 120),
    },
  };
}
