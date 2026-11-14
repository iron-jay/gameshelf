import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { formFrom } from "@/lib/api/form";
import { saveWorkDetails, workDetailsValues } from "@/lib/versions/details";

export const dynamic = "force-dynamic";

/** The game's details as `/work/{slug}/edit` shows them: `{ title, releaseDate, summary }`, strings. */
export const GET = withUser<{ slug: string }>(async (_request, { params }) => {
  const values = await workDetailsValues((await params).slug);
  if (!values) throw new ApiError("not_found", "No such game.");
  return json(values);
});

/** Saves them by the page's rules; a refusal is `invalid` with its message. Answers as GET. */
export const PUT = withUser<{ slug: string }>(async (request, { params }) => {
  const slug = (await params).slug;
  const result = await saveWorkDetails(slug, formFrom(await readObject(request), ["title", "releaseDate", "summary"]));
  if (!result.ok) throw new ApiError(result.message === "That game no longer exists." ? "not_found" : "invalid", result.message);
  revalidatePath("/");
  revalidatePath(`/work/${slug}`);
  revalidatePath("/version/[id]", "page");
  revalidatePath("/series/[name]", "page");
  return json(await workDetailsValues(slug));
});
