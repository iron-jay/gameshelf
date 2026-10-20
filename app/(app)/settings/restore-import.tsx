"use client";

import { useActionState, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { RESTORE_CHUNK } from "@/lib/import/constants";
import type { RestoreOutcome } from "@/lib/import/restore-run";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/status";

import { FilePicker } from "../file-picker";

import { parseRestoreUpload, restoreBatch, type RestoreParseState } from "./import-actions";

type Progress = {
  done: number;
  total: number;
  added: number;
  already: number;
  failed: RestoreOutcome[];
  finished: boolean;
  stopped: boolean;
};

/**
 * Restore from gameshelf's own export: read once, then sent back in batches
 * from the page so it can show progress, as bookshelf's restore does.
 */
export function RestoreImport() {
  const [state, action, reading] = useActionState<RestoreParseState, FormData>(parseRestoreUpload, null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const router = useRouter();

  const parsed = state?.ok ? state : null;

  async function run() {
    if (!parsed) return;
    setRunning(true);
    stop.current = false;
    const tally: Progress = { done: 0, total: parsed.rows.length, added: 0, already: 0, failed: [], finished: false, stopped: false };
    setProgress({ ...tally });

    try {
      for (let i = 0; i < parsed.rows.length; i += RESTORE_CHUNK) {
        if (stop.current) {
          tally.stopped = true;
          break;
        }
        const batch = parsed.rows.slice(i, i + RESTORE_CHUNK);
        let outcomes: RestoreOutcome[];
        try {
          outcomes = await restoreBatch(batch);
        } catch {
          // The request itself failed (server restarted, connection dropped):
          // those rows are failures to retry, not a reason to abandon the rest.
          outcomes = batch.map((row) => ({
            line: row.line,
            title: row.work.title,
            result: "failed" as const,
            message: "The request did not come back.",
          }));
        }
        for (const outcome of outcomes) {
          if (outcome.result === "added") tally.added++;
          else if (outcome.result === "already") tally.already++;
          else tally.failed.push(outcome);
        }
        tally.done += batch.length;
        setProgress({ ...tally });
      }
    } finally {
      tally.finished = true;
      setProgress({ ...tally });
      setRunning(false);
      router.refresh();
    }
  }

  const statusCounts = parsed
    ? STATUS_ORDER.map((status) => [status, parsed.rows.filter((row) => row.status === status).length] as const).filter(
        ([, n]) => n > 0,
      )
    : [];

  return (
    <div className="mt-3 flex max-w-2xl flex-col gap-4">
      <form
        action={action}
        // Checked here as well as on the server: a file past the server's body
        // limit never reaches the server's own check, it just fails.
        onSubmit={(event) => {
          const input = event.currentTarget.elements.namedItem("file");
          const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
          const big = Boolean(file && file.size > 20 * 1024 * 1024);
          setTooLarge(big);
          if (big) event.preventDefault();
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <FilePicker name="file" accept="application/json,.json" label="Choose gameshelf export" />
        <button type="submit" disabled={reading || running} className="btn">
          {reading ? "Reading…" : "Read the file"}
        </button>
      </form>

      {tooLarge ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          That file is larger than 20 MB.
        </p>
      ) : state && !state.ok ? (
        <p role="alert" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.message}
        </p>
      ) : null}

      {parsed ? (
        <div className="card font-narrow">
          <p>
            {parsed.rows.length} {parsed.rows.length === 1 ? "game" : "games"}:{" "}
            {statusCounts.map(([status, n]) => `${n} ${STATUS_LABELS[status].toLowerCase()}`).join(", ")}.
          </p>
          {parsed.skipped.length > 0 ? (
            <p className="mt-1 text-ink-dim">
              {parsed.skipped.length} {parsed.skipped.length === 1 ? "entry is" : "entries are"} skipped (
              {parsed.skipped.slice(0, 5).map((s) => `entry ${s.line}: ${s.reason}`).join("; ")}).
            </p>
          ) : null}
          <p className="mt-2 text-ink-dim">
            Keep this tab open while it runs. If it stops, choose the same file and run it again:
            what is already here is skipped, and nothing on your shelf is overwritten.
          </p>
          <div className="mt-3 flex gap-3">
            <button type="button" onClick={() => void run()} disabled={running || Boolean(progress?.finished)} className="btn">
              {running ? "Restoring…" : progress?.finished ? "Done" : "Restore"}
            </button>
            {running ? (
              <button type="button" onClick={() => (stop.current = true)} className="text-ink-dim underline hover:text-ink">
                Stop after this batch
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {progress ? (
        <div className="card font-narrow tabular-nums">
          <p>
            {progress.done} of {progress.total} · {progress.added} added · {progress.already} already here
            {progress.failed.length > 0 ? ` · ${progress.failed.length} failed` : ""}
          </p>
          <span
            className="mt-2 block h-px bg-ink-dim"
            style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
          />
          {progress.finished ? (
            <p className="mt-3 text-ink-dim">
              {progress.stopped ? "Stopped. Run the same file again to carry on. " : "Finished. "}
              {progress.failed.length > 0 ? "Failed entries were not added; running the file again retries them." : ""}
            </p>
          ) : null}
          {progress.failed.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-0.5 text-ink-dim">
              {progress.failed.slice(0, 20).map((f) => (
                <li key={`${f.line}-${f.title}`}>
                  {f.title}: {f.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
