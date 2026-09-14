"use client";

import { useActionState } from "react";

import { addToShelf, type AddState } from "./actions";

export function AddButton({ igdbId }: { igdbId: number }) {
  const [state, action, pending] = useActionState<AddState, FormData>(addToShelf, null);

  return (
    <form action={action} className="ml-auto shrink-0">
      <input type="hidden" name="igdbId" value={igdbId} />

      {state?.ok ? (
        <span className="font-narrow text-ink-dim">{state.message}</span>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim disabled:text-ink-dim"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      )}

      {state && !state.ok ? (
        <span role="alert" className="ml-3 font-narrow text-ink-dim">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
