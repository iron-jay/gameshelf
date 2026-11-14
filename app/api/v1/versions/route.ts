import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { formFrom } from "@/lib/api/form";
import { CREATE_FIELDS, createVersionFromForm } from "@/lib/versions/create";

export const dynamic = "force-dynamic";

/**
 * A release added by hand, as the web's one add-version form (§5, both
 * doors): `name`, `kind` (`romhack`, `translation`, `decomp_port`, `recomp`,
 * `mod` or `homebrew`), and the base game as `workId` (Door B) or
 * `baseGameIgdbId` (Door A's search), then the form's other fields
 * (`baseVersionId`, `platformName`, `author`, `versionLabel`, `releaseDate`,
 * `url`, `notes`; `series` and `summary` for a new game; `status`; the art
 * chosen as `artUrl`, `artSgdbGameId`, `artConfidence`). Strings, read by the
 * form's rules; a refusal is `invalid` with its message. 201 with `{ workSlug,
 * versionId }`.
 */
export const POST = withUser(async (request, { user }) => {
  const result = await createVersionFromForm(user.id, formFrom(await readObject(request), CREATE_FIELDS));
  if (!result.ok) throw new ApiError("invalid", result.message);
  revalidatePath("/");
  if (result.workSlug) revalidatePath(`/work/${result.workSlug}`);
  return json({ workSlug: result.workSlug, versionId: result.versionId }, { status: 201 });
});
