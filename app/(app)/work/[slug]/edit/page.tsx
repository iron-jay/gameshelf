import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { basedOnOf } from "@/lib/romhacks";

import { EditWorkForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function EditWorkPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;

  const [work] = await db
    .select({
      slug: works.slug,
      title: works.title,
      firstReleaseDate: works.firstReleaseDate,
      summary: works.summary,
      basedOnWorkId: works.basedOnWorkId,
    })
    .from(works)
    .where(eq(works.slug, slug));
  if (!work) notFound();

  const basedOn = await basedOnOf(work.basedOnWorkId);

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${work.slug}`} className="underline">
          {work.title}
        </Link>
      </p>
      <h1 className="mb-2 font-display text-3xl">Edit details</h1>
      <p className="mb-6 max-w-2xl font-narrow text-ink-dim">
        {basedOn ? (
          <>
            This romhack started with{" "}
            <Link href={`/work/${basedOn.slug}`} className="underline">
              {basedOn.title}
            </Link>
            &rsquo;s details. They are its own now: changing them here leaves the original alone.{" "}
          </>
        ) : null}
        Platforms belong to each way to play, on its own page.
      </p>

      <EditWorkForm
        slug={work.slug}
        values={{ title: work.title, releaseDate: work.firstReleaseDate, summary: work.summary }}
      />
    </main>
  );
}
