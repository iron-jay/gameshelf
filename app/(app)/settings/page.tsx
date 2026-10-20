import { and, count, isNotNull, isNull } from "drizzle-orm";
import Link from "next/link";

import { authDisabled, requireUser } from "@/lib/auth";
import { listDeviceSessions } from "@/lib/auth/session";
import { listCoverFiles } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, igdbTokens, works } from "@/lib/db/schema";

import { orphanedCoverFiles } from "@/lib/works/removal";

import { revokeDevice } from "./actions";
import { AccountForm } from "./account-form";
import { ConnectionCheck } from "./connection-check";
import { GrouveeImport } from "./grouvee-import";
import { PasswordForm } from "./password-form";
import { RestoreImport } from "./restore-import";
import { SeriesBackfill } from "./series-backfill";
import { CoverSweep } from "./cover-sweep";

export const dynamic = "force-dynamic";

/** Whether a secret is present, never any part of its value. */
function configured(value: string | undefined): string {
  return value ? "set" : "not set";
}

export default async function SettingsPage() {
  const user = await requireUser();
  const devices = await listDeviceSessions(user.id);

  const [token] = await db.select().from(igdbTokens).limit(1);
  const [entryTotal] = await db.select({ total: count() }).from(entries);

  const coverFiles = await listCoverFiles();
  const orphans = await orphanedCoverFiles(coverFiles);

  const [fromIgdbRow] = await db
    .select({ total: count() })
    .from(works)
    .where(isNotNull(works.igdbId));
  const [seriesLessRow] = await db
    .select({ total: count() })
    .from(works)
    .where(and(isNotNull(works.igdbId), isNull(works.series)));
  const fromIgdb = fromIgdbRow.total;
  const seriesless = seriesLessRow.total;


  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <h1 className="mb-6 font-display text-3xl">Settings</h1>

      <div className="flex max-w-2xl flex-col gap-10">
        <section>
          <h2 className="mb-2 font-display text-xl">Account</h2>
          <p className="font-narrow text-ink-dim">
            Signed in as {user.username}
            {user.isAdmin ? " · admin" : ""}
          </p>
          <AccountForm username={user.username} displayName={user.displayName} />

          <h3 className="mt-8 font-medium">Password</h3>
          <PasswordForm />
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
          <h2 className="mb-2 font-display text-xl">Signed-in devices</h2>
          {devices.length === 0 ? (
            <p className="font-narrow text-ink-dim">
              No phones signed in. A device appears here when the app signs in to this server.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 font-narrow">
              {devices.map((device) => (
                <li key={device.id} className="flex items-center justify-between gap-4">
                  <span>
                    {device.label ?? "Unnamed device"}
                    <span className="text-ink-dim">
                      {" "}
                      · signed in {device.createdAt.toISOString().slice(0, 10)}
                      {device.lastUsedAt
                        ? `, last used ${device.lastUsedAt.toISOString().slice(0, 10)}`
                        : ""}
                    </span>
                  </span>
                  <form action={revokeDevice}>
                    <input type="hidden" name="id" value={device.id} />
                    <button type="submit" className="text-ink-dim hover:text-danger">
                      Sign out
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-display text-xl">Credentials</h2>
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
          <h2 className="mb-2 font-display text-xl">Cover art</h2>
          <p className="mb-3 font-narrow text-ink-dim">
            {coverFiles.length} {coverFiles.length === 1 ? "file" : "files"} stored.{" "}
            {orphans.length === 0
              ? "Nothing unreferenced."
              : `${orphans.length} ${orphans.length === 1 ? "file is" : "files are"} no longer referenced by anything.`}
          </p>
          {orphans.length > 0 ? <CoverSweep /> : null}

          <p className="mt-3 font-narrow">
            <Link href="/art" className="text-ink-dim underline hover:text-ink">
              Cover art to review
            </Link>
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-xl">Series</h2>
          <p className="mb-3 font-narrow text-ink-dim">
            {seriesless} of {fromIgdb} {fromIgdb === 1 ? "game" : "games"} from IGDB have no series
            yet. New additions get one automatically; this is for everything added before that
            existed. It only fills in blanks — a series you typed is never overwritten.
          </p>
          <SeriesBackfill />
        </section>

        <section>
          <h2 className="mb-1 font-display text-xl">Import from Grouvee</h2>
          <p className="mb-1 font-narrow text-ink-dim">
            The JSON export from <span className="font-mono">grouvee.com</span> — Settings
            &rarr; Export. Every game there carries an IGDB id, so matching is exact
            rather than a guess at the title.
          </p>
          <GrouveeImport />
        </section>

        <section>
          <h2 className="mb-1 font-display text-xl">Export and restore</h2>
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
              className="btn"
            >
              Download JSON
            </a>
            <a
              href="/export/csv"
              download
              className="btn"
            >
              Download CSV
            </a>
          </p>
          <p className="mt-2 font-narrow text-ink-dim">
            JSON keeps every play. CSV is one row per shelf entry with the plays summarised, the
            way a Goodreads export is one row per book.
          </p>

          <h3 className="mt-6 font-medium">Restore from an export</h3>
          <p className="font-narrow text-ink-dim">
            The JSON download, here or from another gameshelf: to get a library back, or move it to
            a new server. Games already here are joined rather than doubled, and entries already on
            your shelf are left as they are. Covers are looked up again, so art you uploaded or
            chose by hand needs choosing again.
          </p>
          <RestoreImport />
        </section>
      </div>
    </main>
  );
}
