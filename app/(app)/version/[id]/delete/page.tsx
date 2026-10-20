import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { versions, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";
import { inspectVersionRemoval, inspectWorkRemoval } from "@/lib/works/removal";

import { deleteFromVersion } from "../../../removal-actions";
import { RemovalSummary } from "../../../removal-summary";
import { DeleteChoice } from "./delete-choice";
import type { Metadata } from "next";
import { versionTitle } from "../../../page-titles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return versionTitle((await params).id, "Delete");
}

export default async function DeleteVersionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  // Anything can be typed into a URL, and Postgres answers a malformed uuid
  // with an error rather than an empty row.
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({
      name: versions.name,
      workId: works.id,
      workSlug: works.slug,
      workTitle: works.title,
    })
    .from(versions)
    .innerJoin(works, eq(works.id, versions.workId))
    .where(eq(versions.id, id));

  if (!row) notFound();

  const [workRemoval, versionRemoval, [siblings]] = await Promise.all([
    inspectWorkRemoval(row.workId),
    inspectVersionRemoval(id),
    db.select({ total: count() }).from(versions).where(eq(versions.workId, row.workId)),
  ]);
  if (!workRemoval || !versionRemoval) notFound();

  // Every work keeps at least one version, so the last one only goes with it.
  const onlyVersion = siblings.total <= 1;

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${row.workSlug}`} className="underline">
          {row.workTitle}
        </Link>
      </p>
      <DeleteChoice
        action={deleteFromVersion}
        versionId={id}
        workTitle={row.workTitle}
        versionName={row.name}
        keepHref={`/version/${id}`}
        workSummary={<RemovalSummary removal={workRemoval} />}
        versionSummary={
          onlyVersion ? null : (
            <div>
              <p className="mb-2 font-narrow">
                The game and its other versions stay.
              </p>
              <RemovalSummary removal={versionRemoval} />
            </div>
          )
        }
      />
    </main>
  );
}
