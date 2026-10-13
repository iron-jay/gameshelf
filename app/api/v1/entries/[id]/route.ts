import { ApiError, json, readObject, uuidParam, withUser } from "@/lib/api";
import { entryJson } from "@/lib/api/cards";
import { refreshEntryPages } from "@/lib/api/refresh";
import { isCompletion, removeEntry, updateEntry, type EntryChanges } from "@/lib/entries";
import { entryDetail, versionIdForEntry } from "@/lib/entries/read";
import { isStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

async function detailOrNotFound(userId: string, entryId: string) {
  const detail = await entryDetail(userId, entryId);
  if (!detail) throw new ApiError("not_found", "No such entry.");
  return detail;
}

/** One entry: its card, plus the review, the private flag and its tags. */
export const GET = withUser<{ id: string }>(async (_request, { params, user }) => {
  const id = uuidParam((await params).id, "entry");
  return json(entryJson(await detailOrNotFound(user.id, id)));
});

/**
 * Turns a PATCH body into changes, refusing the whole body if any field is
 * wrong. A partial save would leave the phone showing values the server never
 * took, and every field it names is one it meant to change.
 */
function changesFrom(body: Record<string, unknown>): EntryChanges {
  const changes: EntryChanges = {};
  const fields: Record<string, string> = {};

  const flag = (key: "reviewHasSpoilers" | "isFavourite" | "isPrivate") => {
    if (!(key in body)) return;
    if (typeof body[key] === "boolean") changes[key] = body[key];
    else fields[key] = "Must be true or false.";
  };

  for (const key of Object.keys(body)) {
    switch (key) {
      case "shelf":
        if (isStatus(body.shelf)) changes.status = body.shelf;
        else fields.shelf = "Not one of the shelves /meta lists.";
        break;
      case "rating": {
        const value = body.rating;
        if (value === null) changes.rating = null;
        else if (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 10)
          changes.rating = value as number;
        else fields.rating = "A whole number from 1 to 10, or null.";
        break;
      }
      case "review":
        if (body.review === null || typeof body.review === "string") changes.review = body.review;
        else fields.review = "Text, or null.";
        break;
      case "completion":
        if (body.completion === null || isCompletion(body.completion))
          changes.completion = body.completion;
        else fields.completion = "credits, completed, mastered, or null.";
        break;
      case "reviewHasSpoilers":
      case "isFavourite":
      case "isPrivate":
        flag(key);
        break;
      default:
        fields[key] = "Not a field that can be changed.";
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new ApiError("invalid", "Some fields could not be saved.", { fields });
  }
  return changes;
}

/**
 * Changes any of shelf, rating, review, reviewHasSpoilers, isFavourite,
 * isPrivate and completion. Fields left out are left alone. Marking something
 * finished is `{ shelf: "played", completion: "credits" }`, the same pair the
 * web's buttons set.
 */
export const PATCH = withUser<{ id: string }>(async (request, { params, user }) => {
  const id = uuidParam((await params).id, "entry");
  const changes = changesFrom(await readObject(request));

  const versionId = await versionIdForEntry(user.id, id);
  if (!versionId) throw new ApiError("not_found", "No such entry.");

  await updateEntry(user.id, versionId, changes);
  refreshEntryPages(versionId);
  return json(entryJson(await detailOrNotFound(user.id, id)));
});

/**
 * Takes it off your shelf, with its rating, review, tags and recorded plays.
 * The game itself stays on the server; deleting that is a web-only job with a
 * confirmation page.
 */
export const DELETE = withUser<{ id: string }>(async (_request, { params, user }) => {
  const id = uuidParam((await params).id, "entry");
  const versionId = await versionIdForEntry(user.id, id);
  if (!versionId || !(await removeEntry(user.id, id))) {
    throw new ApiError("not_found", "No such entry.");
  }

  refreshEntryPages(versionId);
  return new Response(null, { status: 204 });
});
