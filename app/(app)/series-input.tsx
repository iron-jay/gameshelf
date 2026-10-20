"use client";

import { useEffect, useId, useState } from "react";

/** Shown in turn while the box is empty, when the shelf has too few series of its own to show. */
const EXAMPLES = ["The Legend of Zelda", "Final Fantasy", "Halo", "Metroid", "Persona", "Dark Souls"];

/** Long enough to read a name, short enough that the box visibly changes while you look at it. */
const EXAMPLE_MS = 2200;

/** Enough to choose from without the list pushing the Save button off a phone screen. */
const MAX_SUGGESTIONS = 6;

/**
 * The series box: the series already in use appear under it as you type,
 * and anything else you type is a new one.
 *
 * A list of our own rather than a <datalist>: on a phone the browser shows a
 * datalist as a thin strip above the keyboard, if at all, which is how it went
 * unnoticed. Matching is the same case-insensitive rule the server saves with
 * (`canonicalSeries`), so picking "zelda" from here and typing it are the same.
 */
export function SeriesInput({
  names,
  defaultValue = "",
  className = "w-64",
}: {
  names: readonly string[];
  defaultValue?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();

  // The example cycles (Jay, 2026-10-20), through your own series where there
  // are enough of them, so the placeholder doubles as a hint at what is there.
  const examples = names.length >= 3 ? names : EXAMPLES;
  const [exampleIndex, setExampleIndex] = useState(0);
  const cycling = value === "" && !open;
  useEffect(() => {
    if (!cycling) return;
    const timer = setInterval(() => setExampleIndex((i) => (i + 1) % examples.length), EXAMPLE_MS);
    return () => clearInterval(timer);
  }, [cycling, examples.length]);

  const needle = value.trim().toLowerCase();
  const exact = names.some((name) => name.toLowerCase() === needle);
  // Names that start with what was typed come first: "Ha" means Halo before
  // it means Shadow Hearts.
  const suggestions = names
    .filter((name) => name.toLowerCase() !== needle && name.toLowerCase().includes(needle))
    .sort((a, b) => Number(!a.toLowerCase().startsWith(needle)) - Number(!b.toLowerCase().startsWith(needle)))
    .slice(0, MAX_SUGGESTIONS);
  const showing = open && suggestions.length > 0;

  function choose(name: string) {
    setValue(name);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className={`relative flex flex-col gap-1.5 ${className}`}>
      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Series</span>
        <input
          name="series"
          type="text"
          maxLength={120}
          autoComplete="off"
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={`e.g. ${examples[exampleIndex % examples.length]}`}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          // Late enough for a tap on a suggestion to land first.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (!showing) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => (i <= 0 ? suggestions.length : i) - 1);
            } else if (event.key === "Enter" && active >= 0) {
              // Choosing, not saving: the second Enter saves.
              event.preventDefault();
              choose(suggestions[active]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className="field"
        />
      </label>

      {showing ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-line-strong bg-band"
        >
          {suggestions.map((name, i) => (
            <li
              key={name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(event) => {
                // Keep focus in the box, so the blur above does not close the
                // list before this tap counts.
                event.preventDefault();
                choose(name);
              }}
              className={`cursor-pointer px-3 py-2.5 ${i === active ? "bg-panel" : "hover:bg-panel"}`}
            >
              {name}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="font-narrow text-sm text-ink-dim">
        {needle && !exact ? `“${value.trim()}” will be a new series.` : "Pick one you have used, or type a new one."}
      </p>
    </div>
  );
}
