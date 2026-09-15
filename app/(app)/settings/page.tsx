import { count } from "drizzle-orm";

import { authDisabled, requireUser } from "@/lib/auth";
import { listCoverFiles } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, igdbTokens } from "@/lib/db/schema";

import { orphanedCoverFiles } from "@/lib/works/removal";

import { ConnectionCheck } from "./connection-check";
import { CoverSweep } from "./cover-sweep";

export const dynamic = "force-dynamic";

/** Whether a secret is present, never any part of its value. */
function configured(value: string | undefined): string {
  return value ? "set" : "not set";
}

export default async function SettingsPage() {
  const user = await requireUser();

  const [token] = await db.select().from(igdbTokens).limit(1);
  const [entryTotal] = await db.select({ total: count() }).from(entries);

  const coverFiles = await listCoverFiles();
  const orphans = await orphanedCoverFiles(coverFiles);


  return (
    <main className="flex-1 p-6">
      <h1 className="mb-6 text-xl font-medium">Settings</h1>

      <div className="flex max-w-2xl flex-col gap-10">
        <section>
          <h2 className="mb-2 font-medium">Access</h2>
          <p className="font-narrow text-ink-dim">
            {user.displayName ?? user.username}
            {user.isAdmin ? " · admin" : ""}
          </p>
          {authDisabled() ? (
            <p className="mt-2 max-w-2xl border-l-2 border-ink-dim pl-3 font-narrow">
              Sign-in is off (<span className="font-mono">AUTH_DISABLED</span>).
              Anything that can reach this port can read, edit and delete without a
              password — which is the point on a private network, and a problem
              anywhere else.
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="mb-2 font-medium">Credentials</h2>
          <ul className="mb-3 flex flex-col gap-1 font-narrow text-ink-dim">
            <li>IGDB client id — {configured(process.env.IGDB_CLIENT_ID)}</li>
            <li>IGDB client secret — {configured(process.env.IGDB_CLIENT_SECRET)}</li>
            <li>SteamGridDB API key — {configured(process.env.SGDB_API_KEY)}</li>
            <li>
              Cached IGDB token —{" "}
              {token
                ? `expires ${token.expiresAt.toISOString().slice(0, 10)}`
                : "none yet, fetched on first use"}
            </li>
          </ul>
          <ConnectionCheck />
        </section>

        <section>
          <h2 className="mb-2 font-medium">Cover art</h2>
          <p className="mb-3 font-narrow text-ink-dim">
            {coverFiles.length} {coverFiles.length === 1 ? "file" : "files"} stored.{" "}
            {orphans.length === 0
              ? "Nothing unreferenced."
              : `${orphans.length} ${orphans.length === 1 ? "file is" : "files are"} no longer referenced by anything.`}
          </p>
          {orphans.length > 0 ? <CoverSweep /> : null}
        </section>

        <section>
          <h2 className="mb-1 font-medium">Export</h2>
          <p className="mb-3 font-narrow text-ink-dim">
            {entryTotal.total} {entryTotal.total === 1 ? "entry" : "entries"}. No ceremony beyond
            being logged in — both are plain GETs you can curl. Cached IGDB payloads are left out
            on purpose: they are upstream data that can be fetched again, not yours.
          </p>
          {/* Route handlers returning attachments, not pages: next/link would do a
              client-side navigation and never trigger a download. */}
          <p className="flex gap-3">
            <a
              href="/export/json"
              download
              className="border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim"
            >
              Download JSON
            </a>
            <a
              href="/export/csv"
              download
              className="border border-line bg-panel px-3 py-2 font-narrow hover:border-ink-dim"
            >
              Download CSV
            </a>
          </p>
          <p className="mt-2 font-narrow text-ink-dim">
            JSON keeps every play. CSV is one row per shelf entry with the plays summarised, the
            way a Goodreads export is one row per book.
          </p>
        </section>
      </div>
    </main>
  );
}
