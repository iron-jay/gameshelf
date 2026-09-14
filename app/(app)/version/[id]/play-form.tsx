"use client";

import { useActionState } from "react";

import { addPlay, type PlayState } from "./actions";

const FIELD =
  "w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

/**
 * The one client component on this page. Everything else is a plain form, but a
 * play can be rejected — a finish date before a start date — and that needs
 * saying without losing what was typed.
 */
export function PlayForm({ versionId }: { versionId: string }) {
  const [state, action, pending] = useActionState<PlayState, FormData>(addPlay, null);

  return (
    <form action={action} className="mt-4 flex flex-col gap-3 border border-line p-4">
      <input type="hidden" name="versionId" value={versionId} />

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-narrow text-ink-dim">Started</span>
          <input name="startedOn" type="date" className={FIELD} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-narrow text-ink-dim">Finished</span>
          <input name="finishedOn" type="date" className={FIELD} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-narrow text-ink-dim">Hours</span>
          <input
            name="hours"
            type="text"
            inputMode="decimal"
            placeholder="41.5"
            className={`${FIELD} font-mono`}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-narrow text-ink-dim">How far</span>
          <select name="completion" defaultValue="" className={FIELD}>
            <option value="">Not said</option>
            <option value="unfinished">Unfinished</option>
            <option value="credits">Credits</option>
            <option value="completed">Completed</option>
            <option value="mastered">Mastered</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Note</span>
        <input name="note" type="text" className={FIELD} />
      </label>

      {state ? (
        <p role="status" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim disabled:text-ink-dim"
      >
        {pending ? "Adding…" : "Add play"}
      </button>
    </form>
  );
}
