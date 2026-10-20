import { and, asc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  entries,
  isCommunityVersionKind,
  platforms,
  shelfEntries,
  shelves,
  versions,
  works,
} from "@/lib/db/schema";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/status";
import { canHaveDlc, dlcOf, parentIgdbIdOf } from "@/lib/dlc";
import { fillDlcOnce } from "@/lib/dlc-fill";
import { basedOnOf } from "@/lib/romhacks";
import { seriesHref, seriesInUse } from "@/lib/series";
import { isUuid } from "@/lib/uuid";

import {
  markDone,
  saveReview,
  setRating,
  setStatus,
  shelveVersion,
  tagWithShelf,
  toggleFlag,
  untagShelf,
} from "./actions";
import { BackToShelf } from "../../back-to-shelf";
import { DlcOf, DlcSection } from "../../dlc-section";
import { SeriesForm } from "../../series-form";

export const dynamic = "force-dynamic";

const DONE_LEVELS = [
  { value: "credits", label: "Reached the end" },
  { value: "completed", label: "End and most of the optional content" },
  { value: "mastered", label: "100% / platinum" },
] as const;

const CHIP = "btn btn-sm";

const isCommunity = isCommunityVersionKind;

export default async function VersionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  // Anything can be typed into a URL, and Postgres answers a malformed uuid
  // with an error rather than an empty row.
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({
      version: versions,
      workTitle: works.title,
      workSlug: works.slug,
      workCoverUrl: works.coverUrl,
      series: works.series,
      workKind: works.workKind,
      dlcOnShelf: works.dlcOnShelf,
      parentWorkId: works.parentWorkId,
      igdbPayload: works.igdbPayload,
      basedOnWorkId: works.basedOnWorkId,
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

  // Every way this game exists here, so the hack and the original are one tap
  // apart — the page is about this version, but the shelf is about the game.
  const siblings = await db
    .select({
      id: versions.id,
      name: versions.name,
      kind: versions.kind,
      coverUrl: versions.coverUrl,
      releaseDate: versions.releaseDate,
      platformName: platforms.name,
    })
    .from(versions)
    .leftJoin(platforms, eq(platforms.id, versions.platformId))
    .where(eq(versions.workId, version.workId))
    .orderBy(asc(versions.createdAt));

  // The game's DLC, where a tap on the game's cover lands; and on a DLC, its game.
  // A romhack is a game of its own (2026-10-20): it has no DLC, and its
  // original is a link away.
  const romhack = version.kind === "romhack";
  const basedOn = romhack ? await basedOnOf(row.basedOnWorkId) : null;
  const listsDlc = canHaveDlc(row.workKind) && !isCommunity(version.kind) && !romhack;
  if (listsDlc) await fillDlcOnce(user.id, version.workId);
  const dlc = listsDlc ? await dlcOf(user.id, version.workId) : null;
  const [parent] = row.parentWorkId
    ? await db.select({ slug: works.slug, title: works.title }).from(works).where(eq(works.id, row.parentWorkId))
    : [];

  const hidden = <input type="hidden" name="versionId" value={version.id} />;

  const community = isCommunity(version.kind);

  return (
    <main className="flex-1 pb-14">
      <section className="bg-band px-4 pt-2 sm:px-10">
        <BackToShelf />

        <div className="flex items-end gap-4 sm:gap-8">
          {/* The whole cover, standing on the plank below — never cropped
              into a banner. */}
          <div className="relative aspect-[3/4] w-32 shrink-0 bg-panel sm:w-52">
            {coverUrl ? (
              <Image src={coverUrl} alt="" fill sizes="208px" className="object-cover" unoptimized />
            ) : (
              <p className="p-3 font-display text-lg">{version.name}</p>
            )}
            {community ? (
              <div className="absolute inset-x-0 bottom-0 bg-label px-2 py-1.5">
                <p className="truncate font-narrow text-sm font-bold text-accent-ink">{version.name}</p>
                {version.author ? (
                  <p className="truncate font-narrow text-xs text-accent-ink">{version.author}</p>
                ) : null}
              </div>
            ) : null}
            {entry?.rating ? <span className="sticker">{entry.rating}</span> : null}
          </div>

          <div className="min-w-0 pb-4">
            <DlcOf
              parent={parent ?? null}
              parentIgdbId={parentIgdbIdOf(row.workKind, row.igdbPayload)}
              slug={row.workSlug}
            />
            {basedOn ? (
              <p className="mb-1 font-narrow text-ink-dim">
                Romhack of{" "}
                <Link href={`/work/${basedOn.slug}`} className="underline underline-offset-4 hover:text-ink">
                  {basedOn.title}
                </Link>
              </p>
            ) : null}
            {community ? (
              <p className="mb-1 font-narrow text-sm font-bold text-accent">Community release</p>
            ) : null}
            {community ? (
              <p className="mb-1 font-narrow text-ink-dim">
                <Link href={`/work/${row.workSlug}`} className="underline underline-offset-4 hover:text-ink">
                  {row.workTitle}
                </Link>
              </p>
            ) : null}
            <h1 className="font-display text-[26px] break-words sm:text-5xl">
              {community ? version.name : row.workTitle}
              {version.versionLabel ? (
                <span className="ml-3 align-middle font-mono text-base font-normal tracking-normal text-ink-dim">
                  {version.versionLabel}
                </span>
              ) : null}
            </h1>
            <p className="mt-2 font-narrow text-ink-dim">
              {[
                community ? version.kind.replace(/_/g, " ") : null,
                row.platformName ?? (community || romhack ? null : version.name),
                version.author,
                version.releaseDate?.slice(0, 4),
                baseVersion ? `patches ${baseVersion.name}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              {row.series ? (
                <>
                  {" · "}
                  <Link href={seriesHref(row.series)} className="underline underline-offset-4 hover:text-ink">
                    {row.series}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </section>
      <div className="plank" />

      <div className="flex max-w-3xl flex-col gap-8 px-4 pt-6 sm:px-10">
        {!entry ? (
          <form action={shelveVersion}>
            {hidden}
            <p className="mb-2 font-narrow text-ink-dim">This is not on your shelf yet.</p>
            <button type="submit" className="btn btn-primary">
              Add to shelf
            </button>
          </form>
        ) : null}

        <form action={setStatus} aria-label="Shelf" className="-mx-4 overflow-x-auto px-4 text-[14px] sm:mx-0 sm:px-0 sm:text-base">
          {hidden}
          <div className="segmented">
            {STATUS_ORDER.map((value) => (
              <button
                key={value}
                type="submit"
                name="status"
                value={value}
                aria-pressed={entry?.status === value}
              >
                {STATUS_LABELS[value]}
              </button>
            ))}
          </div>
        </form>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl">Rating</h2>
            <span className="font-mono text-sm text-accent">
              {entry?.rating ? `${entry.rating} / 10` : "Unrated"}
            </span>
          </div>
          {/* Ten bars climbing left to right, filled up to the rating: the
              scale is visible at a glance and each bar is a thumb-sized press. */}
          <form action={setRating} className="flex items-end gap-1">
            {hidden}
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
              <button
                key={value}
                type="submit"
                name="rating"
                value={value}
                aria-label={`Rate ${value} out of 10`}
                aria-pressed={entry?.rating === value}
                title={`${value} / 10`}
                className={`flex-1 hover:brightness-125 ${
                  entry?.rating && value <= entry.rating ? "bg-accent" : "bg-line"
                }`}
                style={{ height: `${18 + value * 4}px` }}
              />
            ))}
          </form>
          {entry?.rating ? (
            <form action={setRating} className="mt-2">
              {hidden}
              <button
                type="submit"
                name="rating"
                value="0"
                className="font-narrow text-sm text-ink-dim underline underline-offset-4 hover:text-ink"
              >
                Clear the rating
              </button>
            </form>
          ) : null}
        </div>

        <div>
          <h2 className="mb-1 font-display text-xl">Finished it</h2>
          <p className="mb-3 font-narrow text-ink-dim">
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
                aria-pressed={entry?.completion === level.value}
                className={CHIP}
              >
                {level.label}
              </button>
            ))}
          </form>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={toggleFlag}>
            {hidden}
            <input type="hidden" name="flag" value="favourite" />
            <input type="hidden" name="next" value={entry?.isFavourite ? "false" : "true"} />
            <button type="submit" aria-pressed={Boolean(entry?.isFavourite)} className={CHIP}>
              {entry?.isFavourite ? "Favourite" : "Mark favourite"}
            </button>
          </form>

          <form action={toggleFlag}>
            {hidden}
            <input type="hidden" name="flag" value="private" />
            <input type="hidden" name="next" value={entry?.isPrivate ? "false" : "true"} />
            <button type="submit" aria-pressed={Boolean(entry?.isPrivate)} className={CHIP}>
              {entry?.isPrivate ? "Private" : "Mark private"}
            </button>
          </form>
        </div>

        <div>
          <h2 className="mb-2 font-display text-xl">Tags</h2>
          <div className="flex flex-wrap items-center gap-2">
            {entryShelves.map((shelf) => (
              <form key={shelf.id} action={untagShelf}>
                {hidden}
                <input type="hidden" name="shelfId" value={shelf.id} />
                <button type="submit" title={`Remove the ${shelf.name} tag`} aria-pressed className={CHIP}>
                  {shelf.name} ×
                </button>
              </form>
            ))}

            <form action={tagWithShelf} className="flex gap-2">
              {hidden}
              <input
                name="shelfName"
                list="shelf-names"
                placeholder="Add a tag"
                maxLength={60}
                className="field w-44 rounded-full px-4 font-narrow"
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
          <h2 className="mb-2 font-display text-xl">Review</h2>
          <form action={saveReview} className="flex flex-col gap-3">
            {hidden}
            <textarea
              name="review"
              rows={6}
              defaultValue={entry?.review ?? ""}
              placeholder="What did you make of it?"
              className="field leading-relaxed"
            />
            <label className="flex items-center gap-2 font-narrow text-ink-dim">
              <input type="checkbox" name="spoilers" defaultChecked={entry?.reviewHasSpoilers} />
              This review has spoilers
            </label>
            <button type="submit" className="btn self-start">
              Save review
            </button>
          </form>
        </div>

        {version.notes ? (
          <div>
            <h2 className="mb-2 font-display text-xl">About this version</h2>
            <p className="leading-relaxed">{version.notes}</p>
          </div>
        ) : null}

        {siblings.length > 1 ? (
          <div>
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-xl">Ways to play</h2>
              <span className="text-ink-dim">{siblings.length}</span>
            </div>
            <ul className="shelf-strip">
              {siblings.map((sibling) => {
                const art = isCommunity(sibling.kind) ? sibling.coverUrl : (sibling.coverUrl ?? row.workCoverUrl);
                return (
                  <li key={sibling.id} className="w-28">
                    <Link
                      href={`/version/${sibling.id}`}
                      aria-current={sibling.id === version.id ? "page" : undefined}
                      className="relative block aspect-[3/4] bg-panel aria-[current=page]:outline-2 aria-[current=page]:outline-offset-2 aria-[current=page]:outline-accent"
                    >
                      {art ? (
                        <Image src={art} alt="" fill sizes="112px" className="object-cover" unoptimized />
                      ) : null}
                      {isCommunity(sibling.kind) ? (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-label px-1.5 py-1 font-narrow text-xs font-bold text-accent-ink">
                          {sibling.name}
                        </span>
                      ) : null}
                    </Link>
                    <p className="mt-1 truncate font-narrow text-sm">{sibling.name}</p>
                    <p className="truncate font-narrow text-xs text-ink-dim">
                      {[sibling.platformName, sibling.releaseDate?.slice(0, 4)].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
            <div className="plank" />
          </div>
        ) : null}

        {dlc ? (
          <DlcSection
            game={{ id: version.workId, slug: row.workSlug, title: row.workTitle, dlcOnShelf: row.dlcOnShelf }}
            items={dlc}
          />
        ) : null}

        <SeriesForm workSlug={row.workSlug} current={row.series} names={await seriesInUse()} />

        <p className="flex flex-wrap gap-x-5 gap-y-2 font-narrow">
          <Link href={`/work/${row.workSlug}`} className="text-ink-dim underline underline-offset-4 hover:text-ink">
            Game page
          </Link>
          {version.url ? (
            <a
              href={version.url}
              rel="noreferrer noopener"
              target="_blank"
              className="text-ink-dim underline underline-offset-4 hover:text-ink"
            >
              Release page
            </a>
          ) : null}
          <Link
            href={`/work/${row.workSlug}/art?version=${version.id}`}
            className="text-ink-dim underline underline-offset-4 hover:text-ink"
          >
            {version.coverNeedsReview ? "Review art" : "Change art"}
          </Link>
          <Link
            href={`/version/${version.id}/edit`}
            className="text-ink-dim underline underline-offset-4 hover:text-ink"
          >
            Edit details
          </Link>
          <Link
            href={`/work/${row.workSlug}/edit`}
            className="text-ink-dim underline underline-offset-4 hover:text-ink"
          >
            Edit game details
          </Link>
          {/* Deleting lives here rather than on the shelf's covers, behind its
              own confirmation page. */}
          <Link
            href={`/version/${version.id}/delete`}
            className="text-ink-dim underline underline-offset-4 hover:text-danger"
          >
            Delete
          </Link>
        </p>
      </div>
    </main>
  );
}
