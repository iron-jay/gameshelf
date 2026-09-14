import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Absolute in the container, repo-relative in dev. IGDB image URLs rot, so
 * anything on the shelf is served from here rather than from upstream.
 */
export function coversDir(): string {
  return path.resolve(process.env.COVERS_DIR ?? "./data/covers");
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Guards the cover route against path traversal and anything not written here. */
export const COVER_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function contentTypeFor(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".") + 1);
  return Object.keys(EXTENSIONS).find((type) => EXTENSIONS[type] === ext) ?? "application/octet-stream";
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
    await writeFile(path.join(coversDir(), filename), new Uint8Array(await res.arrayBuffer()));

    return filename;
  } catch {
    return null;
  }
}
