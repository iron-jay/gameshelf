import Image from "next/image";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { offShelfGames, type OffShelfGame } from "@/lib/off-shelf";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/status";

import { shelveGame } from "./actions";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/**
 * Games here that are on none of your shelves, so nothing on the shelf leads
 * to them (Jay, 2026-10-21). Its own page, linked from Settings, as /art is: a
 * list to work through, each put on a shelf, given a way to play, or deleted.
 */
export const metadata: Metadata = { title: "Not on your shelf" };

export default async function OffShelfPage() {
  const user = await requireUser();
  const games = await offShelfGames(user.id);

  const noWay = games.filter((game) => game.versionCount === 0);
  const forOthers = games.filter((game) => game.versionCount > 0 && game.holdsShelved);
  const rest = games.filter((game) => game.versionCount > 0 && !game.holdsShelved);

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href="/settings" className="underline">
          Settings
        </Link>
      </p>
      <h1 className="mb-2 font-display text-3xl">Not on your shelf</h1>
      <p className="mb-8 max-w-2xl font-narrow text-ink-dim">
        Games on this server that are on none of your shelves, so the shelf never shows them. Put
        one on a shelf, open it, or delete it. DLC is not listed: it lives on its game&rsquo;s page.
      </p>

      {games.length === 0 ? (
        <p className="font-narrow text-ink-dim">
          Every game here is on your shelf.{" "}
          <Link href="/" className="underline">
            Back to the shelf
          </Link>
          .
        </p>
      ) : (
        <div className="flex max-w-3xl flex-col gap-10">
          <Group
            title="No way to play"
            about="A game with no versions. Usually the original of a romhack, left behind when romhacks became games of their own. One from IGDB gets its own release back when you shelve it."
            games={noWay}
          />
          <Group title="Off the shelf" about="Taken off the shelf, or never put on it." games={rest} />
          <Group
            title="Here for something you have"
            about="The game a DLC or a romhack on your shelf belongs to. Nothing is wrong with these; they are listed so you can find them."
            games={forOthers}
          />
        </div>
      )}
    </main>
  );
}

function Group({ title, about, games }: { title: string; about: string; games: OffShelfGame[] }) {
  if (games.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-xl">{title}</h2>
        <span className="text-ink-dim">{games.length}</span>
      </div>
      <p className="mt-1 font-narrow text-ink-dim">{about}</p>
      <ul className="mt-2 flex flex-col">
        {games.map((game) => (
          <Row key={game.workId} game={game} />
        ))}
      </ul>
    </section>
  );
}

function Row({ game }: { game: OffShelfGame }) {
  const href = game.versionId ? `/version/${game.versionId}` : `/work/${game.slug}`;
  const shelvable = game.versionId !== null || (game.versionCount === 0 && game.fromIgdb);
  const notes = [
    // A standalone expansion says so in full on its own line.
    game.workKind === "main_game" || game.parentTitle ? null : game.workKind.replace(/_/g, " "),
    game.year,
    game.fromIgdb ? null : "local",
    game.versionName,
    game.versionCount > 1 ? `${game.versionCount} ways to play` : null,
  ];

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3">
      <Link href={href} className="relative block aspect-[3/4] w-12 shrink-0 bg-panel">
        <span className="sr-only">{game.title}</span>
        {game.coverUrl ? (
          <Image src={game.coverUrl} alt="" fill sizes="48px" className="object-cover" unoptimized />
        ) : null}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={href} className="line-clamp-2 font-semibold hover:underline">
          {game.title}
        </Link>
        <p className="font-narrow text-ink-dim">{notes.filter(Boolean).join(" · ")}</p>
        {game.parentTitle ? (
          <p className="font-narrow text-ink-dim">Standalone expansion of {game.parentTitle}</p>
        ) : null}
        {game.romhacks.length > 0 ? (
          <p className="font-narrow text-ink-dim">
            {game.romhacks.length === 1 ? "Romhack" : "Romhacks"} made from it: {game.romhacks.join(", ")}
          </p>
        ) : null}
        <p className="mt-1 flex gap-4 font-narrow">
          {game.versionCount === 0 && !game.fromIgdb ? (
            <Link href={`/work/${game.slug}/add-version`} className="underline underline-offset-4">
              Add a way to play
            </Link>
          ) : null}
          {game.versionCount > 1 ? (
            <Link href={`/work/${game.slug}`} className="underline underline-offset-4">
              Choose a way to play
            </Link>
          ) : null}
          <Link
            href={`/work/${game.slug}/delete?from=off-shelf`}
            className="text-ink-dim underline underline-offset-4 hover:text-danger"
          >
            Delete
          </Link>
        </p>
      </div>
      {shelvable ? (
        <form
          action={shelveGame}
          aria-label={`Shelf for ${game.title}`}
          className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:px-0"
        >
          <input type="hidden" name="workId" value={game.workId} />
          <div className="segmented text-[13px]">
            {STATUS_ORDER.map((value) => (
              <button key={value} type="submit" name="status" value={value}>
                {STATUS_LABELS[value]}
              </button>
            ))}
          </div>
        </form>
      ) : null}
    </li>
  );
}
