"use client";

import { useActionState } from "react";

import Link from "next/link";

import type { CreateVersionState } from "@/lib/versions/types";

import { updateVersion } from "../../../version-actions";
import { FIELD, VersionFields, type VersionFieldValues } from "../../../version-fields";

export function EditVersionForm({
  versionId,
  values,
  kinds,
  platforms,
  siblings,
  baseVersionId,
}: {
  versionId: string;
  values: VersionFieldValues;
  kinds: readonly string[];
  platforms: string[];
  /** Other versions of the same work — the only things this one can be based on. */
  siblings: { id: string; name: string }[];
  baseVersionId: string | null;
}) {
  const [state, action, pending] = useActionState<CreateVersionState, FormData>(
    updateVersion,
    null,
  );

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="versionId" value={versionId} />

      <VersionFields values={values} kinds={kinds} platforms={platforms} nameLabel="Name" />

      {siblings.length > 0 ? (
        <label className="flex flex-col gap-1.5">
          <span className="font-narrow text-ink-dim">Which release does it patch? (optional)</span>
          <select name="baseVersionId" defaultValue={baseVersionId ?? ""} className={FIELD}>
            <option value="">Not sure</option>
            {siblings.map((sibling) => (
              <option key={sibling.id} value={sibling.id}>
                {sibling.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {state ? (
        <p role="status" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.message}
          {state.ok ? (
            <>
              {" · "}
              <Link href={`/version/${versionId}`} className="underline">
                Back to the version
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="border border-line bg-panel px-4 py-2 font-medium hover:border-ink-dim disabled:text-ink-dim"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href={`/version/${versionId}`} className="font-narrow text-ink-dim underline hover:text-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
