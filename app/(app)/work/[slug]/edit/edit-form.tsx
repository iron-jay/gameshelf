"use client";

import { useActionState } from "react";

import Link from "next/link";

import { updateWorkDetails, type WorkDetailsState } from "./actions";

export function EditWorkForm({
  slug,
  values,
}: {
  slug: string;
  values: { title: string; releaseDate: string | null; summary: string | null };
}) {
  const [state, action, pending] = useActionState<WorkDetailsState, FormData>(updateWorkDetails, null);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="slug" value={slug} />

      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Title</span>
        <input name="title" type="text" required defaultValue={values.title} className="field" />
      </label>

      <label className="flex flex-col gap-1.5 sm:max-w-xs">
        <span className="font-narrow text-ink-dim">Release date</span>
        <input name="releaseDate" type="date" defaultValue={values.releaseDate ?? ""} className="field" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Summary</span>
        <textarea name="summary" rows={8} defaultValue={values.summary ?? ""} className="field leading-relaxed" />
      </label>

      {state ? (
        <p role="status" className="border-l-2 border-ink-dim pl-3 font-narrow">
          {state.message}
          {state.ok ? (
            <>
              {" · "}
              <Link href={`/work/${slug}`} className="underline">
                Back to the game
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href={`/work/${slug}`} className="font-narrow text-ink-dim underline hover:text-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
