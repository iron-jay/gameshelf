import { asc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { platforms, versions, works } from "@/lib/db/schema";
import { OFFICIAL_VERSION_KINDS } from "@/lib/db/schema";
import { canHaveDlc, dlcOf, parentIgdbIdOf } from "@/lib/dlc";
import { fillDlcOnce } from "@/lib/dlc-fill";
import { seriesHref, seriesInUse } from "@/lib/series";

import { BackToShelf } from "../../back-to-shelf";
import { DlcOf, DlcSection } from "../../dlc-section";
import { SeriesForm } from "../../series-form";

export const dynamic = "force-dynamic";

function isCommunity(kind: string): boolean {
  return !(OFFICIAL_VERSION_KINDS as readonly string[]).includes(kind);
}

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;

  const [work] = await db.select().from(works).where(eq(works.slug, slug));
  if (!work) notFound();

  const versionRows = await db
    .select({
      id: versions.id,
      name: versions.name,
      kind: versions.kind,
      author: versions.author,
      versionLabel: versions.versionLabel,
      releaseDate: versions.releaseDate,
      url: versions.url,
      coverUrl: versions.coverUrl,
      coverNeedsReview: versions.coverNeedsReview,
      platformName: platforms.name,
    })
    .from(versions)
    .leftJoin(platforms, eq(platforms.id, versions.platformId))
    .where(eq(versions.workId, work.id))
    .orderBy(asc(versions.createdAt));

  // Child works sit beneath the version list, never mixed into it: an expansion
  // is not a version, it is a work of its own with its own rating and review.
  if (canHaveDlc(work.workKind)) await fillDlcOnce(user.id, work.id);
  const dlc = canHaveDlc(work.workKind) ? await dlcOf(user.id, work.id) : null;
  const [parent] = work.parentWorkId
    ? await db.select({ slug: works.slug, title: works.title }).from(works).where(eq(works.id, work.parentWorkId))
    : [];

  const allSeries = await seriesInUse();

  return (
    <main className="flex-1 pb-14">
      <section className="bg-band px-4 pt-2 sm:px-10">
        <BackToShelf />
        <div className="flex items-end gap-4 sm:gap-8">
          <div className="relative aspect-[3/4] w-32 shrink-0 bg-panel sm:w-52">
            {work.coverUrl ? (
              <Image src={work.coverUrl} alt="" fill sizes="208px" className="object-cover" unoptimized />
            ) : (
              <p className="p-3 font-display text-lg">{work.title}</p>
            )}
          </div>
          <div className="min-w-0 pb-4">
            <DlcOf
              parent={parent ?? null}
              parentIgdbId={parentIgdbIdOf(work.workKind, work.igdbPayload)}
              slug={work.slug}
            />
            <h1 className="font-display text-[26px] break-words sm:text-5xl">{work.title}</h1>
            <p className="mt-2 font-narrow text-ink-dim">
              {[
                work.workKind.replace(/_/g, " "),
                work.firstReleaseDate?.slice(0, 4),
                work.source === "local" ? "local" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              {work.series ? (
                <>
                  {" · "}
                  <Link href={seriesHref(work.series)} className="underline underline-offset-4 hover:text-ink">
                    {work.series}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </section>
      <div className="plank" />

      <div className="flex max-w-3xl flex-col gap-8 px-4 pt-6 sm:px-10">
        {work.summary ? <p className="leading-relaxed">{work.summary}</p> : null}

        <section>
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-xl">Ways to play</h2>
            <span className="text-ink-dim">{versionRows.length}</span>
            <div className="flex-1" />
            <Link href={`/work/${work.slug}/add-version`} className="btn btn-sm">
              Add version
            </Link>
          </div>

          {/* A community version never borrows the work's boxart (§4a). */}
          <ul className="shelf-strip">
            {versionRows.map((version) => {
              const community = isCommunity(version.kind);
              const art = community ? version.coverUrl : (version.coverUrl ?? work.coverUrl);
              return (
                <li key={version.id} className="w-32">
                  <Link href={`/version/${version.id}`} className="relative block aspect-[3/4] bg-panel">
                    <span className="sr-only">{version.name}</span>
                    {art ? (
                      <Image src={art} alt="" fill sizes="128px" className="object-cover" unoptimized />
                    ) : (
                      <span className="block p-2 font-display text-sm">{version.name}</span>
                    )}
                    {community ? (
                      <span className="absolute inset-x-0 bottom-0 truncate bg-label px-1.5 py-1 font-narrow text-xs font-bold text-accent-ink">
                        {version.author ?? version.name}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="plank" />

          <ul className="mt-4 flex flex-col">
            {versionRows.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <Link href={`/version/${version.id}`} className="font-semibold hover:underline">
                      {version.name}
                    </Link>
                    {version.versionLabel ? (
                      <span className="ml-2 font-mono text-sm text-ink-dim">{version.versionLabel}</span>
                    ) : null}
                  </p>
                  <p className="font-narrow text-ink-dim">
                    {[
                      version.kind.replace(/_/g, " "),
                      version.platformName,
                      version.author,
                      version.releaseDate?.slice(0, 4),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Link
                  href={`/work/${work.slug}/art?version=${version.id}`}
                  className="shrink-0 font-narrow text-ink-dim underline underline-offset-4 hover:text-ink"
                >
                  {version.coverNeedsReview ? "Review art" : "Change art"}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {dlc ? <DlcSection game={work} items={dlc} /> : null}

        <SeriesForm workSlug={work.slug} current={work.series} names={allSeries} />

        <p className="flex flex-wrap gap-x-5 gap-y-2 font-narrow">
          <Link href={`/work/${work.slug}/art`} className="text-ink-dim underline underline-offset-4 hover:text-ink">
            Change art
          </Link>
          <Link
            href={`/work/${work.slug}/delete`}
            className="text-ink-dim underline underline-offset-4 hover:text-danger"
          >
            Delete
          </Link>
        </p>
      </div>
    </main>
  );
}
