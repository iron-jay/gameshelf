import Image from "next/image";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { searchGames } from "@/lib/igdb/search";
import { IgdbError, IgdbNotConfiguredError } from "@/lib/igdb/types";
import { igdbResultFor, searchLocalWorks, type IgdbResult } from "@/lib/search";
import { STATUS_ORDER } from "@/lib/status";

import { AddButton } from "./add-button";

export const dynamic = "force-dynamic";

type SearchResult =
  | {
      kind: "local";
      id: string;
      title: string;
      year: number | null;
      coverUrl: string | null;
      /** The entry if there is exactly one, otherwise the work. */
      href: string;
    }
  | ({ kind: "igdb" } & IgdbResult);

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const term = q.trim();

  // Local works are searched regardless of whether IGDB is reachable, so an
  // offline or unconfigured server still finds what it already knows about.
  const local = await searchLocalWorks(user.id, term);

  let remote: SearchResult[] = [];
  let notice: string | null = null;

  if (term) {
    try {
      remote = (await searchGames(term)).map((game) => ({ kind: "igdb", ...igdbResultFor(game) }));
    } catch (err) {
      notice =
        err instanceof IgdbNotConfiguredError
          ? "IGDB credentials are not set, so only local results are shown. Add IGDB_CLIENT_ID and IGDB_CLIENT_SECRET to .env."
          : err instanceof IgdbError
            ? `IGDB search failed (${err.status ?? "no response"}). Local results are still shown.`
            : "IGDB search failed. Local results are still shown.";
    }
  }

  const results: SearchResult[] = [
    ...local.map(
      (w): SearchResult => ({
        kind: "local",
        id: w.id,
        title: w.title,
        year: w.year,
        coverUrl: w.coverUrl,
        // A work with two versions on your shelf has no single entry to open,
        // so that one goes to the work page and lets you pick: guessing
        // between a romhack and the original would be worse.
        href:
          w.shelvedVersionIds.length === 1
            ? `/version/${w.shelvedVersionIds[0]}`
            : `/work/${w.slug}`,
      }),
    ),
    ...remote,
  ];

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <h1 className="mb-4 font-display text-3xl sm:text-4xl">Find a game</h1>
      <form className="mb-6 flex max-w-xl gap-2" action="/search">
        <input
          name="q"
          type="search"
          defaultValue={term}
          placeholder="Search for a game"
          autoFocus
          className="field rounded-full px-4"
        />
        <button
          type="submit"
          className="btn btn-primary"
        >
          Search
        </button>
      </form>

      {notice ? (
        <p role="status" className="mb-6 border-l-2 border-ink-dim pl-3 font-narrow">
          {notice}
        </p>
      ) : null}

      {term && results.length === 0 ? (
        <p className="font-narrow text-ink-dim">Nothing found for “{term}”.</p>
      ) : null}

      <ul className="flex flex-col">
        {results.map((r) => (
          <li
            key={`${r.kind}-${r.id}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3"
          >
            <div className="h-16 w-12 shrink-0 bg-panel">
              {r.coverUrl ? (
                <Image
                  src={r.coverUrl}
                  alt=""
                  width={48}
                  height={64}
                  className="h-16 w-12 object-cover"
                  // Local covers are behind the session-checked /covers route,
                  // which Next's optimiser cannot fetch because it carries no
                  // cookie. Remote IGDB thumbnails are mostly never added, so
                  // optimising them would cache art for every search result.
                  unoptimized
                />
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {r.kind === "local" ? (
                  <Link href={r.href} className="underline hover:text-ink">
                    {r.title}
                  </Link>
                ) : (
                  r.title
                )}
                {r.year ? <span className="ml-2 text-ink-dim">{r.year}</span> : null}
              </p>
              {/* Once the picker is listing the platforms, repeating a
                  truncated copy of them here is just noise. */}
              <p className="font-narrow text-ink-dim">
                {r.kind === "local"
                  ? "On your server"
                  : r.platformOptions.length > 1
                    ? "IGDB"
                    : r.platforms || "IGDB"}
              </p>
            </div>

            {r.kind === "igdb" ? (
              <AddButton
                igdbId={r.id}
                platforms={r.platformOptions}
                defaultPlatformId={r.defaultPlatformId}
                statuses={STATUS_ORDER}
                defaultStatus={r.defaultStatus}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
