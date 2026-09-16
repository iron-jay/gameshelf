"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { parseGrouvee, type GrouveeItem, type GrouveeParse } from "@/lib/import/grouvee";
import { IMPORT_CHUNK, type ImportChunkResult } from "@/lib/import/constants";
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
