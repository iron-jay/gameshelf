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
      <label className="flex flex-col gap-1.5">
        <span className="font-narrow text-ink-dim">Series</span>
        <input
          name="series"
          type="text"
          list="series-names"
          maxLength={120}
          placeholder="The Legend of Zelda"
          defaultValue={current ?? ""}
          className="field w-64"
        />
      </label>
      <datalist id="series-names">
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <button type="submit" className="btn">
        Save
      </button>
      {current ? (
        <span className="font-narrow text-ink-dim">Empty the box and save to remove it.</span>
      ) : null}
    </form>
  );
}
