"use client";

import { useActionState, useState } from "react";

import Link from "next/link";

import type { ArtCandidate } from "@/lib/sgdb";
import {
  COMMUNITY_KINDS,
  type ArtLookupState,
  type BaseGameOption,
  type CreateVersionState,
  type FormKind,
} from "@/lib/versions/types";

import { FIELD, VersionFields } from "./version-fields";

import { createVersion, lookupArtForName, searchBaseGames } from "./version-actions";

export type KnownWork = {
  id: string;
  title: string;
  versions: { id: string; name: string; kind: string }[];
};

const CONFIDENCE_NOTE: Readonly<Record<string, string>> = {
  exact: "Matched exactly. This will be applied as-is.",
  fuzzy: "Close but not exact — this will be applied and flagged for review.",
  none: "No confident match. Nothing will be applied unless you pick one.",
};

/**
 * The whole add-version form, used by both doors. Door A passes no work and
 * gets an inline base-game search; Door B passes the work it already knows and
 * the search is replaced by a fixed line. There is deliberately no second
 * component — the doors differ only in which props are filled in.
 */
export function VersionForm({
  kind,
  work,
  platforms,
}: {
  kind: FormKind;
  work?: KnownWork;
  /** Names already in the platforms table, so the field can suggest them. */
  platforms: string[];
}) {
  const [state, action, pending] = useActionState<CreateVersionState, FormData>(
    createVersion,
    null,
  );

  const [art, setArt] = useState<ArtLookupState | null>(null);
  const [artPending, setArtPending] = useState(false);
  const [chosen, setChosen] = useState<ArtCandidate | null>(null);

  const [baseGame, setBaseGame] = useState<BaseGameOption | null>(null);
  const [baseResults, setBaseResults] = useState<BaseGameOption[]>([]);
  const [baseSearching, setBaseSearching] = useState(false);

  const homebrew = kind === "homebrew";

  async function onNameBlur(value: string) {
    if (!value.trim()) return;
    setArtPending(true);
    try {
      const result = await lookupArtForName(value);
      setArt(result);
      // Section 4a: an exact or fuzzy match is pre-selected, no match is not.
      setChosen(result.confidence === "none" ? null : (result.candidates[0] ?? null));
    } finally {
      setArtPending(false);
    }
  }

  async function onBaseSearch(term: string) {
    if (!term.trim()) return;
    setBaseSearching(true);
    try {
      setBaseResults(await searchBaseGames(term));
    } finally {
      setBaseSearching(false);
    }
  }

  if (state?.ok) {
    return (
      <div className="border border-line bg-panel p-6">
        <p className="font-medium">{state.message}</p>
        <p className="mt-3 font-narrow">
          <Link href={`/work/${state.workSlug}`} className="underline">
            Open the work page
          </Link>
          {" · "}
          <Link href="/" className="underline">
            Back to the shelf
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      {work ? <input type="hidden" name="workId" value={work.id} /> : null}
      {baseGame ? <input type="hidden" name="baseGameIgdbId" value={baseGame.igdbId} /> : null}
      {chosen ? (
        <>
          <input type="hidden" name="artUrl" value={chosen.imageUrl} />
          <input type="hidden" name="artSgdbGameId" value={chosen.sgdbGameId} />
          <input type="hidden" name="artConfidence" value={art?.confidence ?? "none"} />
        </>
      ) : null}

      <VersionFields
        kinds={homebrew ? (["homebrew"] as const) : COMMUNITY_KINDS}
        platforms={platforms}
        values={{ kind }}
        nameLabel={homebrew ? "Game name" : "Name of the hack or port"}
        nameHint="This is what the art search uses, so use the release&rsquo;s own name."
        onNameBlur={(value) => void onNameBlur(value)}
        autoFocus
      />

      {homebrew ? (
        <p className="border-l-2 border-ink-dim pl-3 font-narrow text-ink-dim">
          Homebrew modifies nothing, so it becomes a work of its own rather than a version of
          something else. There is no base game to choose.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-2 border border-line p-4">
          <legend className="px-1 font-narrow text-ink-dim">Base game</legend>

          {work ? (
            <p>{work.title}</p>
          ) : baseGame ? (
            <p className="flex items-center gap-3">
              {baseGame.title}
              {baseGame.year ? <span className="text-ink-dim">{baseGame.year}</span> : null}
              <button
                type="button"
                onClick={() => setBaseGame(null)}
                className="font-narrow text-ink-dim underline hover:text-ink"
              >
                change
              </button>
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search IGDB for the original game"
                  className={FIELD}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      // This field is inside the form; Enter must not submit it.
                      event.preventDefault();
                      void onBaseSearch(event.currentTarget.value);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={(event) => {
                    const input = event.currentTarget.previousElementSibling;
                    if (input instanceof HTMLInputElement) void onBaseSearch(input.value);
                  }}
                  className="shrink-0 border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim"
                >
                  {baseSearching ? "Searching…" : "Search"}
                </button>
              </div>

              <ul className="flex flex-col">
                {baseResults.map((option) => (
                  <li key={option.igdbId}>
                    <button
                      type="button"
                      onClick={() => setBaseGame(option)}
                      className="w-full border-b border-line py-2 text-left hover:text-ink"
                    >
                      {option.title}
                      {option.year ? (
                        <span className="ml-2 text-ink-dim">{option.year}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>

              <p className="font-narrow text-ink-dim">
                Not based on anything?{" "}
                <Link href="/add?kind=homebrew" className="underline">
                  Add it as homebrew instead
                </Link>
                .
              </p>
            </>
          )}

          {work && work.versions.length > 0 ? (
            <label className="mt-2 flex flex-col gap-1.5">
              <span className="font-narrow text-ink-dim">
                Which release does it patch? (optional)
              </span>
              <select name="baseVersionId" defaultValue="" className={FIELD}>
                <option value="">Not sure</option>
                {work.versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </fieldset>
      )}

      <section className="border border-line p-4">
        <h2 className="font-narrow text-ink-dim">Cover art</h2>

        {artPending ? (
          <p className="mt-2 font-narrow text-ink-dim">Looking on SteamGridDB…</p>
        ) : art?.error ? (
          <p className="mt-2 font-narrow text-ink-dim">{art.error}</p>
        ) : art ? (
          <>
            <p className="mt-2 font-narrow text-ink-dim">
              {art.matchedName ? `Closest match: ${art.matchedName}. ` : ""}
              {CONFIDENCE_NOTE[art.confidence]}
            </p>

            <ul className="mt-3 flex flex-wrap gap-2">
              {art.candidates.slice(0, 12).map((candidate) => {
                const selected = chosen?.imageUrl === candidate.imageUrl;
                return (
                  <li key={candidate.imageUrl}>
                    <button
                      type="button"
                      onClick={() => setChosen(selected ? null : candidate)}
                      aria-pressed={selected}
                      className={`block h-32 w-24 overflow-hidden border ${
                        selected ? "border-ink" : "border-line"
                      }`}
                    >
                      {/* Remote SteamGridDB thumbnails, not yet ours — a plain
                          img avoids configuring a remote pattern for art that
                          is discarded the moment the form is abandoned. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={candidate.thumbUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="mt-2 font-narrow text-ink-dim">
            Fill in the name above and art candidates will appear here.
          </p>
        )}
      </section>

      {state && !state.ok ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start border border-line bg-panel px-4 py-2 font-medium hover:border-ink-dim disabled:text-ink-dim"
      >
        {pending ? "Saving…" : "Add to shelf"}
      </button>
    </form>
  );
}
