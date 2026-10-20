import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { canHaveDlc, dlcOf, parentIgdbIdOf, type DlcItem } from "@/lib/dlc";
import { fillDlcOnce } from "@/lib/dlc-fill";
import {
  entries,
  OFFICIAL_VERSION_KINDS,
  platforms,
  versions,
  works,
} from "@/lib/db/schema";

export function isCommunityKind(kind: string): boolean {
  return !(OFFICIAL_VERSION_KINDS as readonly string[]).includes(kind);
}

export type VersionSummary = {
  id: string;
  name: string;
  kind: string;
  community: boolean;
  platform: string | null;
  author: string | null;
  versionLabel: string | null;
  releaseDate: string | null;
  url: string | null;
  coverUrl: string | null;
  baseVersionId: string | null;
  /** Your entry on this version, if it is on your shelf. */
  entryId: string | null;
};

export type WorkDetail = {
  id: string;
  slug: string;
  title: string;
  workKind: string;
  series: string | null;
  summary: string | null;
  firstReleaseDate: string | null;
  coverUrl: string | null;
  source: string;
  parent: { slug: string; title: string } | null;
  /** For DLC shelved before its game was here: IGDB's id for that game. */
  parentIgdbId: number | null;
  versions: VersionSummary[];
  /**
   * DLC and expansions: works of their own, never versions (CLAUDE.md §2),
   * listed under the game with your shelf state beside each.
   */
  children: DlcItem[];
  /** The game's DLC stands on the shelf as games of their own, rather than under it. */
  dlcOnShelf: boolean;
};

const versionColumns = {
  id: versions.id,
  name: versions.name,
  kind: versions.kind,
  platform: platforms.name,
  author: versions.author,
  versionLabel: versions.versionLabel,
  releaseDate: versions.releaseDate,
  url: versions.url,
  ownCoverUrl: versions.coverUrl,
  baseVersionId: versions.baseVersionId,
  workCoverUrl: works.coverUrl,
};

type VersionRow = {
  id: string;
  name: string;
  kind: string;
  platform: string | null;
  author: string | null;
  versionLabel: string | null;
  releaseDate: string | null;
  url: string | null;
  ownCoverUrl: string | null;
  baseVersionId: string | null;
  workCoverUrl: string | null;
};

async function entryIdsByVersion(userId: string, versionIds: string[]): Promise<Map<string, string>> {
  if (versionIds.length === 0) return new Map();
  const rows = await db
    .select({ versionId: entries.versionId, id: entries.id })
    .from(entries)
    .where(and(eq(entries.userId, userId), inArray(entries.versionId, versionIds)));
  return new Map(rows.map((row) => [row.versionId, row.id]));
}

function summaryFrom(row: VersionRow, entryId: string | null): VersionSummary {
  const community = isCommunityKind(row.kind);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    community,
    platform: row.platform,
    author: row.author,
    versionLabel: row.versionLabel,
    releaseDate: row.releaseDate,
    url: row.url,
    // Section 4a: a community release never borrows the work's boxart.
    coverUrl: community ? row.ownCoverUrl : (row.ownCoverUrl ?? row.workCoverUrl),
    baseVersionId: row.baseVersionId,
    entryId,
  };
}

export async function workDetail(userId: string, slug: string): Promise<WorkDetail | null> {
  const [work] = await db.select().from(works).where(eq(works.slug, slug));
  if (!work) return null;

  const versionRows = await db
    .select(versionColumns)
    .from(versions)
    .innerJoin(works, eq(works.id, versions.workId))
    .leftJoin(platforms, eq(platforms.id, versions.platformId))
    .where(eq(versions.workId, work.id))
    .orderBy(asc(versions.createdAt));

  const mine = await entryIdsByVersion(
    userId,
    versionRows.map((row) => row.id),
  );

  const [parent] = work.parentWorkId
    ? await db
        .select({ slug: works.slug, title: works.title })
        .from(works)
        .where(eq(works.id, work.parentWorkId))
    : [];

  if (canHaveDlc(work.workKind)) await fillDlcOnce(userId, work.id);
  const children = canHaveDlc(work.workKind) ? await dlcOf(userId, work.id) : [];

  return {
    id: work.id,
    slug: work.slug,
    title: work.title,
    workKind: work.workKind,
    series: work.series,
    summary: work.summary,
    firstReleaseDate: work.firstReleaseDate,
    coverUrl: work.coverUrl,
    source: work.source,
    parent: parent ?? null,
    parentIgdbId: work.parentWorkId ? null : parentIgdbIdOf(work.workKind, work.igdbPayload),
    versions: versionRows.map((row) => summaryFrom(row, mine.get(row.id) ?? null)),
    children,
    dlcOnShelf: work.dlcOnShelf,
  };
}

export type VersionDetail = VersionSummary & {
  notes: string | null;
  work: { slug: string; title: string };
  baseVersion: { id: string; name: string } | null;
};

export async function versionDetail(userId: string, versionId: string): Promise<VersionDetail | null> {
  const [row] = await db
    .select({ ...versionColumns, notes: versions.notes, workSlug: works.slug, workTitle: works.title })
    .from(versions)
    .innerJoin(works, eq(works.id, versions.workId))
    .leftJoin(platforms, eq(platforms.id, versions.platformId))
    .where(eq(versions.id, versionId));
  if (!row) return null;

  const [base] = row.baseVersionId
    ? await db
        .select({ id: versions.id, name: versions.name })
        .from(versions)
        .where(eq(versions.id, row.baseVersionId))
    : [];

  const mine = await entryIdsByVersion(userId, [row.id]);

  return {
    ...summaryFrom(row, mine.get(row.id) ?? null),
    notes: row.notes,
    work: { slug: row.workSlug, title: row.workTitle },
    baseVersion: base ?? null,
  };
}
