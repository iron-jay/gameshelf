"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import {
  changeSelectedPlatform,
  changeSelectedSeries,
  changeSelectedStatus,
  type BulkState,
} from "./bulk-actions";
import { ShelfTile, type ShelfCard } from "./shelf-tile";
import { PlatformField } from "./version-fields";

export type ShelfSection = { label: string; href?: string; cards: ShelfCard[] };

const BUTTON = "btn";

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
  seriesNames,
}: {
  sections: ShelfSection[];
  /** Section headings are only meaningful when the shelf is grouped. */
  grouped: boolean;
  platforms: string[];
  statuses: readonly string[];
  /** Suggested in the series box, so a selection joins a series rather than misspelling one. */
  seriesNames: string[];
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
  const [seriesState, seriesAction, seriesPending] = useActionState<BulkState, FormData>(
    changeSelectedSeries,
    null,
  );

  const state = platformState ?? statusState ?? seriesState;
  const pending = platformPending || statusPending || seriesPending;

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
      <div className="mb-6 flex flex-wrap items-center gap-3 font-narrow">
        {/* Filters what is on screen as you type. The nav's Search is the other
            thing — that one goes out to IGDB to find what you do not have yet. */}
        <label className="flex-1 basis-64">
          <span className="sr-only">Filter this shelf</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title"
            className="field max-w-md rounded-full px-4"
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
          <div className="card mb-6 flex flex-wrap items-end gap-3">
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
                className="field"
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

            <label className="flex flex-col gap-1.5">
              <span className="font-narrow text-ink-dim">Series</span>
              <input
                name="series"
                type="text"
                list="bulk-series-names"
                maxLength={120}
                placeholder="The Legend of Zelda"
                className="field w-56"
              />
            </label>
            <datalist id="bulk-series-names">
              {seriesNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <button
              type="submit"
              formAction={seriesAction}
              disabled={pending || selected.size === 0}
              className={BUTTON}
            >
              {seriesPending ? "Saving…" : "Put in series"}
            </button>
          </div>
        ) : null}

        {needle && shown.length === 0 ? (
          <p className="font-narrow text-ink-dim">Nothing on your shelf matches “{query.trim()}”.</p>
        ) : null}

        {shown.map((section) => (
          <section key={section.label || "all"} className="shelf-wall mb-10">
            {grouped ? (
              <h2 className="mb-1 flex items-baseline gap-3">
                {section.href ? (
                  <Link href={section.href} className="font-display text-2xl hover:underline">
                    {section.label}
                  </Link>
                ) : (
                  <span className="font-display text-2xl">{section.label}</span>
                )}
                <span className="text-ink-dim">{section.cards.length}</span>
              </h2>
            ) : null}
            <ul className="shelf-rows">
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
