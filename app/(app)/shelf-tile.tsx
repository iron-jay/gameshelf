import Image from "next/image";
import Link from "next/link";

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
}: {
  card: ShelfCard;
  index: number;
  /** In select mode the whole tile toggles instead of opening the version. */
  selecting?: boolean;
  checked?: boolean;
  onToggle?: (entryId: string) => void;
}) {
  // A romhack or port is the thing you played, so it leads and the game it is
  // built on is the qualifier. For an official release the work is the thing and
  // the version is the qualifier — same two lines, opposite order.
  const title = card.isCommunityVersion ? card.versionName : card.workTitle;

  // An official version is named after its platform ("N64"), which the platform
  // line then repeated in full ("Nintendo 64"). Prefer the full name and drop
  // the duplicate, falling back to the version name for an official release
  // that has no platform recorded.
  const subtitle = card.isCommunityVersion
    ? card.workTitle
    : (card.platformName ?? card.versionName);

  // The band carries the author, and the overlay covers the band, so without
  // this it disappears exactly when you go looking for it.
  const detail = card.isCommunityVersion ? card.versionAuthor : null;

  return (
    <li
      className={`shelf-tile group relative aspect-[3/4] bg-panel${
        checked ? " outline outline-2 -outline-offset-2 outline-ink" : ""
      }`}
      style={{ "--tile-index": index } as React.CSSProperties}
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
          className="absolute inset-0 z-10 flex items-start p-2"
        >
          <span
            className={`size-5 border ${checked ? "border-ink bg-ink" : "border-ink bg-ground/80"}`}
          />
        </button>
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
          sizes="160px"
          className="object-cover"
          // Covers sit behind the session-checked /covers route, which Next's
          // optimiser cannot fetch because it carries no cookie.
          unoptimized
        />
      ) : (
        <p className="p-2 font-narrow text-ink-dim">{title}</p>
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
      {/* z-20 so it sits above the tile's own link, and pointer-events-none so
          it does not swallow the clicks meant for it — only the controls inside
          take them back. Without the z-index the fade would decide: an opacity
          between 0 and 1 makes a stacking context, so a click landing mid-fade
          would go to the link underneath instead. */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end bg-ground/92 p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
        <p className="font-medium">{title}</p>
        <p className="font-narrow text-ink-dim">{subtitle}</p>
        {detail ? <p className="font-narrow text-ink-dim">{detail}</p> : null}
        <p className="mt-1 font-narrow text-ink-dim">
          {card.status} · {ratingLabel(card.rating)}
        </p>
        {card.coverNeedsReview ? (
          <p className="font-narrow text-ink-dim">Cover needs review</p>
        ) : null}

        {/* It goes to the confirmation page rather than deleting on the spot:
            this is a grid of covers, and a one-click delete on a wall of art is
            one mis-tap away from losing something. */}
        {selecting ? null : (
          <Link
            href={`/version/${card.versionId}/delete`}
            className="pointer-events-auto mt-2 self-start border border-line px-2 py-1 font-narrow text-ink-dim hover:border-danger hover:bg-danger hover:text-ink"
          >
            Delete
          </Link>
        )}
      </div>
    </li>
  );
}
