"use client";

import { useActionState, useEffect, useState } from "react";

import {
  changeSelectedPlatform,
  changeSelectedStatus,
  type BulkState,
} from "./bulk-actions";
import { ShelfTile, type ShelfCard } from "./shelf-tile";
import { PlatformField } from "./version-fields";

export type ShelfSection = { label: string; cards: ShelfCard[] };

const BUTTON =
  "border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim disabled:text-ink-dim";

/**
 * Whether the shelf has already resolved in this tab. The grid's fade-in is
 * the app's one orchestrated moment (§5b): it plays on arrival, not on every
 * return from a book, where the covers are already cached and a replayed
 * stagger — 18 ms a tile, seconds on a long shelf — reads as them reloading.
 * Module state outlives client navigations and resets on a full page load;
 * it is only set after mount, so the server and hydration always agree.
 */
let resolvedOnce = false;

/**
 * The shelf grid, plus the select mode that lets a filtered view be changed in
 * one go — the repair for a hundred games imported onto the wrong platform.
 *
 * Selecting is a mode rather than a checkbox permanently on every cover: §5b is
 * explicit that the art is the content and the interface is the frame, and a
 * checkbox on every tile is the frame taking over. It is off until asked for.
 *
 * The checkboxes are real form fields inside the form, so what gets submitted is
 * what is ticked; the React state beside them is only there to count and to
 * outline what is selected.
 */
export function ShelfGrid({
  sections,
  grouped,
  platforms,
  statuses,
}: {
  sections: ShelfSection[];
  /** Section headings are only meaningful when the shelf is grouped. */
  grouped: boolean;
  platforms: string[];
  statuses: readonly string[];
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const [platformState, platformAction, platformPending] = useActionState<BulkState, FormData>(
    changeSelectedPlatform,
    null,
  );
  const [statusState, statusAction, statusPending] = useActionState<BulkState, FormData>(
    changeSelectedStatus,
    null,
  );

  // Filtered here rather than through the URL: every card is already on the
  // client, so a keystroke is a re-render and not a round trip. Matching the
  // two lines the tile actually shows means a romhack is found by its own name
  // as well as by the game it patches.
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? sections
        .map((section) => ({
          ...section,
          cards: section.cards.filter(
            (card) =>
              card.workTitle.toLowerCase().includes(needle) ||
              card.versionName.toLowerCase().includes(needle),
          ),
        }))
        .filter((section) => section.cards.length > 0)
    : sections;

  const total = sections.reduce((sum, section) => sum + section.cards.length, 0);
  const everything = shown.flatMap((section) => section.cards.map((card) => card.entryId));
  const state = platformState ?? statusState;
  const pending = platformPending || statusPending;

  function toggle(entryId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(entryId)) next.add(entryId);
      return next;
    });
  }

  // The load animation staggers across the whole grid rather than per section,
  // so it still reads as one shelf resolving.
  let tileIndex = 0;

  const [resolving] = useState(() => !resolvedOnce);
  useEffect(() => {
    resolvedOnce = true;
  }, []);

  return (
    <div className={resolving ? "shelf-resolving" : undefined}>
      <div className="mb-4 flex flex-wrap items-center gap-4 font-narrow">
        {/* Filters what is on screen as you type. The nav's Search is the other
            thing — that one goes out to IGDB to find what you do not have yet. */}
        <label className="flex-1 basis-64">
          <span className="sr-only">Filter this shelf</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title"
            className="w-full max-w-md border border-line bg-panel px-3 py-2 text-ink outline-none focus:border-ink-dim"
          />
        </label>

        {/* Silent at zero, where the sentence below the controls says it
            better than a counter can. */}
        {needle && everything.length > 0 ? (
          <span className="text-ink-dim">
            {everything.length} of {total} {everything.length === 1 ? "matches" : "match"}
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setSelecting((on) => !on);
            setSelected(new Set());
          }}
          className={BUTTON}
        >
          {selecting ? "Done selecting" : "Select"}
        </button>

        {selecting ? (
          <>
            <span className="text-ink-dim">
              {selected.size} of {everything.length} selected
            </span>
            <button
              type="button"
              onClick={() =>
                setSelected(selected.size === everything.length ? new Set() : new Set(everything))
              }
              className="text-ink-dim underline hover:text-ink"
            >
              {selected.size === everything.length ? "Clear" : "Select all"}
            </button>
          </>
        ) : null}

        {state ? (
          <span role="status" className="text-ink-dim">
            {state.message}
          </span>
        ) : null}
      </div>

      <form>
        {/* The selection, as fields. Hidden inputs survive the reset React does
            when a form action resolves, because a reset restores exactly the
            value rendered here. */}
        {selecting
          ? [...selected].map((entryId) => (
              <input key={entryId} type="hidden" name="entryId" value={entryId} />
            ))
          : null}

        {selecting ? (
          <div className="mb-6 flex flex-wrap items-end gap-3 border border-line p-3">
            <PlatformField value="" platforms={platforms} />
            <button
              type="submit"
              formAction={platformAction}
              disabled={pending || selected.size === 0}
              className={BUTTON}
            >
              {platformPending ? "Moving…" : "Change platform"}
            </button>

            <label className="flex flex-col gap-1.5">
              <span className="font-narrow text-ink-dim">Shelf</span>
              <select
                name="status"
                defaultValue={statuses[0]}
                className="w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim"
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
              formAction={statusAction}
              disabled={pending || selected.size === 0}
              className={BUTTON}
            >
              {statusPending ? "Moving…" : "Change shelf"}
            </button>
          </div>
        ) : null}

        {needle && shown.length === 0 ? (
          <p className="font-narrow text-ink-dim">Nothing on your shelf matches “{query.trim()}”.</p>
        ) : null}

        {shown.map((section) => (
          <section key={section.label || "all"} className="mb-8">
            {grouped ? (
              <h2 className="mb-2 flex items-baseline gap-3 font-medium">
                {section.label}
                <span className="font-narrow text-ink-dim">{section.cards.length}</span>
              </h2>
            ) : null}
            <ul className="grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
              {section.cards.map((card) => (
                <ShelfTile
                  key={card.entryId}
                  card={card}
                  index={tileIndex++}
                  selecting={selecting}
                  checked={selected.has(card.entryId)}
                  onToggle={toggle}
                />
              ))}
            </ul>
          </section>
        ))}
      </form>
    </div>
  );
}
