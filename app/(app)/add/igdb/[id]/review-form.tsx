"use client";

import { useActionState, useState } from "react";

import Link from "next/link";

import type { GameDraft } from "@/lib/entries/draft";
import type { ArtCandidate } from "@/lib/sgdb";
import type { Status } from "@/lib/status";
import type { ArtLookupState } from "@/lib/versions/types";

import { SeriesInput } from "../../../series-input";
import { ShelfChoice } from "../../../shelf-choice";
import { lookupArtForName } from "../../../version-actions";
import { addReviewed, type ReviewState } from "./actions";

/**
 * The game as it will be saved: its details (for a game not here yet), its
 * art, which release you played and which shelf. One Add saves it all.
 *
 * The art is IGDB's cover unless another is picked. SteamGridDB is asked
 * only on request, with the title as typed, and what it offers is shown
 * from its own servers until Add downloads the one chosen.
 */
export function ReviewForm({
  igdbId,
  draft,
  seriesNames,
  cover,
  platforms,
  defaultPlatformId,
  defaultStatus,
  cancelHref,
}: {
  igdbId: number;
  /** Null for a game already here: only the release and the shelf are asked. */
  draft: GameDraft | null;
  seriesNames: string[];
  cover: string | null;
  platforms: { id: number; name: string }[];
  defaultPlatformId: number | null;
  defaultStatus: Status;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(addReviewed, null);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [art, setArt] = useState<ArtLookupState | null>(null);
  const [looking, setLooking] = useState(false);
  const [chosen, setChosen] = useState<ArtCandidate | null>(null);

  async function lookForArt() {
    setLooking(true);
    try {
      setArt(await lookupArtForName(title));
    } finally {
      setLooking(false);
    }
  }

  const shown = chosen?.thumbUrl ?? cover;

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      <input type="hidden" name="igdbId" value={igdbId} />
      {chosen ? (
        <>
          <input type="hidden" name="artUrl" value={chosen.imageUrl} />
          <input type="hidden" name="artSgdbGameId" value={chosen.sgdbGameId} />
        </>
      ) : null}

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex shrink-0 flex-col gap-2">
          <div className="relative aspect-[3/4] w-32 bg-panel sm:w-40">
            {shown ? (
              // IGDB's or SteamGridDB's own copy, not ours until Add saves it.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown} alt="" className="h-full w-full object-cover" />
            ) : (
              <p className="p-3 font-display text-lg">{title}</p>
            )}
          </div>
          <p className="max-w-40 font-narrow text-sm text-ink-dim">
            {chosen ? "From SteamGridDB" : cover ? (draft ? "IGDB's cover" : "Its cover here") : draft ? "IGDB has no cover; SteamGridDB is asked on add" : "No cover yet"}
          </p>
        </div>

        {draft ? (
          <fieldset className="flex min-w-0 flex-1 flex-col gap-4">
            <legend className="sr-only">Details</legend>
            <label className="flex flex-col gap-1.5">
              <span className="font-narrow text-ink-dim">Title</span>
              <input
                name="title"
                type="text"
                required
                maxLength={500}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="field"
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:max-w-xs">
              <span className="font-narrow text-ink-dim">Release date</span>
              <input name="releaseDate" type="date" defaultValue={draft.releaseDate ?? ""} className="field" />
            </label>
            <SeriesInput names={seriesNames} defaultValue={draft.series ?? ""} className="sm:w-80" />
          </fieldset>
        ) : null}
      </div>

      {draft ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="font-narrow text-ink-dim">Summary</span>
            <textarea name="summary" rows={6} defaultValue={draft.summary ?? ""} className="field leading-relaxed" />
          </label>

          <section className="card">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-narrow text-ink-dim">Other art</h2>
              <button type="button" onClick={() => void lookForArt()} disabled={looking || !title.trim()} className="btn">
                {looking ? "Looking…" : art ? "Look again" : "Look on SteamGridDB"}
              </button>
              {chosen ? (
                <button type="button" onClick={() => setChosen(null)} className="font-narrow text-ink-dim underline hover:text-ink">
                  {cover ? "Back to IGDB's cover" : "Use none of these"}
                </button>
              ) : null}
            </div>
            {art?.error ? <p className="mt-2 font-narrow text-ink-dim">{art.error}</p> : null}
            {art && !art.error && art.candidates.length === 0 ? (
              <p className="mt-2 font-narrow text-ink-dim">SteamGridDB has nothing under that title.</p>
            ) : null}
            {art && art.candidates.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {art.candidates.slice(0, 12).map((candidate) => {
                  const selected = chosen?.imageUrl === candidate.imageUrl;
                  return (
                    <li key={candidate.imageUrl}>
                      <button
                        type="button"
                        onClick={() => setChosen(selected ? null : candidate)}
                        aria-pressed={selected}
                        className={`block h-32 w-24 overflow-hidden border ${selected ? "border-ink" : "border-line"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={candidate.thumbUrl} alt="" className="h-full w-full object-cover" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <label className="mt-3 flex items-center gap-2 font-narrow text-ink-dim">
              <input type="checkbox" name="then" value="art" />
              Upload or choose art after adding
            </label>
          </section>
        </>
      ) : null}

      {platforms.length > 1 ? (
        <label className="flex flex-col gap-1.5 sm:max-w-xs">
          <span className="font-narrow text-ink-dim">Platform you played on</span>
          <select name="platformId" defaultValue={defaultPlatformId ?? platforms[0].id} className="field">
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <ShelfChoice defaultValue={defaultStatus} />

      {state ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Adding…" : "Add to shelf"}
        </button>
        <Link href={cancelHref} className="font-narrow text-ink-dim underline hover:text-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
