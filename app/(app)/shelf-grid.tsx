"use client";

import { useActionState, useState } from "react";

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

  const [platformState, platformAction, platformPending] = useActionState<BulkState, FormData>(
    changeSelectedPlatform,
    null,
  );
  const [statusState, statusAction, statusPending] = useActionState<BulkState, FormData>(
    changeSelectedStatus,
    null,
  );

  const everything = sections.flatMap((section) => section.cards.map((card) => card.entryId));
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

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4 font-narrow">
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

        {sections.map((section) => (
          <section key={section.label || "all"} className="mb-8">
            {grouped ? (
              <h2 className="mb-2 flex items-baseline gap-3 font-medium">
                {section.label}
                <span className="font-narrow text-ink-dim">{section.cards.length}</span>
              </h2>
            ) : null}
            <ul className="grid gap-px [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
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
    </>
  );
}
