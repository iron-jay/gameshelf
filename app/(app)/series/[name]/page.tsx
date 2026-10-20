import { and, asc, eq, inArray, sql } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { entries, platforms, versions, works } from "@/lib/db/schema";
import { STATUS_LABELS } from "@/lib/status";

import { BackToShelf } from "../../back-to-shelf";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/**
 * A series in the order it came out, with your shelf state beside each game —
 * bookshelf's series page, with release order standing in for a numbered
 * position (a game has none). That is the whole feature: no completion bar.
 */
export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  return { title: decodeURIComponent((await params).name) };
}

export default async function SeriesPage({ params }: { params: Promise<{ name: string }> }) {
  const user = await requireUser();
  const name = decodeURIComponent((await params).name);

  // Games you have not shelved are listed too: a series page that only showed
  // what you own would say nothing the shelf does not.
  const members = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      workKind: works.workKind,
      firstReleaseDate: works.firstReleaseDate,
      coverUrl: works.coverUrl,
    })
    .from(works)
    .where(eq(works.series, name))
    .orderBy(sql`${works.firstReleaseDate} asc nulls last`, asc(works.title));

  if (members.length === 0) notFound();

  const mine = await db
    .select({
      workId: versions.workId,
      versionId: versions.id,
      versionName: versions.name,
      platformName: platforms.name,
      status: entries.status,
      rating: entries.rating,
    })
    .from(entries)
    .innerJoin(versions, eq(versions.id, entries.versionId))
    .leftJoin(platforms, eq(platforms.id, versions.platformId))
    .where(
      and(
        eq(entries.userId, user.id),
        inArray(
          versions.workId,
          members.map((work) => work.id),
        ),
      ),
    );

  const played = new Set(mine.filter((entry) => entry.status === "played").map((entry) => entry.workId)).size;

  return (
    <main className="flex-1 pb-14">
      <section className="bg-band px-4 pt-2 pb-5 sm:px-10">
        <BackToShelf />
        <h1 className="font-display text-[26px] break-words sm:text-5xl">{name}</h1>
        <p className="mt-2 font-narrow text-ink-dim">
          {members.length} {members.length === 1 ? "game" : "games"}
          {played > 0 ? ` · ${played} played` : ""}
        </p>
      </section>
      <div className="plank" />

      <ol className="flex max-w-3xl flex-col px-4 pt-4 sm:px-10">
        {members.map((work) => {
          const here = mine.filter((entry) => entry.workId === work.id);
          return (
            <li key={work.id} className="flex items-center gap-4 border-b border-line py-3">
              <Link href={`/work/${work.slug}`} className="relative aspect-[3/4] w-14 shrink-0 bg-panel">
                <span className="sr-only">{work.title}</span>
                {work.coverUrl ? (
                  <Image src={work.coverUrl} alt="" fill sizes="56px" className="object-cover" unoptimized />
                ) : null}
              </Link>
              <div className="min-w-0">
                <p className="truncate">
                  <Link href={`/work/${work.slug}`} className="font-semibold hover:underline">
                    {work.title}
                  </Link>
                </p>
                <p className="font-narrow text-ink-dim">
                  {[work.firstReleaseDate?.slice(0, 4), work.workKind === "main_game" ? null : work.workKind.replace(/_/g, " ")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="font-narrow text-ink-dim">
                  {here.length === 0
                    ? "Not on your shelf"
                    : here.map((entry, i) => (
                        <span key={entry.versionId}>
                          {i > 0 ? ", " : null}
                          <Link href={`/version/${entry.versionId}`} className="text-ink hover:underline">
                            {STATUS_LABELS[entry.status]}
                            {here.length > 1 ? ` (${entry.platformName ?? entry.versionName})` : ""}
                          </Link>
                          {entry.rating !== null ? ` · ${entry.rating} / 10` : ""}
                        </span>
                      ))}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
