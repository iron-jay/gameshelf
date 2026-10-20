import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { inspectWorkRemoval } from "@/lib/works/removal";

import { deleteWork } from "../../../removal-actions";
import { RemovalSummary } from "../../../removal-summary";
import type { Metadata } from "next";
import { workTitle } from "../../../page-titles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return workTitle((await params).slug, "Delete");
}

export default async function DeleteWorkPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;

  const [work] = await db
    .select({ id: works.id, title: works.title })
    .from(works)
    .where(eq(works.slug, slug));

  if (!work) notFound();

  const removal = await inspectWorkRemoval(work.id);
  if (!removal) notFound();

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${slug}`} className="underline">
          {work.title}
        </Link>
      </p>
      <h1 className="mb-4 font-display text-3xl">Delete {work.title}?</h1>

      <RemovalSummary removal={removal} />

      <form action={deleteWork} className="mt-6 flex items-center gap-4">
        <input type="hidden" name="workId" value={work.id} />
        <button
          type="submit"
          className="btn btn-danger"
        >
          Delete this game and everything on it
        </button>
        <Link href={`/work/${slug}`} className="font-narrow text-ink-dim underline hover:text-ink">
          Keep it
        </Link>
      </form>
    </main>
  );
}
