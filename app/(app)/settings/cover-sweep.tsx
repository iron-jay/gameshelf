"use client";

import { useActionState } from "react";

import { sweepOrphanedCovers } from "./actions";

type SweepState = { removed: number } | null;

export function CoverSweep() {
  const [state, action, pending] = useActionState<SweepState, FormData>(
    async () => sweepOrphanedCovers(),
    null,
  );

  return (
    <form action={action}>
      <button
        type="submit"
        disabled={pending}
        className="btn"
      >
        {pending ? "Removing…" : "Remove unreferenced files"}
      </button>

      {state ? (
        <p role="status" className="mt-2 font-narrow text-ink-dim">
          Removed {state.removed} {state.removed === 1 ? "file" : "files"}.
        </p>
      ) : null}
    </form>
  );
}
