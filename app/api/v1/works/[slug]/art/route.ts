import { ApiError, json, readObject, withUser } from "@/lib/api";
import { applyGrid, applyReference, artState, resolveArt, uploadArtBytes, type ArtResult } from "@/lib/art-changes";

export const dynamic = "force-dynamic";

function versionOf(request: Request): string | null {
  return new URL(request.url).searchParams.get("version") || null;
}

/**
 * `/work/{slug}/art` as data, `?version=` for a version's own: `title`,
 * `versionName`, `coverUrl`, `needsReview`, and `seedTitle` (a community
 * release searches on its own name, never its game's, §4a). Grids are
 * `GET …/art/candidates`.
 */
export const GET = withUser<{ slug: string }>(async (request, { params }) => {
  const state = await artState((await params).slug, versionOf(request));
  if (!state) throw new ApiError("not_found", "That no longer exists.");
  return json(state);
});

/**
 * Changes the art, as the page's three ways: `{ do: "grid", imageUrl,
 * sgdbGameId }` (a candidate), `{ do: "reference", reference }` (a
 * SteamGridDB link or id), or a multipart body with the image as `file`
 * (JPEG, PNG or WebP, 8 MB). Answers `{ ok, message, art }`, the page's
 * message and the state after.
 */
export const POST = withUser<{ slug: string }>(async (request, { params }) => {
  const slug = (await params).slug;
  const resolved = await resolveArt(slug, versionOf(request));
  if (!resolved) throw new ApiError("not_found", "That no longer exists.");

  let result: ArtResult;
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const file = (await request.formData().catch(() => null))?.get("file");
    result =
      file instanceof File && file.size > 0
        ? await uploadArtBytes(resolved, await file.arrayBuffer(), file.type)
        : { ok: false, message: "Choose an image file." };
  } else {
    const body = await readObject(request);
    const text = (name: string) => (typeof body[name] === "string" ? (body[name] as string).trim() : "");
    if (body.do === "grid") result = await applyGrid(resolved, text("imageUrl"), Number(body.sgdbGameId) || null);
    else if (body.do === "reference") result = await applyReference(resolved, text("reference"));
    else throw new ApiError("invalid", "do is grid or reference.", { fields: { do: "grid or reference." } });
  }
  return json({ ...result, art: await artState(slug, versionOf(request)) });
});
