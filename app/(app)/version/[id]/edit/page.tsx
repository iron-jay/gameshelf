import { and, asc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { platforms, versionKind, versions, works } from "@/lib/db/schema";
import { platformsInUse } from "@/lib/platforms";
import { isUuid } from "@/lib/uuid";

import { EditVersionForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function EditVersionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  // Anything can be typed into a URL, and Postgres answers a malformed uuid
  // with an error rather than an empty row.
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({
      version: versions,
      workSlug: works.slug,
      workTitle: works.title,
      basedOnWorkId: works.basedOnWorkId,
      platformName: platforms.name,
    })
    .from(versions)
    .innerJoin(works, eq(works.id, versions.workId))
    .leftJoin(platforms, eq(platforms.id, versions.platformId))
    .where(eq(versions.id, id));

  if (!row) notFound();

  // Siblings only, and never itself — the schema forbids a version being its
  // own base, and basing it on a version of a different game is meaningless.
  // A romhack is the exception: it is a game of its own, and what it patches
  // is a release of the original.
  const romhack = row.version.kind === "romhack";
  const baseWorkId = romhack ? row.basedOnWorkId : row.version.workId;
  const siblings = baseWorkId
    ? await db
        .select({ id: versions.id, name: versions.name })
        .from(versions)
        .where(and(eq(versions.workId, baseWorkId), ne(versions.id, row.version.id)))
        .orderBy(asc(versions.createdAt))
    : [];

  const platformNames = await platformsInUse();

  return (
    <main className="flex-1 px-4 py-6 sm:px-10">
      <p className="mb-1 font-narrow text-ink-dim">
        <Link href={`/work/${row.workSlug}`} className="underline">
          {row.workTitle}
        </Link>
        {" · "}
        <Link href={`/version/${row.version.id}`} className="underline">
          {row.version.name}
        </Link>
      </p>
      <h1 className="mb-2 font-display text-3xl">Edit version</h1>
      <p className="mb-6 max-w-2xl font-narrow text-ink-dim">
        The version&rsquo;s own details. The game&rsquo;s title, year and summary are{" "}
        <Link href={`/work/${row.workSlug}/edit`} className="underline">
          its details
        </Link>
        ; your rating, review and plays live on the version page, and the cover has its own picker.
      </p>

      <p className="mb-6 font-narrow">
        <Link
          href={`/version/${row.version.id}/delete`}
          className="text-ink-dim underline hover:text-ink"
        >
          Delete
        </Link>
      </p>

      <EditVersionForm
        versionId={row.version.id}
        baseVersionId={row.version.baseVersionId}
        siblings={siblings}
        platforms={platformNames}
        // Every kind, not just the community ones: an official release added
        // from IGDB should be fixable here too. Except a romhack, which is a
        // game of its own rather than a kind of release of this one.
        kinds={romhack ? ["romhack"] : versionKind.enumValues.filter((value) => value !== "romhack")}
        values={{
          name: row.version.name,
          kind: row.version.kind,
          platformName: row.platformName,
          author: row.version.author,
          versionLabel: row.version.versionLabel,
          releaseDate: row.version.releaseDate,
          url: row.version.url,
          notes: row.version.notes,
        }}
      />
    </main>
  );
}
