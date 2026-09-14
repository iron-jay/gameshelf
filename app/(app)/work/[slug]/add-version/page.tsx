import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { platforms, versions, works } from "@/lib/db/schema";

import { VersionForm } from "../../../version-form";

export const dynamic = "force-dynamic";

/**
 * Door B. Same form as Door A, with the base game already known — it is passed
 * in as a prop rather than searched for. No second component.
 */
export default async function AddVersionPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;

  const [work] = await db
    .select({ id: works.id, slug: works.slug, title: works.title })
    .from(works)
    .where(eq(works.slug, slug));

  if (!work) notFound();

  const versionRows = await db
    .select({ id: versions.id, name: versions.name, kind: versions.kind })
    .from(versions)
    .where(eq(versions.workId, work.id))
    .orderBy(asc(versions.createdAt));

  const platformNames = (
    await db.select({ name: platforms.name }).from(platforms).orderBy(asc(platforms.name))
  ).map((row) => row.name);

  return (
    <main className="flex-1 p-6">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${work.slug}`} className="underline">
          {work.title}
        </Link>
      </p>
      <h1 className="mb-6 text-xl font-medium">Add a version</h1>

      <VersionForm
        kind="romhack"
        work={{ ...work, versions: versionRows }}
        platforms={platformNames}
      />
    </main>
  );
}
