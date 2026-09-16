"use client";

import { useActionState, useState } from "react";

import type { GrouveeParse } from "@/lib/import/grouvee";

import { IMPORT_CHUNK } from "@/lib/import/constants";

import { FilePicker } from "../file-picker";

import { importGrouveeItems, parseGrouveeUpload, type ParseState } from "./import-actions";

type Progress = {
  done: number;
  total: number;
  added: number;
  alreadyThere: number;
  missing: string[];
  finished: boolean;
};

function summarise(parse: GrouveeParse): string {
  const statuses = new Map<string, number>();
  for (const item of parse.items) {
    statuses.set(item.status, (statuses.get(item.status) ?? 0) + 1);
  }
  return [...statuses.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${count} ${status}`)
    .join(", ");
}

export function GrouveeImport() {
  const [state, action, parsing] = useActionState<ParseState, FormData>(
    parseGrouveeUpload,
    null,
  );
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);

  const parse = state?.ok ? state.parse : null;

  async function run() {
    if (!parse) return;

    setRunning(true);
    const tally: Progress = {
      done: 0,
      total: parse.items.length,
      added: 0,
      alreadyThere: 0,
      missing: [],
      finished: false,
    };
    setProgress({ ...tally });

    try {
      for (let i = 0; i < parse.items.length; i += IMPORT_CHUNK) {
        const batch = parse.items.slice(i, i + IMPORT_CHUNK);
        const result = await importGrouveeItems(batch);

        tally.done += batch.length;
        tally.added += result.added;
        tally.alreadyThere += result.alreadyThere;
        tally.missing.push(...result.missing);
        setProgress({ ...tally });
      }
    } finally {
      tally.finished = true;
      setProgress({ ...tally });
      setRunning(false);
    }
  }

  return (
    <div className="mt-3 flex max-w-2xl flex-col gap-4">
      <form action={action} className="flex flex-wrap items-center gap-3">
        <FilePicker
          name="file"
          accept="application/json,.json"
          label="Choose export"
        />
        {/* Not disabled until a file is picked: that would make the button
            depend on a change event firing, and the server already answers
            "choose a file" perfectly well on its own. */}
        <button
          type="submit"
          disabled={parsing}
          className="border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim disabled:text-ink-dim"
        >
          {parsing ? "Reading…" : "Read the file"}
        </button>
      </form>

      {state && !state.ok ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.message}
        </p>
      ) : null}

      {parse ? (
        <div className="border border-line p-4">
          <p className="font-narrow">
            {parse.items.length} games
            {parse.account ? ` from ${parse.account}` : ""}
            {parse.exportedAt ? `, exported ${parse.exportedAt.slice(0, 10)}` : ""}.
          </p>
          <p className="mt-1 font-narrow text-ink-dim">{summarise(parse)}.</p>

          {parse.unmatched.length > 0 ? (
            <p className="mt-2 font-narrow text-ink-dim">
              {parse.unmatched.length} have no IGDB id and cannot be matched:{" "}
              {parse.unmatched.slice(0, 5).join(", ")}
              {parse.unmatched.length > 5 ? "…" : ""}
            </p>
          ) : null}

          <p className="mt-3 font-narrow text-ink-dim">
            Nothing already on your shelf is touched, and running this twice changes nothing the
            second time.
          </p>

          <button
            type="button"
            onClick={() => void run()}
            disabled={running || progress?.finished}
            className="mt-3 border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim disabled:text-ink-dim"
          >
            {running ? "Importing…" : progress?.finished ? "Done" : "Import"}
          </button>
        </div>
      ) : null}

      {progress ? (
        <div className="border border-line p-4 tabular-nums">
          <p className="font-narrow">
            {progress.done} of {progress.total} · {progress.added} added ·{" "}
            {progress.alreadyThere} already here
          </p>
          <span
            className="mt-2 block h-px bg-ink-dim"
            style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
          />
          {progress.finished ? (
            <p className="mt-3 font-narrow text-ink-dim">
              Finished.{" "}
              {progress.missing.length > 0
                ? `${progress.missing.length} could not be found on IGDB: ${progress.missing.slice(0, 5).join(", ")}${progress.missing.length > 5 ? "…" : ""}`
                : "Everything matched."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
