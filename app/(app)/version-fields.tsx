"use client";

import { useState } from "react";

import { KIND_LABELS, OTHER_PLATFORM, type FormKind } from "@/lib/versions/types";

export const FIELD =
  "w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim";

export type VersionFieldValues = {
  name?: string | null;
  kind?: string | null;
  platformName?: string | null;
  author?: string | null;
  versionLabel?: string | null;
  releaseDate?: string | null;
  url?: string | null;
  notes?: string | null;
};

/**
 * Platforms already in use, offered as a list, with free text a click away.
 *
 * A bare text field with a `datalist` was the first attempt: the suggestions are
 * there but nothing on screen says so, so in practice you retype "Nintendo 64"
 * and get a second row differing by a space. A select shows what exists. The
 * text box still has to be reachable, though — a recomp running on something
 * nothing else on the shelf runs on is the normal case here, not the exception.
 *
 * Only one control carries the name at a time, so there is never a question of
 * which one the form submits.
 */
function PlatformField({ value, platforms }: { value: string; platforms: string[] }) {
  const [typing, setTyping] = useState(
    platforms.length === 0 || (value !== "" && !platforms.includes(value)),
  );
  const [text, setText] = useState(value);

  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-narrow text-ink-dim">Platform</span>

      {typing ? (
        <>
          <input
            name="platformName"
            type="text"
            list="platform-names"
            placeholder="PC, Nintendo 64…"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className={FIELD}
          />
          {/* Still suggests, so a near-miss on an existing name is visible
              before it becomes a duplicate row. */}
          <datalist id="platform-names">
            {platforms.map((platform) => (
              <option key={platform} value={platform} />
            ))}
          </datalist>
          {platforms.length > 0 ? (
            <button
              type="button"
              onClick={() => setTyping(false)}
              className="self-start font-narrow text-ink-dim underline hover:text-ink"
            >
              Choose one already in use
            </button>
          ) : null}
        </>
      ) : (
        <select
          name="platformName"
          defaultValue={value}
          onChange={(event) => {
            if (event.target.value !== OTHER_PLATFORM) return;
            setText("");
            setTyping(true);
          }}
          className={FIELD}
        >
          <option value="">No platform</option>
          {platforms.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
          <option value={OTHER_PLATFORM}>Something else…</option>
        </select>
      )}
    </label>
  );
}

/**
 * The fields a version has, shared by the add form and the edit form.
 *
 * The two operations are not the same — adding picks a base game and looks up
 * art, editing does neither — but the fields themselves are identical, and two
 * copies of them would drift the first time one gained something the other did
 * not.
 */
export function VersionFields({
  values,
  kinds,
  platforms,
  nameLabel,
  nameHint,
  onNameBlur,
  autoFocus = false,
}: {
  values?: VersionFieldValues;
  /** Which kinds this form is allowed to offer. */
  kinds: readonly string[];
  /** Names already in the platforms table, so the field can suggest them. */
  platforms: string[];
  nameLabel: string;
  nameHint?: string;
  onNameBlur?: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">{nameLabel}</span>
        <input
          name="name"
          type="text"
          required
          autoFocus={autoFocus}
          defaultValue={values?.name ?? ""}
          className={FIELD}
          onBlur={onNameBlur ? (event) => onNameBlur(event.target.value) : undefined}
        />
        {nameHint ? <span className="font-narrow text-ink-dim">{nameHint}</span> : null}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Kind</span>
        <select name="kind" defaultValue={values?.kind ?? kinds[0]} className={FIELD}>
          {kinds.map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value as FormKind] ?? value.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-narrow text-ink-dim">Author</span>
          <input
            name="author"
            type="text"
            defaultValue={values?.author ?? ""}
            className={FIELD}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-narrow text-ink-dim">Version label</span>
          <input
            name="versionLabel"
            type="text"
            placeholder="v1.2.1"
            defaultValue={values?.versionLabel ?? ""}
            className={`${FIELD} font-mono`}
          />
        </label>

        <PlatformField value={values?.platformName ?? ""} platforms={platforms} />

        <label className="flex flex-col gap-1.5">
          <span className="font-narrow text-ink-dim">Release date</span>
          <input
            name="releaseDate"
            type="date"
            defaultValue={values?.releaseDate ?? ""}
            className={FIELD}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="font-narrow text-ink-dim">URL</span>
          <input name="url" type="url" defaultValue={values?.url ?? ""} className={FIELD} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Notes</span>
        <textarea name="notes" rows={3} defaultValue={values?.notes ?? ""} className={FIELD} />
      </label>
    </>
  );
}
