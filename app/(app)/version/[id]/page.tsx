import { and, asc, desc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  entries,
  OFFICIAL_VERSION_KINDS,
  platforms,
  plays,
  shelfEntries,
  shelves,
  versions,
  works,
} from "@/lib/db/schema";

import {
  deletePlay,
  markDone,
  saveReview,
  setRating,
  setStatus,
  shelveVersion,
  tagWithShelf,
  toggleFlag,
  untagShelf,
} from "./actions";
import { PlayForm } from "./play-form";

export const dynamic = "force-dynamic";

const STATUSES = ["backlog", "playing", "played", "dropped", "shelved", "wishlist"] as const;

const DONE_LEVELS = [
  { value: "credits", label: "Reached the end" },
  { value: "completed", label: "End and most of the optional content" },
  { value: "mastered", label: "100% / platinum" },
] as const;

const CHIP = "border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim";
const CHIP_ON = "border border-ink bg-panel px-3 py-1.5 font-narrow font-medium";

function isCommunity(kind: string): boolean {
  return !(OFFICIAL_VERSION_KINDS as readonly string[]).includes(kind);
}

/** 1..10 half-stars in the database, 0.5..5 on screen. */
function stars(rating: number): string {
  return (rating / 2).toFixed(rating % 2 === 0 ? 0 : 1);
}

export default async function VersionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [row] = await db
    .select({
      version: versions,
      workTitle: works.title,
      workSlug: works.slug,
      workCoverUrl: works.coverUrl,
      platformName: platforms.name,
    })
    .from(versions)
    .innerJoin(works, eq(works.id, versions.workId))
    .leftJoin(platforms, eq(platforms.id, versions.platformId))
    .where(eq(versions.id, id));

  if (!row) notFound();

  const { version } = row;

  const [baseVersion] = version.baseVersionId
    ? await db
        .select({ id: versions.id, name: versions.name })
        .from(versions)
        .where(eq(versions.id, version.baseVersionId))
    : [];

  const [entry] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, user.id), eq(entries.versionId, version.id)));

  const playRows = entry
    ? await db
        .select()
        .from(plays)
        .where(eq(plays.entryId, entry.id))
        .orderBy(desc(plays.finishedOn), asc(plays.createdAt))
    : [];

  const entryShelves = entry
    ? await db
        .select({ id: shelves.id, name: shelves.name })
        .from(shelfEntries)
        .innerJoin(shelves, eq(shelves.id, shelfEntries.shelfId))
        .where(eq(shelfEntries.entryId, entry.id))
        .orderBy(asc(shelves.name))
    : [];

  // Every shelf this user has, so the input can suggest existing names
  // rather than quietly creating near-duplicates.
  const allShelves = await db
    .select({ name: shelves.name })
    .from(shelves)
    .where(eq(shelves.userId, user.id))
    .orderBy(asc(shelves.name));

  // Section 4a again: a community release never borrows the work's boxart.
  const coverUrl = isCommunity(version.kind) ? version.coverUrl : (version.coverUrl ?? row.workCoverUrl);

  const hidden = <input type="hidden" name="versionId" value={version.id} />;

  return (
    <main className="flex-1 p-6">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${row.workSlug}`} className="underline">
          {row.workTitle}
        </Link>
      </p>

      <div className="flex flex-wrap gap-6">
        <div className="relative h-64 w-48 shrink-0 bg-panel">
          {coverUrl ? (
            <Image src={coverUrl} alt="" fill sizes="192px" className="object-cover" unoptimized />
          ) : null}
          {isCommunity(version.kind) ? (
            <div className="absolute inset-x-0 bottom-0 bg-label px-2 py-1.5">
              <p className="truncate font-narrow font-medium text-ground">{version.name}</p>
              {version.author ? (
                <p className="truncate font-narrow text-ground">{version.author}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-medium">
            {version.name}
            {version.versionLabel ? (
              <span className="ml-3 font-mono text-ink-dim">{version.versionLabel}</span>
            ) : null}
          </h1>

          <p className="mt-1 font-narrow text-ink-dim">
            {[
              version.kind.replace(/_/g, " "),
              row.platformName,
              version.author,
              version.releaseDate?.slice(0, 4),
              baseVersion ? `patches ${baseVersion.name}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {version.notes ? <p className="mt-4">{version.notes}</p> : null}

          <p className="mt-4 font-narrow">
            {version.url ? (
              <a
                href={version.url}
                rel="noreferrer noopener"
                target="_blank"
                className="text-ink-dim underline hover:text-ink"
              >
                Release page
              </a>
            ) : null}
            {version.url ? " · " : null}
            <Link
              href={`/work/${row.workSlug}/art?version=${version.id}`}
              className="text-ink-dim underline hover:text-ink"
            >
              {version.coverNeedsReview ? "Review art" : "Change art"}
            </Link>
          </p>
        </div>
      </div>

      {!entry ? (
        <form action={shelveVersion} className="mt-8">
          {hidden}
          <p className="mb-2 font-narrow text-ink-dim">This is not on your shelf yet.</p>
          <button type="submit" className={CHIP}>
            Add to shelf
          </button>
        </form>
      ) : null}

      <section className="mt-8 flex flex-col gap-6">
        <div>
          <h2 className="mb-2 font-medium">Status</h2>
          <form action={setStatus} className="flex flex-wrap gap-2">
            {hidden}
            {STATUSES.map((value) => (
              <button
                key={value}
                type="submit"
                name="status"
                value={value}
                className={entry?.status === value ? CHIP_ON : CHIP}
              >
                {value}
              </button>
            ))}
          </form>
        </div>

        <div>
          <h2 className="mb-1 font-medium">Finished it</h2>
          <p className="mb-2 font-narrow text-ink-dim">
            {entry?.completion
              ? `Recorded as ${entry.completion}.`
              : "Reaching the end is the usual answer; the other two are here if they apply."}
          </p>
          <form action={markDone} className="flex flex-wrap gap-2">
            {hidden}
            {DONE_LEVELS.map((level) => (
              <button
                key={level.value}
                type="submit"
                name="completion"
                value={level.value}
                title={level.label}
                className={entry?.completion === level.value ? CHIP_ON : CHIP}
              >
                {level.value}
              </button>
            ))}
          </form>
        </div>

        <div>
          <h2 className="mb-2 font-medium">
            Rating
            {entry?.rating ? (
              <span className="ml-3 font-narrow text-ink-dim">{stars(entry.rating)} / 5</span>
            ) : null}
          </h2>
          <form action={setRating} className="flex flex-wrap gap-1">
            {hidden}
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
              <button
                key={value}
                type="submit"
                name="rating"
                value={value}
                className={`${entry?.rating === value ? CHIP_ON : CHIP} font-mono`}
              >
                {stars(value)}
              </button>
            ))}
            {entry?.rating ? (
              <button type="submit" name="rating" value="0" className={`${CHIP} ml-2`}>
                clear
              </button>
            ) : null}
          </form>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={toggleFlag}>
            {hidden}
            <input type="hidden" name="flag" value="favourite" />
            <input type="hidden" name="next" value={entry?.isFavourite ? "false" : "true"} />
            <button type="submit" className={entry?.isFavourite ? CHIP_ON : CHIP}>
              {entry?.isFavourite ? "Favourite" : "Mark favourite"}
            </button>
          </form>

          <form action={toggleFlag}>
            {hidden}
            <input type="hidden" name="flag" value="private" />
            <input type="hidden" name="next" value={entry?.isPrivate ? "false" : "true"} />
            <button type="submit" className={entry?.isPrivate ? CHIP_ON : CHIP}>
              {entry?.isPrivate ? "Private" : "Mark private"}
            </button>
          </form>
        </div>

        <div>
          <h2 className="mb-2 font-medium">Shelves</h2>
          <div className="flex flex-wrap items-center gap-2">
            {entryShelves.map((shelf) => (
              <form key={shelf.id} action={untagShelf}>
                {hidden}
                <input type="hidden" name="shelfId" value={shelf.id} />
                <button type="submit" title={`Remove from ${shelf.name}`} className={CHIP_ON}>
                  {shelf.name} ×
                </button>
              </form>
            ))}

            <form action={tagWithShelf} className="flex gap-2">
              {hidden}
              <input
                name="shelfName"
                list="shelf-names"
                placeholder="Add to a shelf"
                maxLength={60}
                className="border border-line bg-ground px-3 py-1.5 font-narrow text-ink outline-none focus:border-ink-dim"
              />
              <datalist id="shelf-names">
                {allShelves.map((shelf) => (
                  <option key={shelf.name} value={shelf.name} />
                ))}
              </datalist>
              <button type="submit" className={CHIP}>
                Add
              </button>
            </form>
          </div>
        </div>

        <div>
          <h2 className="mb-2 font-medium">Review</h2>
          <form action={saveReview} className="flex max-w-2xl flex-col gap-3">
            {hidden}
            <textarea
              name="review"
              rows={6}
              defaultValue={entry?.review ?? ""}
              className="w-full border border-line bg-ground px-3 py-2 text-ink outline-none focus:border-ink-dim"
            />
            <label className="flex items-center gap-2 font-narrow text-ink-dim">
              <input type="checkbox" name="spoilers" defaultChecked={entry?.reviewHasSpoilers} />
              This review has spoilers
            </label>
            <button type="submit" className={`${CHIP} self-start`}>
              Save review
            </button>
          </form>
        </div>

        <div>
          <h2 className="font-medium">Plays</h2>
          <p className="font-narrow text-ink-dim">
            One run through each. A replay is a new play, not an edit to an old one.
          </p>

          {playRows.length > 0 ? (
            <ul className="mt-3 flex max-w-2xl flex-col">
              {playRows.map((play) => (
                <li key={play.id} className="flex items-center gap-4 border-b border-line py-2">
                  <span className="font-narrow">
                    {[
                      play.startedOn,
                      play.finishedOn && play.finishedOn !== play.startedOn
                        ? `→ ${play.finishedOn}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" ") || "No dates"}
                  </span>
                  {play.hours ? <span className="font-mono text-ink-dim">{play.hours}h</span> : null}
                  {play.completion ? (
                    <span className="font-narrow text-ink-dim">{play.completion}</span>
                  ) : null}
                  {play.note ? <span className="truncate font-narrow">{play.note}</span> : null}

                  <form action={deletePlay} className="ml-auto">
                    {hidden}
                    <input type="hidden" name="playId" value={play.id} />
                    <button
                      type="submit"
                      className="font-narrow text-ink-dim underline hover:text-ink"
                    >
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}

          <PlayForm versionId={version.id} />
        </div>
      </section>
    </main>
  );
}
