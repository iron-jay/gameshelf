import { and, eq } from "drizzle-orm";

import { ApiError, json, withUser } from "@/lib/api";
import { db } from "@/lib/db";
import { entries, versions, works } from "@/lib/db/schema";
import { draftFromIgdb } from "@/lib/entries/draft";
import { getGameById } from "@/lib/igdb/games";
import { IgdbError, IgdbNotConfiguredError, igdbImageUrl } from "@/lib/igdb/types";
import { igdbResultFor } from "@/lib/search";

export const dynamic = "force-dynamic";

/**
 * An IGDB game as adding it would save it, for the phone's add sheet to show
 * and edit before `POST /entries` (2026-10-21). Reads only. `details` is null
 * for a game already on the server: it keeps its own.
 */
export const GET = withUser<{ id: string }>(async (_request, { params, user }) => {
  const igdbId = Number((await params).id);
  if (!Number.isInteger(igdbId) || igdbId <= 0) throw new ApiError("not_found", "No such game.");

  let game;
  try {
    game = await getGameById(igdbId);
  } catch (err) {
    if (err instanceof IgdbNotConfiguredError) throw new ApiError("upstream", "This server has no IGDB credentials.");
    if (err instanceof IgdbError) throw new ApiError("upstream", `IGDB request failed (${err.status ?? "no response"}).`);
    throw new ApiError("upstream", "IGDB could not be reached.");
  }
  if (!game) throw new ApiError("not_found", "IGDB no longer has that game.");

  const [here] = await db
    .select({ id: works.id, slug: works.slug, title: works.title })
    .from(works)
    .where(eq(works.igdbId, igdbId));
  const [mine] = here
    ? await db
        .select({ id: entries.id })
        .from(entries)
        .innerJoin(versions, eq(versions.id, entries.versionId))
        .where(and(eq(entries.userId, user.id), eq(versions.workId, here.id), eq(versions.kind, "original")))
        .limit(1)
    : [];
  const result = igdbResultFor(game);

  return json({
    igdbId,
    here: here ? { slug: here.slug, title: here.title } : null,
    entryId: mine?.id ?? null,
    details: here ? null : draftFromIgdb(game),
    coverUrl: game.cover ? igdbImageUrl(game.cover.image_id, "cover_big") : null,
    platforms: result.platformOptions,
    defaultPlatformId: result.defaultPlatformId,
    defaultShelf: result.defaultStatus,
  });
});
