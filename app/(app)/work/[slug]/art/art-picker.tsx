"use client";

import { useActionState, useState } from "react";

import type { ArtCandidate } from "@/lib/sgdb";
import type { ArtActionState } from "@/lib/versions/types";

import { FilePicker } from "../../../file-picker";

import { applyArt, applyArtFromReference, searchArt, uploadArt } from "./actions";

const FIELD =
  "w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";
const BUTTON = "border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim";

function Result({ state }: { state: ArtActionState }) {
  if (!state) return null;
  return (
    <p role="status" className="mt-2 border-l-2 border-ink-dim pl-3 font-narrow">
      {state.message}
    </p>
  );
}

export function ArtPicker({
  slug,
  versionId,
  seedTitle,
  initialCandidates,
  currentCoverUrl,
  notice,
}: {
  slug: string;
  versionId: string | null;
  seedTitle: string;
  initialCandidates: ArtCandidate[];
  currentCoverUrl: string | null;
  notice: string | null;
}) {
  const [term, setTerm] = useState(seedTitle);
  const [includeAdult, setIncludeAdult] = useState(false);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<ArtCandidate | null>(null);

  const [applyState, applyAction, applying] = useActionState<ArtActionState, FormData>(
    applyArt,
    null,
  );
  const [refState, refAction, refPending] = useActionState<ArtActionState, FormData>(
    applyArtFromReference,
    null,
  );
  const [uploadState, uploadAction, uploading] = useActionState<ArtActionState, FormData>(
    uploadArt,
    null,
  );

  async function runSearch(adult = includeAdult) {
    setSearching(true);
    try {
      setCandidates(await searchArt(term, adult));
      setChosen(null);
    } finally {
      setSearching(false);
    }
  }

  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      {versionId ? <input type="hidden" name="versionId" value={versionId} /> : null}
    </>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section className="flex items-start gap-4">
        <div className="h-40 w-30 shrink-0 border border-line bg-panel">
          {currentCoverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentCoverUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <p className="font-narrow text-ink-dim">
          {currentCoverUrl ? "Current cover." : "No cover yet."} Choosing one here counts as the
          review, so the needs-review flag is cleared either way.
        </p>
      </section>

      {notice ? (
        <p role="status" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {notice}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 font-medium">Search SteamGridDB</h2>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runSearch();
              }
            }}
            className={`${FIELD} max-w-sm`}
          />
          <button type="button" onClick={() => void runSearch()} className={BUTTON}>
            {searching ? "Searching…" : "Search"}
          </button>

          {/* Filtered out of automatic selection, available here. Section 4a. */}
          <label className="flex items-center gap-2 font-narrow text-ink-dim">
            <input
              type="checkbox"
              checked={includeAdult}
              onChange={(event) => {
                setIncludeAdult(event.target.checked);
                void runSearch(event.target.checked);
              }}
            />
            Include nsfw and joke art
          </label>
        </div>

        {candidates.length === 0 ? (
          <p className="mt-3 font-narrow text-ink-dim">No grids found for that title.</p>
        ) : (
          <form action={applyAction}>
            {hidden}
            {chosen ? (
              <>
                <input type="hidden" name="imageUrl" value={chosen.imageUrl} />
                <input type="hidden" name="sgdbGameId" value={chosen.sgdbGameId} />
              </>
            ) : null}

            <ul className="mt-3 flex flex-wrap gap-2">
              {candidates.slice(0, 24).map((candidate) => {
                const selected = chosen?.imageUrl === candidate.imageUrl;
                return (
                  <li key={candidate.imageUrl}>
                    <button
                      type="button"
                      onClick={() => setChosen(selected ? null : candidate)}
                      aria-pressed={selected}
                      title={`${candidate.width}×${candidate.height}`}
                      className={`block h-36 w-27 overflow-hidden border ${
                        selected ? "border-ink" : "border-line"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={candidate.thumbUrl} alt="" className="h-full w-full object-cover" />
                    </button>
                  </li>
                );
              })}
            </ul>

            <button type="submit" disabled={!chosen || applying} className={`${BUTTON} mt-3`}>
              {applying ? "Applying…" : "Use this cover"}
            </button>
            <Result state={applyState} />
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">Paste a SteamGridDB link or id</h2>
        <p className="mb-2 font-narrow text-ink-dim">
          The reliable path when the search cannot find an obscure hack.
        </p>
        <form action={refAction} className="flex flex-wrap items-center gap-2">
          {hidden}
          <input
            name="reference"
            type="text"
            placeholder="https://www.steamgriddb.com/game/5335518 or 5335518"
            className={`${FIELD} max-w-md font-mono`}
          />
          <button type="submit" disabled={refPending} className={BUTTON}>
            {refPending ? "Fetching…" : "Use"}
          </button>
        </form>
        <Result state={refState} />
      </section>

      <section>
        <h2 className="mb-2 font-medium">Upload a file</h2>
        <form action={uploadAction} className="flex flex-wrap items-center gap-2">
          {hidden}
          <FilePicker
            name="file"
            accept="image/jpeg,image/png,image/webp"
            label="Choose image"
          />
          <button type="submit" disabled={uploading} className={BUTTON}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
        <Result state={uploadState} />
      </section>
    </div>
  );
}
