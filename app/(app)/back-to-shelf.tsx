import { ShelfLink } from "./shelf-link";

/** Top of a game's page: back to the shelf, at the place you left it. */
export function BackToShelf() {
  return (
    <p className="mb-3">
      <ShelfLink
        restoreScroll
        className="inline-flex min-h-11 items-center font-narrow text-ink-dim underline underline-offset-4 hover:text-ink"
      >
        Back to shelf
      </ShelfLink>
    </p>
  );
}
