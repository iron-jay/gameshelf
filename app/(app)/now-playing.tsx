import Image from "next/image";
import Link from "next/link";

import { markDone, setStatus } from "./version/[id]/actions";
import { FinishPrompt } from "./finish-prompt";
import { type ShelfCard } from "./shelf-tile";

/**
 * The band across the top of the shelves: what is on the go, large, with the
 * two things you do to a game you are playing one press away. Finishing is
 * "reached the end" — the other levels are on the game's page, as before —
 * and asks for a rating on the way.
 */
export function NowPlaying({ cards }: { cards: ShelfCard[] }) {
  return (
    <section className="bg-band px-4 pt-6 pb-7 sm:px-10">
      <div className="mb-5 flex items-baseline gap-3">
        <h1 className="font-display text-3xl sm:text-4xl">Now playing</h1>
        <span className="text-ink-dim">
          {cards.length === 0 ? "Nothing on the go" : `${cards.length} ${cards.length === 1 ? "game" : "games"}`}
        </span>
      </div>

      {cards.length === 0 ? (
        <p className="font-narrow text-ink-dim">
          Put a game on the playing shelf and it waits for you here.
        </p>
      ) : (
        <ul className="grid gap-4 sm:gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {cards.map((card) => {
            const title = card.isCommunityVersion ? card.versionName : card.workTitle;
            const subtitle = card.isCommunityVersion
              ? [card.platformName, card.workTitle].filter(Boolean).join(" · ")
              : (card.platformName ?? card.versionName);

            return (
              <li key={card.entryId} className="flex gap-4">
                <Link
                  href={`/version/${card.versionId}`}
                  className="relative aspect-[3/4] w-20 shrink-0 bg-panel sm:w-32"
                >
                  <span className="sr-only">{title}</span>
                  {card.coverUrl ? (
                    <Image src={card.coverUrl} alt="" fill sizes="128px" className="object-cover" unoptimized />
                  ) : (
                    <span className="block p-2 font-display text-sm">{title}</span>
                  )}
                  {card.isCommunityVersion ? (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-label px-1.5 py-1 font-narrow text-xs font-bold text-accent-ink">
                      {card.versionAuthor ?? card.versionName}
                    </span>
                  ) : null}
                </Link>

                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={`/version/${card.versionId}`} className="text-lg leading-tight font-bold [font-stretch:110%] hover:underline">
                    {title}
                  </Link>
                  <span className="font-narrow text-ink-dim">{subtitle}</span>
                  <div className="flex-1" />
                  <div className="flex flex-wrap gap-2">
                    <FinishPrompt
                      action={markDone}
                      fields={{ versionId: card.versionId, completion: "credits" }}
                      title={title}
                      rating={card.rating}
                    />
                    <form action={setStatus}>
                      <input type="hidden" name="versionId" value={card.versionId} />
                      <button type="submit" name="status" value="dropped" className="btn btn-sm">
                        Drop
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
