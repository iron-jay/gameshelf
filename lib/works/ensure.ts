import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { platforms, works } from "@/lib/db/schema";
import type { IgdbGame, IgdbPlatform } from "@/lib/igdb/types";
import { primaryPlatformFor, releaseDateFor, slugify, sortTitleFor, workKindFor } from "@/lib/igdb/mapping";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EnsuredWork = {
  id: string;
  coverUrl: string | null;
  /** True when this call created it, so the caller knows whether to fetch art. */
  created: boolean;
};

export async function upsertPlatform(tx: Tx, platform: IgdbPlatform | undefined): Promise<number | null> {
  if (!platform) return null;

  const [row] = await tx
    .insert(platforms)
    .values({
      igdbId: platform.id,
      name: platform.name,
      abbreviation: platform.abbreviation ?? null,
      source: "igdb",
    })
    .onConflictDoUpdate({
      target: platforms.igdbId,
      set: { name: platform.name, abbreviation: platform.abbreviation ?? null },
    })
    .returning({ id: platforms.id });

  return row.id;
}

/**
 * Find or create the work for an IGDB game. Shared by add-to-shelf and by the
 * version form, which needs the base game to exist before it can hang a romhack
 * off it.
 */
export async function ensureWorkFromIgdb(tx: Tx, game: IgdbGame, userId: string): Promise<EnsuredWork> {
  const [existing] = await tx
    .select({ id: works.id, coverUrl: works.coverUrl })
    .from(works)
    .where(eq(works.igdbId, game.id));

  if (existing) {
    return { id: existing.id, coverUrl: existing.coverUrl, created: false };
  }

  const base = game.slug ? slugify(game.slug) : slugify(game.name);
  const [clash] = await tx.select({ id: works.id }).from(works).where(eq(works.slug, base));

  // DLC and expansions hang off the base game, but only if that game is already
  // here — we do not fetch parents uninvited. A main_game never has a parent,
  // which the works_parent_required check also enforces.
  const kind = workKindFor(game);
  let parentWorkId: string | null = null;

  if (kind !== "main_game" && game.parent_game) {
    const [parent] = await tx
      .select({ id: works.id })
      .from(works)
      .where(eq(works.igdbId, game.parent_game));
    parentWorkId = parent?.id ?? null;
  }

  const [created] = await tx
    .insert(works)
    .values({
      igdbId: game.id,
      // IGDB slugs are unique upstream, but a local work may already hold this
      // one. The IGDB id is the tiebreak that cannot collide.
      slug: clash ? `${base}-${game.id}` : base,
      title: game.name,
      sortTitle: sortTitleFor(game.name),
      summary: game.summary ?? null,
      firstReleaseDate: releaseDateFor(game),
      workKind: kind,
      parentWorkId,
      igdbPayload: game,
      igdbSyncedAt: new Date(),
      source: "igdb",
      createdBy: userId,
    })
    .returning({ id: works.id, coverUrl: works.coverUrl });

  return { id: created.id, coverUrl: created.coverUrl, created: true };
}

export { primaryPlatformFor };
