import Image from "next/image";
import Link from "next/link";

import { QuickShelf } from "./quick-shelf";

export type ShelfCard = {
  entryId: string;
  versionId: string;
  workSlug: string;
  workTitle: string;
  versionName: string;
  versionAuthor: string | null;
  platformName: string | null;
  status: string;
  rating: number | null;
  coverUrl: string | null;
  isCommunityVersion: boolean;
  coverNeedsReview: boolean;
};

/** Stored 1..10 and shown 1..10: a ten-point scale with no halves in it. */
function ratingLabel(rating: number | null): string {
  return rating === null ? "Unrated" : `${rating} / 10`;
}

export function ShelfTile({
  card,
  index,
  selecting = false,
  checked = false,
  onToggle,
  quick = false,
  className = "",
  sizes = "160px",
}: {
  card: ShelfCard;
  index: number;
  /** In select mode the whole tile toggles instead of opening the version. */
  selecting?: boolean;
  checked?: boolean;
  onToggle?: (entryId: string) => void;
  /** On the main page a press opens the quick shelf panel; the game is a step further. */
  quick?: boolean;
  /** The wall sizes tiles by its columns; a strip gives them a fixed width. */
  className?: string;
  sizes?: string;
}) {
  // A romhack or port is the thing you played, so it leads and the game it is
  // built on is the qualifier. For an official release the work is the thing and
  // the version is the qualifier — same two lines, opposite order.
  const title = card.isCommunityVersion ? card.versionName : card.workTitle;

  // An official version is named after its platform ("N64"), which the platform
  // line then repeated in full ("Nintendo 64"). Prefer the full name and drop
  // the duplicate, falling back to the version name for an official release
  // that has no platform recorded — unless it only repeats the title, as a
  // romhack's own release does.
  const subtitle = card.isCommunityVersion
    ? card.workTitle
    : (card.platformName ?? (card.versionName === card.workTitle ? "" : card.versionName));

  // The band carries the author, and the overlay covers the band, so without
  // this it disappears exactly when you go looking for it.
  const detail = card.isCommunityVersion ? card.versionAuthor : null;

  return (
    <li
      className={`shelf-tile group relative ${className}`}
      style={{ "--tile-index": index } as React.CSSProperties}
    >
      <div
        className={`relative aspect-[3/4] bg-panel${
          checked ? " outline outline-3 outline-offset-2 outline-accent" : ""
        }`}
      >
        {/* The whole tile is the target in select mode. A checkbox small enough
            not to sit on the art would be too small to hit on a phone, and the
            tile is already the thing you are pointing at.

            Drawn rather than a real <input>: React resets a form's fields once its
            action resolves, which would wipe every tick while the selection state
            beside it still said otherwise. What is submitted comes from that state
            instead, so there is only one answer to what is selected. */}
        {selecting ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={title}
            onClick={() => onToggle?.(card.entryId)}
            className="absolute inset-0 z-30 flex items-start p-2"
          >
            <span
              className={`size-6 rounded-full border-2 ${checked ? "border-accent bg-accent" : "border-ink bg-ground/70"}`}
            />
          </button>
        ) : quick ? (
          <QuickShelf card={card} title={title} subtitle={subtitle} className="absolute inset-0 z-10">
            <span className="sr-only">{title}</span>
          </QuickShelf>
        ) : (
          <Link href={`/version/${card.versionId}`} className="absolute inset-0 z-10">
            <span className="sr-only">{title}</span>
          </Link>
        )}

        {card.coverUrl ? (
          <Image
            src={card.coverUrl}
            alt=""
            fill
            sizes={sizes}
            className="object-cover"
            // Covers sit behind the session-checked /covers route, which Next's
            // optimiser cannot fetch because it carries no cookie.
            unoptimized
          />
        ) : (
          // No art yet: the name, set like a box's spine label, so a shelf of
          // things nobody has art for still reads as a shelf.
          <div className="flex h-full flex-col justify-between gap-1 overflow-hidden p-2.5">
            <p className="line-clamp-5 font-display text-[15px] leading-tight break-words">{title}</p>
            <p className="line-clamp-2 shrink-0 font-narrow text-sm text-ink-dim">{subtitle}</p>
          </div>
        )}

        {/* A solid band across the lower part of the cover, reading as a
            cartridge label applied over the boxart. Official releases get
            nothing at all — the absence is the signal. */}
        {card.isCommunityVersion ? (
          <div className="absolute inset-x-0 bottom-0 bg-label px-2 py-1">
            <p className="truncate font-narrow text-sm font-bold text-accent-ink">{card.versionName}</p>
            {card.versionAuthor ? (
              <p className="truncate font-narrow text-xs text-accent-ink">{card.versionAuthor}</p>
            ) : null}
          </div>
        ) : null}

        {card.rating !== null ? (
          <span className="sticker" aria-label={`Rated ${card.rating} out of 10`}>
            {card.rating}
          </span>
        ) : null}

        {/* The name and shelf, on hover only, and only where hovering exists:
            on a phone the cover is a plain tap through to the game.

            There is no Delete here any more. It was invisible on a touch
            screen and still took the tap, so the lower corner of every cover
            opened a delete page. Deleting lives on the game's own page. */}
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end overflow-hidden bg-ground/92 p-2.5 opacity-0 transition-opacity [@media(hover:hover)]:group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
          {/* Clamped so a long name stays on the cover and clear of the sticker
              (it ran over its neighbours); the shelf line never shrinks away. */}
          <p className="line-clamp-3 min-h-0 pr-5 font-semibold leading-tight break-words">{title}</p>
          <p className="line-clamp-2 shrink-0 font-narrow text-sm break-words text-ink-dim">{subtitle}</p>
          {detail ? <p className="line-clamp-2 shrink-0 font-narrow text-sm break-words text-ink-dim">{detail}</p> : null}
          <p className="mt-1 shrink-0 font-narrow text-sm text-ink-dim">
            {card.status.charAt(0).toUpperCase() + card.status.slice(1)} · {ratingLabel(card.rating)}
          </p>
          {card.coverNeedsReview ? (
            <p className="shrink-0 font-narrow text-sm text-ink-dim">Cover needs review</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
