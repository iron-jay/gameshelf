"use client";

import { useActionState } from "react";

import { checkConnections, type ConnectionReport } from "./actions";

export function ConnectionCheck() {
  const [report, action, pending] = useActionState<ConnectionReport, FormData>(
    async () => checkConnections(),
    null,
  );

  return (
    <form action={action}>
      <button
        type="submit"
        disabled={pending}
        className="border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim disabled:text-ink-dim"
      >
        {pending ? "Checking…" : "Test connections"}
      </button>

      {report ? (
        <ul className="mt-3 flex flex-col gap-1" role="status">
          <li className="font-narrow">
            <span className="text-ink-dim">IGDB</span> — {report.igdb.detail}
          </li>
          <li className="font-narrow">
            <span className="text-ink-dim">SteamGridDB</span> — {report.sgdb.detail}
          </li>
        </ul>
      ) : null}
    </form>
  );
}
