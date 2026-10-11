"use client";

import { useState } from "react";

import { SERIES_CHUNK } from "@/lib/series-backfill";

import { clearAllSeries, fillSeriesForChunk, worksNeedingSeries } from "./series-actions";

type Progress = {
  done: number;
  total: number;
  filled: number;
  blank: number;
  missing: number;
  finished: boolean;
};

/**
 * Fills in series from IGDB for works that have none.
 *
 * A chunk at a time from here rather than one long server action: a few hundred
 * works is a minute of IGDB round trips, and a request that long with nothing
 * on screen is indistinguishable from a hung one.
 */
export function SeriesBackfill() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setCleared(null);

    try {
      const ids = await worksNeedingSeries();
      const tally: Progress = {
        done: 0,
        total: ids.length,
        filled: 0,
        blank: 0,
        missing: 0,
        finished: ids.length === 0,
      };
      setProgress({ ...tally });

      for (let i = 0; i < ids.length; i += SERIES_CHUNK) {
        const batch = ids.slice(i, i + SERIES_CHUNK);
        const result = await fillSeriesForChunk(batch);

        tally.done += batch.length;
        tally.filled += result.filled;
        tally.blank += result.blank;
        tally.missing += result.missing;
        setProgress({ ...tally });
      }
    } catch {
      setError("IGDB did not answer. Nothing already filled in is lost — run it again.");
    } finally {
      setProgress((current) => (current ? { ...current, finished: true } : current));
      setRunning(false);
    }
  }

  async function clear() {
    setRunning(true);
    setError(null);
    try {
      const { cleared: count } = await clearAllSeries();
      setCleared(count);
      setProgress(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim disabled:text-ink-dim"
        >
          {running ? "Asking IGDB…" : "Fill in series from IGDB"}
        </button>

        {/* The way back. The backfill only writes where a series was blank, but
            it writes a lot of rows at once and nobody should have to undo that
            one work page at a time. */}
        <button
          type="button"
          onClick={() => void clear()}
          disabled={running}
          className="font-narrow text-ink-dim underline hover:text-ink disabled:no-underline"
        >
          Clear every series
        </button>
      </div>

      {error ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {error}
        </p>
      ) : null}

      {cleared !== null ? (
        <p role="status" className="font-narrow text-ink-dim">
          Cleared {cleared} {cleared === 1 ? "series" : "series"}.
        </p>
      ) : null}

      {progress ? (
        <div className="border border-line p-4 tabular-nums">
          {progress.total === 0 ? (
            <p className="font-narrow">Every game from IGDB already has a series.</p>
          ) : (
            <>
              <p className="font-narrow">
                {progress.done} of {progress.total} · {progress.filled} filled in
              </p>
              <span
                className="mt-2 block h-px bg-ink-dim"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </>
          )}

          {progress.finished && progress.total > 0 ? (
            <p className="mt-3 font-narrow text-ink-dim">
              Finished. {progress.blank > 0 ? `${progress.blank} are in no series IGDB knows of. ` : ""}
              {progress.missing > 0 ? `${progress.missing} are no longer on IGDB. ` : ""}
              Anything you had already named was left alone.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
