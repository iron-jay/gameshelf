import Image from "next/image";
import Link from "next/link";

import { shortDlcTitle, type DlcItem } from "@/lib/dlc";
import { STATUS_LABELS } from "@/lib/status";

import { bringInGame, setDlcShown } from "./work/[slug]/dlc-actions";

/**
 * A game's DLC, on the game page and on each of its versions' pages, since a
 * cover opens the version and the DLC should be where you land. Each one is a
 * game of its own underneath — its own shelf, rating and review, a tap away —
 * but it is listed here rather than standing on the shelf, unless the switch
 * below puts it back there.
 */
export function DlcSection({
  game,
  items,
}: {
  game: { id: string; slug: string; title: string; dlcOnShelf: boolean };
  items: DlcItem[];
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-xl">DLC</h2>
        <span className="text-ink-dim">{items.length}</span>
        <div className="flex-1" />
        <Link href={`/work/${game.slug}/dlc`} className="btn btn-sm">
          Add DLC
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-2 font-narrow text-ink-dim">None here yet.</p>
      ) : (
        <>
          <ul className="shelf-strip">
            {items.map((item) => {
              const name = shortDlcTitle(item.title, game.title);
              return (
                <li key={item.workId} className="w-28">
                  <Link
                    href={item.versionId ? `/version/${item.versionId}` : `/work/${item.slug}`}
                    className="relative block aspect-[3/4] bg-panel"
                  >
                    <span className="sr-only">{item.title}</span>
                    {item.coverUrl ? (
                      <Image src={item.coverUrl} alt="" fill sizes="112px" className="object-cover" unoptimized />
                    ) : (
                      <span className="block p-2 font-display text-sm break-words">{name}</span>
                    )}
                    {item.rating ? <span className="sticker">{item.rating}</span> : null}
                  </Link>
                  <p className="mt-1 line-clamp-2 font-narrow text-sm leading-tight">{name}</p>
                  <p className="truncate font-narrow text-xs text-ink-dim">
                    {item.status ? STATUS_LABELS[item.status] : "Not on your shelf"}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="plank" />

          <form action={setDlcShown} className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <input type="hidden" name="workId" value={game.id} />
            <input type="hidden" name="slug" value={game.slug} />
            <span className="font-narrow text-ink-dim">On your shelf</span>
            <div className="segmented text-[14px] sm:text-base">
              <button type="submit" name="show" value="false" aria-pressed={!game.dlcOnShelf}>
                Under the game
              </button>
              <button type="submit" name="show" value="true" aria-pressed={game.dlcOnShelf}>
                As separate games
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

/**
 * The other end: on a DLC's own pages, the game it belongs to — or, for DLC
 * shelved before its game was here, a way to bring the game in.
 */
export function DlcOf({
  parent,
  parentIgdbId,
  slug,
}: {
  parent: { slug: string; title: string } | null;
  parentIgdbId: number | null;
  slug: string;
}) {
  if (parent) {
    return (
      <p className="mb-1 font-narrow text-ink-dim">
        DLC for{" "}
        <Link href={`/work/${parent.slug}`} className="underline underline-offset-4 hover:text-ink">
          {parent.title}
        </Link>
      </p>
    );
  }
  if (!parentIgdbId) return null;
  return (
    <form action={bringInGame} className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-narrow text-ink-dim">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="parentIgdbId" value={parentIgdbId} />
      <span>Its game is not here yet.</span>
      <button type="submit" className="underline underline-offset-4 hover:text-ink">
        Bring it in from IGDB
      </button>
    </form>
  );
}
