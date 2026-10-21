/**
 * gameshelf's own JSON export, read back in: to restore a library, or to move
 * one to another server. The CSV is a summary for spreadsheets and is not read.
 *
 * Pure: no database, no network. The rows go to the page and come back in
 * batches, so they are checked on the way in and again on the way back.
 */
import { completionLevel, logStatus, versionKind, workKind } from "@/lib/db/schema";

type Status = (typeof logStatus.enumValues)[number];
type Completion = (typeof completionLevel.enumValues)[number];
type VersionKind = (typeof versionKind.enumValues)[number];
type WorkKind = (typeof workKind.enumValues)[number];

export type RestoreRow = {
  /** Position in the file, from 1, for saying which went wrong. */
  line: number;
  status: Status;
  completion: Completion | null;
  rating: number | null;
  review: string | null;
  reviewHasSpoilers: boolean;
  isFavourite: boolean;
  isPrivate: boolean;
  addedAt: string;
  shelves: string[];
  plays: { startedOn: string | null; finishedOn: string | null; hours: string | null; completion: Completion | null; note: string | null }[];
  version: {
    name: string;
    kind: VersionKind;
    platform: string | null;
    author: string | null;
    versionLabel: string | null;
    releaseDate: string | null;
    url: string | null;
    notes: string | null;
    baseVersion: string | null;
    sgdbGameId: number | null;
    igdbId: number | null;
  };
  work: {
    title: string;
    workKind: WorkKind;
    firstReleaseDate: string | null;
    igdbId: number | null;
    parentWork: string | null;
    parentIgdbId: number | null;
    series: string | null;
    summary: string | null;
    dlcOnShelf: boolean;
    sgdbGameId: number | null;
    /** A romhack's own game: the game it was built on. */
    basedOn: string | null;
    basedOnIgdbId: number | null;
  };
};

export type RestoreParse = { rows: RestoreRow[]; skipped: { line: number; reason: string }[] };

export class RestoreFormatError extends Error {}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const oneOf = <T extends string>(values: readonly T[], v: unknown): v is T => values.includes(v as T);
/** Absent (an export from before the field existed) reads as null. */
const opt = (v: unknown, max: number): string | null | false =>
  v === null || v === undefined ? null : typeof v === "string" && v.length <= max ? v || null : false;
const optInt = (v: unknown, min: number, max: number): number | null | false =>
  v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : false;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const optDay = (v: unknown): string | null | false =>
  v === null || v === undefined ? null : typeof v === "string" && DAY.test(v) ? v : false;
const optEnum = <T extends string>(values: readonly T[], v: unknown): T | null | false =>
  v === null || v === undefined ? null : oneOf(values, v) ? v : false;
const ID = 2 ** 31 - 1;

/** One entry as the export wrote it, or the reason it cannot be used. */
export function toRestoreRow(value: unknown, line: number): RestoreRow | string {
  if (!isObj(value) || !isObj(value.version) || !isObj(value.work)) return "not an entry";
  const { version, work } = value;

  if (!str(work.title, 500)) return "no title";
  if (!str(version.name, 500)) return "version has no name";
  if (!oneOf(logStatus.enumValues, value.status)) return `unknown shelf "${String(value.status)}"`;
  if (!oneOf(versionKind.enumValues, version.kind)) return "version kind unreadable";
  const kind = work.workKind === undefined ? "main_game" : work.workKind;
  if (!oneOf(workKind.enumValues, kind)) return "game kind unreadable";

  const shelves = Array.isArray(value.shelves) ? value.shelves : [];
  if (shelves.length > 100 || !shelves.every((t) => str(t, 100))) return "tags unreadable";

  const rawPlays = Array.isArray(value.plays) ? value.plays : [];
  if (rawPlays.length > 200) return "too many plays";
  const plays: RestoreRow["plays"] = [];
  for (const p of rawPlays) {
    if (!isObj(p)) return "a play is unreadable";
    const startedOn = optDay(p.startedOn);
    const finishedOn = optDay(p.finishedOn);
    const hours = p.hours === null || p.hours === undefined ? null : /^\d{1,5}(\.\d)?$/.test(String(p.hours)) ? String(p.hours) : false;
    const completion = optEnum(completionLevel.enumValues, p.completion);
    const note = opt(p.note, 5000);
    if (startedOn === false || finishedOn === false || hours === false || completion === false || note === false) {
      return "a play is unreadable";
    }
    // The schema's own rule: a play cannot finish before it starts.
    if (startedOn && finishedOn && finishedOn < startedOn) return "a play finishes before it starts";
    plays.push({ startedOn, finishedOn, hours, completion, note });
  }

  const fields = {
    completion: optEnum(completionLevel.enumValues, value.completion),
    rating: optInt(value.rating, 1, 10),
    review: opt(value.review, 100_000),
    platform: opt(version.platform, 200),
    author: opt(version.author, 500),
    versionLabel: opt(version.versionLabel, 200),
    releaseDate: optDay(version.releaseDate),
    url: opt(version.url, 2000),
    notes: opt(version.notes, 20_000),
    baseVersion: opt(version.baseVersion, 500),
    versionSgdb: optInt(version.sgdbGameId, 1, ID),
    versionIgdb: optInt(version.igdbId, 1, ID),
    firstReleaseDate: optDay(work.firstReleaseDate),
    igdbId: optInt(work.igdbId, 1, ID),
    parentWork: opt(work.parentWork, 500),
    parentIgdbId: optInt(work.parentIgdbId, 1, ID),
    series: opt(work.series, 300),
    summary: opt(work.summary, 50_000),
    workSgdb: optInt(work.sgdbGameId, 1, ID),
    basedOn: opt(work.basedOn, 500),
    basedOnIgdbId: optInt(work.basedOnIgdbId, 1, ID),
  };
  const bad = Object.entries(fields).find(([, v]) => v === false);
  if (bad) return `${bad[0]} unreadable`;
  const f = fields as { [K in keyof typeof fields]: Exclude<(typeof fields)[K], false> };

  const restored: RestoreRow = {
    line,
    status: value.status,
    completion: f.completion,
    rating: f.rating,
    review: f.review,
    reviewHasSpoilers: value.reviewHasSpoilers === true,
    isFavourite: value.isFavourite === true,
    isPrivate: value.isPrivate === true,
    addedAt: typeof value.addedAt === "string" && !Number.isNaN(Date.parse(value.addedAt)) ? value.addedAt : new Date().toISOString(),
    shelves: (shelves as string[]).map((s) => s.trim()),
    plays,
    version: {
      name: version.name.trim(),
      kind: version.kind,
      platform: f.platform,
      author: f.author,
      versionLabel: f.versionLabel,
      releaseDate: f.releaseDate,
      url: f.url,
      notes: f.notes,
      baseVersion: f.baseVersion,
      sgdbGameId: f.versionSgdb,
      igdbId: f.versionIgdb,
    },
    work: {
      title: work.title.trim(),
      workKind: kind,
      firstReleaseDate: f.firstReleaseDate,
      igdbId: f.igdbId,
      parentWork: kind === "main_game" ? null : f.parentWork,
      parentIgdbId: kind === "main_game" ? null : f.parentIgdbId,
      series: f.series,
      summary: f.summary,
      dlcOnShelf: work.dlcOnShelf === true,
      sgdbGameId: f.workSgdb,
      basedOn: f.basedOn,
      basedOnIgdbId: f.basedOnIgdbId,
    },
  };
  // An export from before romhacks were games of their own has the hack as a
  // version of its original. It comes back as the migration made them: a game
  // of its own, from the original's details.
  return restored.version.kind === "romhack" && !("basedOn" in work) ? asOwnGame(restored) : restored;
}

function asOwnGame(row: RestoreRow): RestoreRow {
  const { work, version } = row;
  return {
    ...row,
    work: {
      title: version.name,
      workKind: "main_game",
      firstReleaseDate: version.releaseDate ?? work.firstReleaseDate,
      igdbId: null,
      parentWork: null,
      parentIgdbId: null,
      series: work.series,
      summary: work.summary,
      dlcOnShelf: false,
      sgdbGameId: version.sgdbGameId,
      basedOn: work.title,
      basedOnIgdbId: work.igdbId,
    },
  };
}

/**
 * The whole file. Another app's export, or a Grouvee file, is a message
 * rather than a pile of skipped rows.
 */
export function parseRestore(text: string): RestoreParse {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new RestoreFormatError("That file is not JSON. Choose the .json download from Settings → Export.");
  }
  if (!isObj(doc) || !Array.isArray(doc.entries)) {
    throw new RestoreFormatError("That file is not a gameshelf export.");
  }
  const first: unknown = doc.entries[0];
  if ((typeof doc.note === "string" && doc.note.startsWith("bookshelf export")) || (isObj(first) && "edition" in first)) {
    throw new RestoreFormatError("That is a bookshelf export. It goes into bookshelf.");
  }

  const rows: RestoreRow[] = [];
  const skipped: RestoreParse["skipped"] = [];
  doc.entries.forEach((value: unknown, i: number) => {
    const row = toRestoreRow(value, i + 1);
    if (typeof row === "string") skipped.push({ line: i + 1, reason: row });
    else rows.push(row);
  });

  // Games before their DLC, and releases before the hacks and ports built on
  // them, so what a row hangs off is here when it arrives.
  const builtOn = (row: RestoreRow) => Boolean(row.version.baseVersion || row.work.basedOn || row.work.basedOnIgdbId);
  const rank = (row: RestoreRow) => (row.work.workKind === "main_game" ? 0 : 2) + (builtOn(row) ? 1 : 0);
  rows.sort((a, b) => rank(a) - rank(b));
  return { rows, skipped };
}
