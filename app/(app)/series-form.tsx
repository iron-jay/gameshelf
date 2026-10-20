"use client";

import { useActionState, useState } from "react";

import { SeriesInput } from "./series-input";
import { setSeries, type SeriesSaved } from "./work/[slug]/series-actions";

function same(a: string | null, b: string | null): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/**
 * A game's series, set inline. On the game page and on each version's page,
 * since tapping a cover lands on the version and the game page is a link
 * away at the bottom of it, which is too far to go looking for one field.
 *
 * The button says "Saved" once the box holds what was stored, and goes back
 * to "Save" as soon as it does not (Jay, 2026-10-20): the page reloads its
 * data in place, so without it nothing on screen shows the save happened.
 */
export function SeriesForm({
  workSlug,
  current,
  names,
}: {
  workSlug: string;
  current: string | null;
  names: string[];
}) {
  const [state, action, pending] = useActionState<SeriesSaved, FormData>(setSeries, null);
  const [value, setValue] = useState(current ?? "");
  const stored = state ? state.saved : current;
  const saved = state !== null && same(value, state.saved);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="slug" value={workSlug} />
      <SeriesInput names={names} defaultValue={current ?? ""} onValueChange={setValue} />
      {/* Level with the box, not with the hint line under it. */}
      <button
        type="submit"
        disabled={pending || saved}
        aria-pressed={saved}
        className="btn mb-7"
      >
        {pending ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
      {stored && !saved && !pending ? (
        <span className="mb-9 font-narrow text-ink-dim">Empty the box and save to remove it.</span>
      ) : null}
    </form>
  );
}
