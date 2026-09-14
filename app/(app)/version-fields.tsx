"use client";

import { KIND_LABELS, type FormKind } from "@/lib/versions/types";

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

        <label className="flex flex-col gap-1.5">
          <span className="font-narrow text-ink-dim">Platform</span>
          <input
            name="platformName"
            type="text"
            list="platform-names"
            placeholder="PC, Nintendo 64…"
            defaultValue={values?.platformName ?? ""}
            className={FIELD}
          />
          <datalist id="platform-names">
            {platforms.map((platform) => (
              <option key={platform} value={platform} />
            ))}
          </datalist>
        </label>

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
