import { asc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { platforms, versions, works } from "@/lib/db/schema";
import { OFFICIAL_VERSION_KINDS } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function isCommunity(kind: string): boolean {
  return !(OFFICIAL_VERSION_KINDS as readonly string[]).includes(kind);
}

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
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
  const children = await db
    .select({ id: works.id, slug: works.slug, title: works.title, workKind: works.workKind })
    .from(works)
    .where(eq(works.parentWorkId, work.id))
    .orderBy(asc(works.firstReleaseDate));

  return (
    <main className="flex-1 p-6">
      <div className="flex flex-wrap gap-6">
        <div className="relative h-64 w-48 shrink-0 bg-panel">
          {work.coverUrl ? (
            <Image src={work.coverUrl} alt="" fill sizes="192px" className="object-cover" unoptimized />
          ) : null}
        </div>

        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-medium">{work.title}</h1>
          <p className="mt-1 font-narrow text-ink-dim">
            {work.workKind.replace(/_/g, " ")}
            {work.firstReleaseDate ? ` · ${work.firstReleaseDate.slice(0, 4)}` : ""}
            {work.source === "local" ? " · local" : ""}
          </p>
          {work.summary ? <p className="mt-4">{work.summary}</p> : null}
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Versions</h2>
          <Link
            href={`/work/${work.slug}/add-version`}
            className="border border-line bg-panel px-3 py-1.5 font-narrow hover:border-ink-dim"
          >
            Add version
          </Link>
        </div>

        <ul className="flex flex-col">
          {versionRows.map((version) => (
            <li key={version.id} className="flex items-center gap-4 border-b border-line py-3">
              <div className="h-16 w-12 shrink-0 bg-panel">
                {version.coverUrl ? (
                  <Image
                    src={version.coverUrl}
                    alt=""
                    width={48}
                    height={64}
                    className="h-16 w-12 object-cover"
                    unoptimized
                  />
                ) : null}
              </div>

              <div className="min-w-0">
                <p className="truncate">
                  {version.name}
                  {version.versionLabel ? (
                    <span className="ml-2 font-mono text-ink-dim">{version.versionLabel}</span>
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

              {/* The only chromatic value in the app, and only ever this. */}
              {isCommunity(version.kind) ? (
                <span className="ml-auto shrink-0 bg-label px-2 py-0.5 font-narrow text-ground">
                  community
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {children.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 font-medium">Also part of this game</h2>
          <ul className="flex flex-col">
            {children.map((child) => (
              <li key={child.id} className="border-b border-line py-3">
                <Link href={`/work/${child.slug}`} className="hover:underline">
                  {child.title}
                </Link>
                <p className="font-narrow text-ink-dim">{child.workKind.replace(/_/g, " ")}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
