import { ShelfLink } from "./shelf-link";

/** Top of a game's page: back to the shelf, at the place you left it. */
export function BackToShelf() {
  return (
    <p className="mb-4">
      <ShelfLink
        restoreScroll
        className="inline-block border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim"
      >
        Back to shelf
      </ShelfLink>
    </p>
  );
}
