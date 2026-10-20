import { SeriesInput } from "./series-input";
import { setSeries } from "./work/[slug]/series-actions";

/**
 * A game's series, set inline. On the game page and on each version's page,
 * since tapping a cover lands on the version and the game page is a link
 * away at the bottom of it, which is too far to go looking for one field.
 */
export function SeriesForm({
  workSlug,
  current,
  names,
}: {
  workSlug: string;
  current: string | null;
  names: string[];
}) {
  return (
    <form action={setSeries} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="slug" value={workSlug} />
      <SeriesInput names={names} defaultValue={current ?? ""} />
      {/* Level with the box, not with the hint line under it. */}
      <button type="submit" className="btn mb-7">
        Save
      </button>
      {current ? (
        <span className="mb-9 font-narrow text-ink-dim">Empty the box and save to remove it.</span>
      ) : null}
    </form>
  );
}
