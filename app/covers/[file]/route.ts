import { getCurrentUser } from "@/lib/auth";
import { contentTypeFor, COVER_FILENAME, readCover } from "@/lib/covers";

/**
 * Covers live outside the public directory because /data is a bind mount, so
 * they are served from here instead. 404 rather than 403 throughout: an
 * unauthenticated caller learns nothing about what is on the shelf.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const notFound = new Response("Not found", { status: 404 });

  if (!(await getCurrentUser())) return notFound;

  const { file } = await params;
  if (!COVER_FILENAME.test(file)) return notFound;

  try {
    return new Response(await readCover(file), {
      headers: {
        "Content-Type": contentTypeFor(file),
        // The filename carries a uuid and its content never changes.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return notFound;
  }
}
