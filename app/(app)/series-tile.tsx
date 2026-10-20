import Image from "next/image";
import Link from "next/link";

import { seriesHref, type SeriesOnShelf } from "@/lib/series";

/**
 * One series on the overview: its first game's cover with the edges of more
 * standing behind it, and its name above. The name sits over the cover rather
 * than on it or under it: covers carry nothing but the rating sticker, and the
 * plank has to stay directly under the art.
 */
export function SeriesTile({ series, index }: { series: SeriesOnShelf; index: number }) {
  return (
    <li
      className="shelf-tile group relative w-[30vw] max-w-36 sm:w-36"
      style={{ "--tile-index": index } as React.CSSProperties}
    >
      <Link href={seriesHref(series.name)} className="block">
        <p className="line-clamp-2 font-display text-[15px] leading-tight break-words group-hover:underline">
          {series.name}
        </p>
        <p className="mb-2 font-narrow text-sm text-ink-dim">
          {series.played > 0 ? `${series.played} of ${series.games} played` : plural(series.games)}
        </p>
        <div className={`relative aspect-[3/4] bg-panel${series.games > 1 ? " series-stack" : ""}`}>
          {series.coverUrl ? (
            // Behind the session-checked /covers route, as on every other tile.
            <Image src={series.coverUrl} alt="" fill sizes="144px" className="object-cover" unoptimized />
          ) : (
            <p className="p-2.5 font-display text-[15px] leading-tight break-words">{series.name}</p>
          )}
        </div>
      </Link>
    </li>
  );
}

function plural(games: number): string {
  return `${games} ${games === 1 ? "game" : "games"}`;
}
