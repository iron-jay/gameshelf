"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

type Scope = "work" | "version";

/**
 * The game or just this version. The whole game is the default because that
 * is what Delete on a cover's page usually means (Jay, 2026-10-20); a game
 * with one version has no choice to make, so the switch is not shown.
 */
export function DeleteChoice({
  action,
  versionId,
  workTitle,
  versionName,
  workSummary,
  versionSummary,
  keepHref,
}: {
  action: (formData: FormData) => Promise<void>;
  versionId: string;
  workTitle: string;
  versionName: string;
  workSummary: ReactNode;
  versionSummary: ReactNode | null;
  keepHref: string;
}) {
  const [scope, setScope] = useState<Scope>("work");
  const choosing = versionSummary !== null;

  return (
    <form action={action}>
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="scope" value={scope} />

      <h1 className="mb-4 font-display text-3xl">
        Delete {scope === "work" ? workTitle : versionName}?
      </h1>

      {choosing ? (
        <div className="segmented mb-5 max-w-md" role="group" aria-label="What to delete">
          <button type="button" aria-pressed={scope === "work"} onClick={() => setScope("work")}>
            The whole game
          </button>
          <button
            type="button"
            aria-pressed={scope === "version"}
            onClick={() => setScope("version")}
          >
            Just this version
          </button>
        </div>
      ) : null}

      {scope === "work" ? workSummary : versionSummary}

      <div className="mt-6 flex items-center gap-4">
        <button type="submit" className="btn btn-danger">
          {scope === "work" ? "Delete the game" : "Delete this version"}
        </button>
        <Link href={keepHref} className="font-narrow text-ink-dim underline hover:text-ink">
          Keep it
        </Link>
      </div>
    </form>
  );
}
