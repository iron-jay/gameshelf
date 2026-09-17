"use client";

import { useActionState } from "react";

import { addToShelf, type AddState } from "./actions";

/**
 * Add, plus which release you played when IGDB lists more than one.
 *
 * The platform decides what the original version is called and what the shelf
 * groups and filters it under, and the server's guess is only ever the earliest
 * release — right for Ocarina of Time on N64, wrong for anyone who played it on
 * the Wii. Choosing here costs a click and saves an edit.
 *
 * A single-platform game gets no picker; there is nothing to choose.
 */
export function AddButton({
  igdbId,
  platforms,
  defaultPlatformId,
  statuses,
  defaultStatus,
}: {
  igdbId: number;
  platforms: { id: number; name: string }[];
  defaultPlatformId: number | null;
  statuses: readonly string[];
  /** wishlist for something not out yet, backlog for something that is. */
  defaultStatus: string;
}) {
  const [state, action, pending] = useActionState<AddState, FormData>(addToShelf, null);

  return (
    <form action={action} className="ml-auto flex shrink-0 items-center gap-2">
      <input type="hidden" name="igdbId" value={igdbId} />

      {state?.ok ? (
        <span className="font-narrow text-ink-dim">{state.message}</span>
      ) : (
        <>
          {platforms.length > 1 ? (
            <label className="flex items-center gap-2">
              <span className="sr-only">Platform you played on</span>
              <select
                name="platformId"
                defaultValue={defaultPlatformId ?? platforms[0].id}
                className="max-w-52 border border-line bg-panel px-2 py-1.5 font-narrow text-ink"
              >
                {platforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {/* Defaulted from the release date rather than asked for. It is right
              most of the time, and wrong is one click to fix either here or on
              the shelf afterwards. */}
          <label className="flex items-center gap-2">
            <span className="sr-only">Shelf</span>
            <select
              name="status"
              defaultValue={defaultStatus}
              className="border border-line bg-panel px-2 py-1.5 font-narrow text-ink"
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={pending}
            className="border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim disabled:text-ink-dim"
          >
            {pending ? "Adding…" : "Add"}
          </button>
        </>
      )}

      {state && !state.ok ? (
        <span role="alert" className="font-narrow text-ink-dim">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
