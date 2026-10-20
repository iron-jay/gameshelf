"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { parseGrouvee, type GrouveeItem, type GrouveeParse } from "@/lib/import/grouvee";
import { IMPORT_CHUNK, RESTORE_CHUNK, type ImportChunkResult } from "@/lib/import/constants";
import { parseRestore, RestoreFormatError, toRestoreRow, type RestoreRow } from "@/lib/import/restore";
import { restoreRows, type RestoreOutcome } from "@/lib/import/restore-run";
import { importItems } from "@/lib/import/run";

export type ParseState =
  | { ok: true; parse: GrouveeParse }
  | { ok: false; message: string }
  | null;

export async function parseGrouveeUpload(
  _prev: ParseState,
  formData: FormData,
): Promise<ParseState> {
  await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose your Grouvee export." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { ok: false, message: "That file is larger than 20 MB." };
  }

  try {
    return { ok: true, parse: parseGrouvee(JSON.parse(await file.text())) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "That file could not be read.",
    };
  }
}

/**
 * Imports one batch.
 *
 * The client drives the batching so it can show progress — a few hundred games
 * is a minute or two of cover downloads, and a single silent request would look
 * like a hang. Everything is idempotent, so a retried batch changes nothing.
 */
export async function importGrouveeItems(items: GrouveeItem[]): Promise<ImportChunkResult> {
  const user = await requireUser();

  if (!Array.isArray(items) || items.length === 0) {
    return { added: 0, alreadyThere: 0, missing: [] };
  }
  if (items.length > IMPORT_CHUNK) {
    throw new Error(`At most ${IMPORT_CHUNK} at a time`);
  }

  const result = await importItems(user.id, items);
  revalidatePath("/");
  return result;
}

export type RestoreParseState =
  | { ok: true; rows: RestoreRow[]; skipped: { line: number; reason: string }[] }
  | { ok: false; message: string }
  | null;

/**
 * gameshelf's own JSON export, to restore a library or move it to another
 * server. Read once and handed to the page, which sends it back in batches.
 */
export async function parseRestoreUpload(_prev: RestoreParseState, formData: FormData): Promise<RestoreParseState> {
  await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a gameshelf export first — the .json file." };
  }
  if (file.size > 20 * 1024 * 1024) return { ok: false, message: "That file is larger than 20 MB." };

  try {
    const { rows, skipped } = parseRestore(await file.text());
    if (rows.length === 0) return { ok: false, message: "That export has no games in it." };
    return { ok: true, rows, skipped };
  } catch (error) {
    if (error instanceof RestoreFormatError) return { ok: false, message: error.message };
    return { ok: false, message: "That file could not be read as a gameshelf export." };
  }
}

/** One batch of a restore. The rows come back from the page, so they are checked again. */
export async function restoreBatch(rows: unknown): Promise<RestoreOutcome[]> {
  const user = await requireUser();
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (rows.length > RESTORE_CHUNK) throw new Error(`At most ${RESTORE_CHUNK} at a time`);

  const valid: RestoreRow[] = [];
  const outcomes: RestoreOutcome[] = [];
  for (const value of rows) {
    const line = typeof (value as { line?: unknown })?.line === "number" ? (value as { line: number }).line : 0;
    const row = toRestoreRow(value, line);
    if (typeof row === "string") {
      outcomes.push({ line, title: "?", result: "failed", message: `Not a row this import produced (${row}).` });
    } else {
      valid.push(row);
    }
  }
  outcomes.push(...(await restoreRows(user.id, valid)));
  revalidatePath("/");
  return outcomes;
}
