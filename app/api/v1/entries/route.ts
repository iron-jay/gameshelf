import { ApiError, json, readObject, withUser } from "@/lib/api";
import { entryJson } from "@/lib/api/cards";
import { refreshEntryPages } from "@/lib/api/refresh";
import { entryIdFor, shelveVersion } from "@/lib/entries";
import { addFromIgdb } from "@/lib/entries/add";
import { readGameDraft, type GameDraft } from "@/lib/entries/draft";
import { entryDetail } from "@/lib/entries/read";
import { IgdbError, IgdbNotConfiguredError } from "@/lib/igdb/types";
import { isStatus, type Status } from "@/lib/status";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

/**
 * Puts something on your shelf, from either half of search:
 *
 * - `{ igdbId, platformId?, shelf?, details? }` for an IGDB result, which
 *   creates the work and its original version the way the web's search does.
 *   `details` (`{ title, releaseDate, summary, series }`, as
 *   `GET /catalogue/igdb/{id}` gives them) are what a game not here yet is
 *   saved with; a game already here ignores them.
 * - `{ versionId, shelf? }` for anything already on the server, romhacks and
 *   ports included.
 *
 * 201 when it was added, 200 when it was already there; an entry already on
 * the shelf keeps its shelf. `keptOn` names the platform the existing
 * original version is on when a different one was asked for.
 */
export const POST = withUser(async (request, { user }) => {
  const body = await readObject(request);

  let shelf: Status = "backlog";
  if (body.shelf !== undefined) {
    if (!isStatus(body.shelf)) {
      throw new ApiError("invalid", "Not one of the shelves /meta lists.", {
        fields: { shelf: "Unknown shelf." },
      });
    }
    shelf = body.shelf;
  }

  let versionId: string;
  let created: boolean;
  let keptOn: string | null = null;

  if (body.versionId !== undefined) {
    if (typeof body.versionId !== "string" || !isUuid(body.versionId)) {
      throw new ApiError("not_found", "No such version.");
    }
    const result = await shelveVersion(user.id, body.versionId, shelf);
    if (!result) throw new ApiError("not_found", "No such version.");
    versionId = body.versionId;
    created = result.created;
  } else if (body.igdbId !== undefined) {
    if (!Number.isInteger(body.igdbId) || (body.igdbId as number) <= 0) {
      throw new ApiError("invalid", "igdbId must be a positive whole number.", {
        fields: { igdbId: "Invalid." },
      });
    }
    const platformId = Number.isInteger(body.platformId) ? (body.platformId as number) : null;

    let draft: GameDraft | undefined;
    if (body.details !== undefined && body.details !== null) {
      if (typeof body.details !== "object" || Array.isArray(body.details)) {
        throw new ApiError("invalid", "details must be an object.", { fields: { details: "Invalid." } });
      }
      const details = body.details as Record<string, unknown>;
      const read = readGameDraft((field) => details[field]);
      if (!read.ok) throw new ApiError("invalid", read.message, { fields: { details: read.message } });
      draft = read.draft;
    }

    let result;
    try {
      result = await addFromIgdb(user.id, { igdbId: body.igdbId as number, platformId, status: shelf, draft });
    } catch (err) {
      if (err instanceof IgdbNotConfiguredError) {
        throw new ApiError("upstream", "This server has no IGDB credentials.");
      }
      if (err instanceof IgdbError) {
        throw new ApiError("upstream", `IGDB request failed (${err.status ?? "no response"}).`);
      }
      throw err;
    }
    if (result.kind === "gone") throw new ApiError("not_found", "IGDB no longer has that game.");

    versionId = result.versionId;
    created = result.kind === "added";
    keptOn = result.keptOn;
  } else {
    throw new ApiError("invalid", "Send an igdbId or a versionId.", {
      fields: { igdbId: "One of these is required.", versionId: "One of these is required." },
    });
  }

  refreshEntryPages(versionId);

  // The entry exists by now on both paths, so this only looks it up.
  const entryId = await entryIdFor(versionId, user.id);
  const detail = entryId ? await entryDetail(user.id, entryId) : null;
  if (!detail) throw new ApiError("internal", "The entry could not be read back.");

  return json({ ...entryJson(detail), keptOn }, { status: created ? 201 : 200 });
});
