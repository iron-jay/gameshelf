import { ilike } from "drizzle-orm";
import Image from "next/image";

import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { platformNameFor, primaryPlatformFor } from "@/lib/igdb/mapping";
import { searchGames } from "@/lib/igdb/search";
import { igdbImageUrl, IgdbError, IgdbNotConfiguredError, type IgdbGame } from "@/lib/igdb/types";

import { AddButton } from "./add-button";

export const dynamic = "force-dynamic";

type SearchResult =
  | { kind: "local"; id: string; title: string; year: number | null; coverUrl: string | null }
  | {
      kind: "igdb";
      id: number;
      title: string;
      year: number | null;
      coverUrl: string | null;
      platforms: string;
      /** Every platform IGDB lists, for the picker. Spelled out, as the name will be. */
      platformOptions: { id: number; name: string }[];
      defaultPlatformId: number | null;
    };

function yearOf(seconds: number | undefined): number | null {
  return seconds ? new Date(seconds * 1000).getUTCFullYear() : null;
}

function toResult(game: IgdbGame): SearchResult {
  const available = game.platforms ?? [];

  return {
    kind: "igdb",
    id: game.id,
    title: game.name,
    year: yearOf(game.first_release_date),
    coverUrl: game.cover ? igdbImageUrl(game.cover.image_id, "cover_small") : null,
    platforms: available
      .map((p) => p.abbreviation ?? p.name)
      .slice(0, 4)
      .join(" · "),
    // Named the same way the row will be, so the picker is not offering one
    // spelling and storing another.
    platformOptions: [...available]
      .map((p) => ({ id: p.id, name: platformNameFor(p) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    // The same call the server makes when nothing is chosen, so what the picker
    // shows is what an untouched Add would produce.
    defaultPlatformId: primaryPlatformFor(game)?.id ?? null,
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const term = q.trim();

  // Local works are searched regardless of whether IGDB is reachable, so an
  // offline or unconfigured server still finds what it already knows about.
  const local = term
    ? await db
        .select({
          id: works.id,
          title: works.title,
          firstReleaseDate: works.firstReleaseDate,
          coverUrl: works.coverUrl,
        })
        .from(works)
        .where(ilike(works.title, `%${term}%`))
        .limit(10)
    : [];

  let remote: SearchResult[] = [];
  let notice: string | null = null;

  if (term) {
    try {
      remote = (await searchGames(term)).map(toResult);
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
        year: w.firstReleaseDate ? Number(w.firstReleaseDate.slice(0, 4)) : null,
        coverUrl: w.coverUrl,
      }),
    ),
    ...remote,
  ];

  return (
    <main className="flex-1 p-6">
      <form className="mb-6 flex gap-2" action="/search">
        <input
          name="q"
          type="search"
          defaultValue={term}
          placeholder="Search for a game"
          autoFocus
          className="w-full max-w-md border border-line bg-panel px-3 py-2 text-ink outline-none focus:border-ink-dim"
        />
        <button
          type="submit"
          className="border border-line bg-panel px-4 py-2 font-medium hover:border-ink-dim"
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
            className="flex items-center gap-4 border-b border-line py-3"
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

            <div className="min-w-0">
              <p className="truncate">
                {r.title}
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
              />
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
