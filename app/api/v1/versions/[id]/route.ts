import { revalidatePath } from "next/cache";

import { ApiError, json, uuidParam, withUser } from "@/lib/api";
import { versionDetail } from "@/lib/works/read";
import { deleteFromVersion } from "@/lib/works/removal";

export const dynamic = "force-dynamic";

export const GET = withUser<{ id: string }>(async (_request, { params, user }) => {
  const id = uuidParam((await params).id, "version");
  const detail = await versionDetail(user.id, id);
  if (!detail) throw new ApiError("not_found", "No such version.");
  return json(detail);
});

/**
 * Deletes from a version, as the web's Delete: the whole game (`scope=work`,
 * the default) or only this version (`scope=version`). A game's last version
 * always takes the game. Answers `{ deleted: "work" }` or `{ deleted:
 * "version", workSlug }`.
 */
export const DELETE = withUser<{ id: string }>(async (request, { params }) => {
  const id = uuidParam((await params).id, "version");
  const scope = new URL(request.url).searchParams.get("scope") === "version" ? "version" : "work";
  const result = await deleteFromVersion(id, scope);
  if (!result) throw new ApiError("not_found", "No such version.");
  revalidatePath("/");
  revalidatePath("/off-shelf");
  revalidatePath("/work/[slug]", "page");
  return json(result);
});
