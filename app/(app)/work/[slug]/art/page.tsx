import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { OFFICIAL_VERSION_KINDS, versions, works } from "@/lib/db/schema";
import type { ArtCandidate } from "@/lib/sgdb";
import { lookupArt } from "@/lib/sgdb";

import { ArtPicker } from "./art-picker";

export const dynamic = "force-dynamic";

function isCommunity(kind: string): boolean {
  return !(OFFICIAL_VERSION_KINDS as readonly string[]).includes(kind);
}

export default async function ArtPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const { version: versionId } = await searchParams;

  const [work] = await db
    .select({ id: works.id, slug: works.slug, title: works.title, coverUrl: works.coverUrl })
    .from(works)
    .where(eq(works.slug, slug));

  if (!work) notFound();

  const version = versionId
    ? (
        await db
          .select({
            id: versions.id,
            name: versions.name,
            kind: versions.kind,
            coverUrl: versions.coverUrl,
          })
          .from(versions)
          .where(and(eq(versions.id, versionId), eq(versions.workId, work.id)))
      )[0]
    : undefined;

  if (versionId && !version) notFound();

  // Section 4a, and the whole point of it: a community release searches on its
  // own name. Searching the parent work's title returns the original's boxart,
  // which looks correct and is wrong.
  const seedTitle = version && isCommunity(version.kind) ? version.name : work.title;

  let candidates: ArtCandidate[] = [];
  let notice: string | null = null;
  try {
    candidates = (await lookupArt(seedTitle, false)).candidates;
  } catch {
    notice = "SteamGridDB could not be reached. Pasting an id or uploading a file still works.";
  }

  const current = version ? version.coverUrl : work.coverUrl;

  return (
    <main className="flex-1 p-6">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${work.slug}`} className="underline">
          {work.title}
        </Link>
      </p>
      <h1 className="mb-6 text-xl font-medium">
        Change art{version ? ` — ${version.name}` : ""}
      </h1>

      <ArtPicker
        slug={work.slug}
        versionId={version?.id ?? null}
        seedTitle={seedTitle}
        initialCandidates={candidates}
        currentCoverUrl={current}
        notice={notice}
      />
    </main>
  );
}
