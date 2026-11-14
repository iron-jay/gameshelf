import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, uuidParam, withUser } from "@/lib/api";
import { formFrom } from "@/lib/api/form";
import { saveVersionDetails, versionEditForm } from "@/lib/versions/details";

export const dynamic = "force-dynamic";

const FIELDS = ["name", "kind", "platformName", "author", "versionLabel", "releaseDate", "url", "notes", "baseVersionId"] as const;

/**
 * `/version/{id}/edit` as data: `values` (strings, as the form has them),
 * `kinds` (`{ value, label }`), `platforms` in use and `siblings` it can be
 * based on.
 */
export const GET = withUser<{ id: string }>(async (_request, { params }) => {
  const form = await versionEditForm(uuidParam((await params).id, "version"));
  if (!form) throw new ApiError("not_found", "No such version.");
  return json(form);
});

/** Saves `values` by the page's rules; a refusal is `invalid` with its message. Answers as GET. */
export const PUT = withUser<{ id: string }>(async (request, { params }) => {
  const id = uuidParam((await params).id, "version");
  const form = formFrom(await readObject(request), FIELDS);
  form.set("versionId", id);
  const result = await saveVersionDetails(form);
  if (!result.ok) throw new ApiError(result.message === "That version no longer exists." ? "not_found" : "invalid", result.message);
  revalidatePath("/");
  revalidatePath(`/version/${id}`);
  if (result.workSlug) revalidatePath(`/work/${result.workSlug}`);
  return json(await versionEditForm(id));
});
