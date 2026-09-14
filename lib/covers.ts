import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Must be absolute, in dev as well as in the container.
 *
 * Resolving a relative path would mean joining against `process.cwd()`, and the
 * bundler reads that as "this filesystem access is scoped to the project" and
 * traces the entire tree into the server bundle. Covers are runtime data on a
 * bind mount and belong outside the project anyway.
 */
export function coversDir(): string {
  const configured = process.env.COVERS_DIR;
  if (!configured) {
    throw new Error("COVERS_DIR is not set");
  }
  if (!path.isAbsolute(configured)) {
    throw new Error(`COVERS_DIR must be an absolute path, got "${configured}"`);
  }
  return configured;
}

/**
 * Covers are runtime data on a bind mount, never build input.
 *
 * Without the opt-out the bundler treats a computed filesystem path as a
 * directory asset and tries to walk the whole project into the server bundle —
 * which is slow at best, and fails the build outright if anything in the tree
 * is unreadable.
 */
function coverPath(filename: string): string {
  return path.join(/* turbopackIgnore: true */ coversDir(), filename);
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Guards the cover route against path traversal and anything not written here. */
export const COVER_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function contentTypeFor(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".") + 1);
  return (
    Object.keys(EXTENSIONS).find((type) => EXTENSIONS[type] === ext) ?? "application/octet-stream"
  );
}

/**
 * A Blob rather than the raw bytes: since TypeScript 5.7 a Node Buffer is a
 * `Uint8Array<ArrayBufferLike>`, which is not assignable to `BodyInit`, and a
 * Blob is the way through that without an assertion.
 */
export async function readCover(filename: string): Promise<Blob> {
  return new Blob([await readFile(coverPath(filename))]);
}

/**
 * Returns the stored filename, or null if the download failed. A missing cover
 * is not worth failing an add over — the entry is still correct without art,
 * and it can be fetched again later.
 */
export async function downloadCover(url: string, basename: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;

    const type = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const ext = EXTENSIONS[type];
    if (!ext) return null;

    const filename = `${basename}.${ext}`;

    await mkdir(coversDir(), { recursive: true });
    await writeFile(coverPath(filename), new Uint8Array(await res.arrayBuffer()));

    return filename;
  } catch {
    return null;
  }
}
