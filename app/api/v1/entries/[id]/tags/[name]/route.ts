import { ApiError, json, uuidParam, withUser } from "@/lib/api";
import { refreshEntryPages } from "@/lib/api/refresh";
import { tagEntry, tagIdByName, untagEntry } from "@/lib/entries";
import { entryDetail, versionIdForEntry } from "@/lib/entries/read";

export const dynamic = "force-dynamic";

type Params = { id: string; name: string };

/**
 * Tags are addressed by name rather than id, so the phone can tag something
 * with a name nobody has used yet in one call, the way the web's box does.
 */
async function target(params: Promise<Params>, userId: string) {
  const { id, name } = await params;
  const entryId = uuidParam(id, "entry");
  const versionId = await versionIdForEntry(userId, entryId);
  if (!versionId) throw new ApiError("not_found", "No such entry.");
  return { entryId, versionId, name: name.trim() };
}

async function tagsOf(userId: string, entryId: string) {
  return (await entryDetail(userId, entryId))?.tags ?? [];
}

/** Adds the tag, creating it if it is new. Doing it twice is harmless. */
export const PUT = withUser<Params>(async (_request, { params, user }) => {
  const { entryId, versionId, name } = await target(params, user.id);
  if (!name) {
    throw new ApiError("invalid", "A tag needs a name.", { fields: { name: "Required." } });
  }

  await tagEntry(user.id, versionId, name);
  refreshEntryPages(versionId);
  return json({ tags: await tagsOf(user.id, entryId) });
});

/** Removes the tag from this entry. A tag it did not have is already gone. */
export const DELETE = withUser<Params>(async (_request, { params, user }) => {
  const { entryId, versionId, name } = await target(params, user.id);

  const tagId = await tagIdByName(user.id, name);
  if (tagId) {
    await untagEntry(user.id, versionId, tagId);
    refreshEntryPages(versionId);
  }
  return json({ tags: await tagsOf(user.id, entryId) });
});
