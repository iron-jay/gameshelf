import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { formFrom } from "@/lib/api/form";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { addDlcByHandFor, dlcChoices } from "@/lib/dlc-add";

export const dynamic = "force-dynamic";

/**
 * Add DLC, as the web's `/work/{slug}/dlc`: IGDB's DLC for the game in
 * `groups` (`Expansions and DLC`, `Seasons and episodes`), each item an IGDB
 * search result with its short `name`, `kindLabel`, the `platformId` its Add
 * starts on, and `known` (`{ versionId, status }`) when it is here already.
 * `notice` says why IGDB's list is missing; `noneListed` that IGDB has none.
 */
export const GET = withUser<{ slug: string }>(async (_request, { params, user }) => {
  const choices = await dlcChoices(user.id, (await params).slug);
  if (!choices) throw new ApiError("not_found", "No such game.");
  return json(choices);
});

/**
 * DLC IGDB does not list, made by hand under the game: `{ name, kind: "dlc" |
 * "expansion", status }`. 201 with `{ versionId }`.
 */
export const POST = withUser<{ slug: string }>(async (request, { params, user }) => {
  const [game] = await db.select({ id: works.id }).from(works).where(eq(works.slug, (await params).slug));
  if (!game) throw new ApiError("not_found", "No such game.");
  const form = formFrom(await readObject(request), ["name", "kind", "status"]);
  form.set("workId", game.id);
  const outcome = await addDlcByHandFor(user.id, form);
  if (!outcome.ok) throw new ApiError("invalid", outcome.message);
  revalidatePath("/");
  revalidatePath(`/work/${outcome.gameSlug}`);
  return json({ versionId: outcome.versionId }, { status: 201 });
});
