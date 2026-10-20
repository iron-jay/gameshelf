import Image from "next/image";
import Link from "next/link";

import { shortDlcTitle, type DlcItem } from "@/lib/dlc";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/status";

import { bringInGame, setDlcShown, setDlcStatus } from "./work/[slug]/dlc-actions";

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
  const shelved = items.filter((item) => item.status).length;
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-xl">DLC</h2>
        <span className="text-ink-dim">{items.length}</span>
        {shelved > 0 ? <span className="font-narrow text-ink-dim">{shelved} on your shelf</span> : null}
        <div className="flex-1" />
        <Link href={`/work/${game.slug}/dlc`} className="btn btn-sm">
          Add DLC
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-2 font-narrow text-ink-dim">None here yet.</p>
      ) : (
        <>
          {/* Every DLC IGDB knows of is here already (lib/dlc-fill.ts), so
              putting one on your shelf is one press of its shelf, the same
              control the version page has. */}
          <ul className="mt-2 flex flex-col">
            {items.map((item) => {
              const name = shortDlcTitle(item.title, game.title);
              const href = item.versionId ? `/version/${item.versionId}` : `/work/${item.slug}`;
              return (
                <li key={item.workId} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3">
                  <Link href={href} className="relative block aspect-[3/4] w-12 shrink-0 bg-panel">
                    <span className="sr-only">{item.title}</span>
                    {item.coverUrl ? (
                      <Image src={item.coverUrl} alt="" fill sizes="48px" className="object-cover" unoptimized />
                    ) : null}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={href} className="line-clamp-2 font-semibold hover:underline">
                      {name}
                    </Link>
                    <p className="font-narrow text-ink-dim">
                      {[
                        item.workKind.replace(/_/g, " "),
                        item.year,
                        item.rating ? `${item.rating} / 10` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {item.versionId ? (
                    <form
                      action={setDlcStatus}
                      aria-label={`Shelf for ${name}`}
                      className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:px-0"
                    >
                      <input type="hidden" name="versionId" value={item.versionId} />
                      <input type="hidden" name="slug" value={game.slug} />
                      <div className="segmented text-[13px]">
                        {STATUS_ORDER.map((value) => (
                          <button
                            key={value}
                            type="submit"
                            name="status"
                            value={value}
                            aria-pressed={item.status === value}
                          >
                            {STATUS_LABELS[value]}
                          </button>
                        ))}
                      </div>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <form action={setDlcShown} className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
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
 * shelved before its game was here, a way to bring the game in. A standalone
 * expansion says so, since it is a game of its own that only came from this one.
 */
export function DlcOf({
  parent,
  parentIgdbId,
  slug,
  standalone = false,
}: {
  parent: { slug: string; title: string } | null;
  parentIgdbId: number | null;
  slug: string;
  standalone?: boolean;
}) {
  if (parent) {
    return (
      <p className="mb-1 font-narrow text-ink-dim">
        {standalone ? "Standalone expansion of" : "DLC for"}{" "}
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
