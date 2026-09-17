import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { versions, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";
import { inspectVersionRemoval } from "@/lib/works/removal";

import { deleteVersion } from "../../../removal-actions";
import { RemovalSummary } from "../../../removal-summary";

export const dynamic = "force-dynamic";

export default async function DeleteVersionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  // Anything can be typed into a URL, and Postgres answers a malformed uuid
  // with an error rather than an empty row.
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({ name: versions.name, kind: versions.kind, workSlug: works.slug, workTitle: works.title })
    .from(versions)
    .innerJoin(works, eq(works.id, versions.workId))
    .where(eq(versions.id, id));

  if (!row) notFound();

  const removal = await inspectVersionRemoval(id);
  if (!removal) notFound();

  return (
    <main className="flex-1 p-6">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${row.workSlug}`} className="underline">
          {row.workTitle}
        </Link>
      </p>
      <h1 className="mb-4 text-xl font-medium">Delete {row.name}?</h1>

      <RemovalSummary removal={removal} />

      <form action={deleteVersion} className="mt-6 flex items-center gap-4">
        <input type="hidden" name="versionId" value={id} />
        <button
          type="submit"
          className="border border-line bg-panel px-4 py-2 font-medium hover:border-ink"
        >
          Delete this version
        </button>
        <Link href={`/version/${id}`} className="font-narrow text-ink-dim underline hover:text-ink">
          Keep it
        </Link>
      </form>
    </main>
  );
}
