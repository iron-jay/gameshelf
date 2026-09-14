import { and, count, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";

import { removeCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, plays, shelfEntries, versions, works } from "@/lib/db/schema";

/**
 * What deleting something actually takes with it.
 *
 * The database cascades happily and silently; this exists so the confirmation
 * page can say out loud what is about to go, rather than asking someone to
 * trust that "delete" means what they hope.
 */
export type Removal = {
  works: { id: string; title: string }[];
  versionCount: number;
  entryCount: number;
  playCount: number;
  shelfLinkCount: number;
  /** Versions elsewhere that point at these; they are orphaned, not deleted. */
  dependentVersions: { id: string; name: string; workTitle: string }[];
  coverFiles: string[];
};

function filenameOf(coverUrl: string | null): string | null {
  return coverUrl ? (coverUrl.split("/").pop() ?? null) : null;
}

/**
 * The work, everything hanging off it, and their art. Recursive because
 * parent_work_id cascades, and a two-level chain would otherwise leave files
 * behind even though the rows went.
 */
export async function inspectWorkRemoval(workId: string): Promise<Removal | null> {
  const tree = await db.execute<{ id: string; title: string; cover_url: string | null }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id, title, cover_url FROM works WHERE id = ${workId}
      UNION ALL
      SELECT w.id, w.title, w.cover_url FROM works w JOIN tree t ON w.parent_work_id = t.id
    )
    SELECT id, title, cover_url FROM tree
  `);

  if (tree.length === 0) return null;

  const versionRows = await db
    .select({ id: versions.id, coverUrl: versions.coverUrl })
    .from(versions)
    .where(
      inArray(
        versions.workId,
        tree.map((row) => row.id),
      ),
    );

  const versionIds = versionRows.map((row) => row.id);

  return {
    works: tree.map((row) => ({ id: row.id, title: row.title })),
    versionCount: versionRows.length,
    ...(await countsForVersions(versionIds)),
    dependentVersions: await dependentsOf(versionIds),
    coverFiles: [
      ...tree.map((row) => filenameOf(row.cover_url)),
      ...versionRows.map((row) => filenameOf(row.coverUrl)),
    ].filter((name): name is string => Boolean(name)),
  };
}

export async function inspectVersionRemoval(versionId: string): Promise<Removal | null> {
  const [version] = await db
    .select({ id: versions.id, coverUrl: versions.coverUrl })
    .from(versions)
    .where(eq(versions.id, versionId));

  if (!version) return null;

  const cover = filenameOf(version.coverUrl);

  return {
    works: [],
    versionCount: 1,
    ...(await countsForVersions([version.id])),
    dependentVersions: await dependentsOf([version.id]),
    coverFiles: cover ? [cover] : [],
  };
}

async function countsForVersions(versionIds: string[]) {
  if (versionIds.length === 0) {
    return { entryCount: 0, playCount: 0, shelfLinkCount: 0 };
  }

  const [entryRow] = await db
    .select({ total: count() })
    .from(entries)
    .where(inArray(entries.versionId, versionIds));

  const [playRow] = await db
    .select({ total: count() })
    .from(plays)
    .innerJoin(entries, eq(entries.id, plays.entryId))
    .where(inArray(entries.versionId, versionIds));

  const [shelfRow] = await db
    .select({ total: count() })
    .from(shelfEntries)
    .innerJoin(entries, eq(entries.id, shelfEntries.entryId))
    .where(inArray(entries.versionId, versionIds));

  return {
    entryCount: entryRow.total,
    playCount: playRow.total,
    shelfLinkCount: shelfRow.total,
  };
}

/**
 * Versions built on top of the ones going away. base_version_id is ON DELETE
 * SET NULL, so these survive — they just stop recording what they patch, which
 * is worth saying before it happens rather than discovering after.
 */
async function dependentsOf(versionIds: string[]) {
  if (versionIds.length === 0) return [];

  return db
    .select({ id: versions.id, name: versions.name, workTitle: works.title })
    .from(versions)
    .innerJoin(works, eq(works.id, versions.workId))
    .where(
      and(
        inArray(versions.baseVersionId, versionIds),
        notInArray(versions.id, versionIds),
      ),
    );
}

/** Removes art for rows that are already gone. Safe to call with a stale list. */
export async function removeCoverFiles(files: string[]): Promise<void> {
  await Promise.all(files.map((file) => removeCover(file)));
}

/** Cover files on disk that nothing in the database points at any more. */
export async function orphanedCoverFiles(onDisk: string[]): Promise<string[]> {
  const referenced = new Set<string>();

  const workCovers = await db
    .select({ coverUrl: works.coverUrl })
    .from(works)
    .where(isNotNull(works.coverUrl));
  const versionCovers = await db
    .select({ coverUrl: versions.coverUrl })
    .from(versions)
    .where(isNotNull(versions.coverUrl));

  for (const row of [...workCovers, ...versionCovers]) {
    const name = filenameOf(row.coverUrl);
    if (name) referenced.add(name);
  }

  return onDisk.filter((file) => !referenced.has(file));
}
