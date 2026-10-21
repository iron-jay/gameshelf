import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { versions, works } from "@/lib/db/schema";
import { platformsInUse } from "@/lib/platforms";
import { seriesInUse } from "@/lib/series";
import { basedOnOf, isRomhackWork } from "@/lib/romhacks";

import { VersionForm } from "../../../version-form";
import type { Metadata } from "next";
import { workTitle } from "../../../page-titles";

export const dynamic = "force-dynamic";

/**
 * Door B. Same form as Door A, with the base game already known — it is passed
 * in as a prop rather than searched for. No second component.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return workTitle((await params).slug, "Add a version of");
}

export default async function AddVersionPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;

  const [work] = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      basedOnWorkId: works.basedOnWorkId,
      series: works.series,
      summary: works.summary,
    })
    .from(works)
    .where(eq(works.slug, slug));

  if (!work) notFound();

  // On a romhack's own page this adds another way to play it, and what it
  // patches is a release of the original rather than of the hack.
  const romhack = await isRomhackWork(db, work.id);
  const original = romhack ? await basedOnOf(work.basedOnWorkId) : null;
  const patchable = romhack ? work.basedOnWorkId : work.id;

  const versionRows = patchable
    ? await db
        .select({ id: versions.id, name: versions.name, kind: versions.kind })
        .from(versions)
        .where(eq(versions.workId, patchable))
        .orderBy(asc(versions.createdAt))
    : [];

  const platformNames = await platformsInUse();

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${work.slug}`} className="underline">
          {work.title}
        </Link>
      </p>
      <h1 className="mb-6 font-display text-3xl">{romhack ? "Add a way to play" : "Add a version"}</h1>

      <VersionForm
        kind="romhack"
        work={{
          id: work.id,
          title: work.title,
          versions: versionRows,
          romhack: romhack ? { original: original?.title ?? null } : null,
          series: work.series,
          summary: work.summary,
        }}
        platforms={platformNames}
        seriesNames={await seriesInUse()}
      />
    </main>
  );
}
