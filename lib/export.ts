import { asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import { entries, plays, platforms, shelfEntries, shelves, versions, works } from "@/lib/db/schema";

export type ExportPlay = {
  startedOn: string | null;
  finishedOn: string | null;
  hours: string | null;
  completion: string | null;
  note: string | null;
};

export type ExportEntry = {
  status: string;
  completion: string | null;
  rating: number | null;
  ratingOutOfFive: number | null;
  review: string | null;
  reviewHasSpoilers: boolean;
  isFavourite: boolean;
  isPrivate: boolean;
  addedAt: string;
  shelves: string[];
  plays: ExportPlay[];
  version: {
    name: string;
    kind: string;
    platform: string | null;
    author: string | null;
    versionLabel: string | null;
    releaseDate: string | null;
    url: string | null;
    notes: string | null;
    source: string;
    isCommunityRelease: boolean;
    baseVersion: string | null;
    sgdbGameId: number | null;
  };
  work: {
    title: string;
    slug: string;
    workKind: string;
    firstReleaseDate: string | null;
    source: string;
    igdbId: number | null;
    parentWork: string | null;
  };
};

export type ExportDocument = {
  exportedAt: string;
  username: string;
  note: string;
  entryCount: number;
  entries: ExportEntry[];
};

const OFFICIAL = ["original", "port", "remaster", "remake", "compilation"];

export async function buildExport(userId: string, username: string): Promise<ExportDocument> {
  // pg-core's alias builds a properly typed table; the generic aliasedTable
  // collapses the select row type to never.
  const baseVersions = alias(versions, "base_versions");
  const parentWorks = alias(works, "parent_works");

  const rows = await db
    .select({
      entryId: entries.id,
      status: entries.status,
      completion: entries.completion,
      rating: entries.rating,
      review: entries.review,
      reviewHasSpoilers: entries.reviewHasSpoilers,
      isFavourite: entries.isFavourite,
      isPrivate: entries.isPrivate,
      addedAt: entries.addedAt,

      versionName: versions.name,
      versionKind: versions.kind,
      versionAuthor: versions.author,
      versionLabel: versions.versionLabel,
      versionReleaseDate: versions.releaseDate,
      versionUrl: versions.url,
      versionNotes: versions.notes,
      versionSource: versions.source,
      versionSgdbGameId: versions.sgdbGameId,

      workTitle: works.title,
      workSlug: works.slug,
      workKind: works.workKind,
      workFirstReleaseDate: works.firstReleaseDate,
      workSource: works.source,
      workIgdbId: works.igdbId,

      platformName: platforms.name,
      baseVersionName: baseVersions.name,
      parentWorkTitle: parentWorks.title,
    })
    .from(entries)
    .innerJoin(versions, eq(versions.id, entries.versionId))
    .innerJoin(works, eq(works.id, versions.workId))
    .leftJoin(platforms, eq(platforms.id, versions.platformId))
    .leftJoin(baseVersions, eq(baseVersions.id, versions.baseVersionId))
    .leftJoin(parentWorks, eq(parentWorks.id, works.parentWorkId))
    .where(eq(entries.userId, userId))
    .orderBy(asc(works.title), asc(versions.name));

  const entryIds = rows.map((row) => row.entryId);

  // Two follow-up queries rather than one join, so a game with three plays on
  // two shelves does not come back as six rows to de-duplicate.
  const playRows = entryIds.length
    ? await db
        .select()
        .from(plays)
        .where(inArray(plays.entryId, entryIds))
        .orderBy(asc(plays.startedOn), asc(plays.createdAt))
    : [];

  const shelfRows = entryIds.length
    ? await db
        .select({ entryId: shelfEntries.entryId, name: shelves.name })
        .from(shelfEntries)
        .innerJoin(shelves, eq(shelves.id, shelfEntries.shelfId))
        .where(inArray(shelfEntries.entryId, entryIds))
        .orderBy(asc(shelves.name))
    : [];

  const playsByEntry = new Map<string, ExportPlay[]>();
  for (const play of playRows) {
    const list = playsByEntry.get(play.entryId) ?? [];
    list.push({
      startedOn: play.startedOn,
      finishedOn: play.finishedOn,
      hours: play.hours,
      completion: play.completion,
      note: play.note,
    });
    playsByEntry.set(play.entryId, list);
  }

  const shelvesByEntry = new Map<string, string[]>();
  for (const row of shelfRows) {
    const list = shelvesByEntry.get(row.entryId) ?? [];
    list.push(row.name);
    shelvesByEntry.set(row.entryId, list);
  }

  return {
    exportedAt: new Date().toISOString(),
    username,
    note:
      "Everything on this shelf. Cached IGDB payloads are left out on purpose: they are " +
      "upstream data that can be fetched again, not yours.",
    entryCount: rows.length,
    entries: rows.map((row) => ({
      status: row.status,
      completion: row.completion,
      rating: row.rating,
      // The database stores half-stars as 1..10; this is the number a person reads.
      ratingOutOfFive: row.rating === null ? null : row.rating / 2,
      review: row.review,
      reviewHasSpoilers: row.reviewHasSpoilers,
      isFavourite: row.isFavourite,
      isPrivate: row.isPrivate,
      addedAt: row.addedAt.toISOString(),
      shelves: shelvesByEntry.get(row.entryId) ?? [],
      plays: playsByEntry.get(row.entryId) ?? [],
      version: {
        name: row.versionName,
        kind: row.versionKind,
        platform: row.platformName,
        author: row.versionAuthor,
        versionLabel: row.versionLabel,
        releaseDate: row.versionReleaseDate,
        url: row.versionUrl,
        notes: row.versionNotes,
        source: row.versionSource,
        isCommunityRelease: !OFFICIAL.includes(row.versionKind),
        baseVersion: row.baseVersionName,
        sgdbGameId: row.versionSgdbGameId,
      },
      work: {
        title: row.workTitle,
        slug: row.workSlug,
        workKind: row.workKind,
        firstReleaseDate: row.workFirstReleaseDate,
        source: row.workSource,
        igdbId: row.workIgdbId,
        parentWork: row.parentWorkTitle,
      },
    })),
  };
}

/** RFC 4180: quote anything containing a comma, a quote or a newline. */
function cell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const COLUMNS = [
  "work_title",
  "version_name",
  "version_kind",
  "community_release",
  "platform",
  "author",
  "version_label",
  "base_version",
  "parent_work",
  "status",
  "completion",
  "rating_out_of_five",
  "favourite",
  "private",
  "shelves",
  "added_at",
  "play_count",
  "total_hours",
  "first_started",
  "last_finished",
  "review",
] as const;

/**
 * One row per shelf entry, the way a Goodreads export is one row per book.
 * Plays are summarised rather than expanded, because a spreadsheet with a
 * variable number of play columns is no use to anyone; the JSON keeps them all.
 */
export function toCsv(doc: ExportDocument): string {
  const lines = [COLUMNS.join(",")];

  for (const entry of doc.entries) {
    const hours = entry.plays.reduce((sum, play) => sum + Number(play.hours ?? 0), 0);
    const started = entry.plays.map((play) => play.startedOn).filter(Boolean).sort();
    const finished = entry.plays.map((play) => play.finishedOn).filter(Boolean).sort();

    lines.push(
      [
        entry.work.title,
        entry.version.name,
        entry.version.kind,
        entry.version.isCommunityRelease,
        entry.version.platform,
        entry.version.author,
        entry.version.versionLabel,
        entry.version.baseVersion,
        entry.work.parentWork,
        entry.status,
        entry.completion,
        entry.ratingOutOfFive,
        entry.isFavourite,
        entry.isPrivate,
        entry.shelves.join("; "),
        entry.addedAt,
        entry.plays.length,
        hours === 0 ? null : hours.toFixed(1),
        started[0] ?? null,
        finished[finished.length - 1] ?? null,
        entry.review,
      ]
        .map(cell)
        .join(","),
    );
  }

  return `${lines.join("\r\n")}\r\n`;
}
