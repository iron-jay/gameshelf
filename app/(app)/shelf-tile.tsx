import Image from "next/image";
import Link from "next/link";

export type ShelfCard = {
  entryId: string;
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

/** 1..10 half-stars in the database, 0.5..5 on screen. */
function ratingLabel(rating: number | null): string {
  return rating === null ? "Unrated" : `${rating / 2} / 5`;
}

export function ShelfTile({ card, index }: { card: ShelfCard; index: number }) {
  return (
    <li
      className="shelf-tile group relative aspect-[3/4] bg-panel"
      style={{ "--tile-index": index } as React.CSSProperties}
    >
      <Link href={`/work/${card.workSlug}`} className="absolute inset-0 z-10">
        <span className="sr-only">{card.workTitle}</span>
      </Link>
      {card.coverUrl ? (
        <Image
          src={card.coverUrl}
          alt=""
          fill
          sizes="160px"
          className="object-cover"
          // Covers sit behind the session-checked /covers route, which Next's
          // optimiser cannot fetch because it carries no cookie.
          unoptimized
        />
      ) : (
        <p className="p-2 font-narrow text-ink-dim">{card.workTitle}</p>
      )}

      {/* The one bold element in the app. A solid band across the lower part of
          the cover, reading as a cartridge label applied over the boxart.
          Official releases get nothing at all — the absence is the signal. */}
      {card.isCommunityVersion ? (
        <div className="absolute inset-x-0 bottom-0 bg-label px-2 py-1.5">
          <p className="truncate font-narrow font-medium text-ground">{card.versionName}</p>
          {card.versionAuthor ? (
            <p className="truncate font-narrow text-ground">{card.versionAuthor}</p>
          ) : null}
        </div>
      ) : null}

      {/* Metadata appears on selection rather than permanently under every
          cover, so the grid stays a wall of art. */}
      <div className="absolute inset-0 flex flex-col justify-end bg-ground/92 p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
        <p className="font-medium">{card.workTitle}</p>
        <p className="font-narrow text-ink-dim">{card.versionName}</p>
        {card.platformName ? (
          <p className="font-narrow text-ink-dim">{card.platformName}</p>
        ) : null}
        <p className="mt-1 font-narrow text-ink-dim">
          {card.status} · {ratingLabel(card.rating)}
        </p>
        {card.coverNeedsReview ? (
          <p className="font-narrow text-ink-dim">Cover needs review</p>
        ) : null}
      </div>
    </li>
  );
}
