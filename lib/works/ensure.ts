import { eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { platforms, works } from "@/lib/db/schema";
import type { IgdbGame, IgdbPlatform } from "@/lib/igdb/types";
import { platformNameFor, primaryPlatformFor, releaseDateFor, seriesFor, slugify, sortTitleFor, workKindFor } from "@/lib/igdb/mapping";
import { canonicalSeries } from "@/lib/series";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EnsuredWork = {
  id: string;
  coverUrl: string | null;
  /** True when this call created it, so the caller knows whether to fetch art. */
  created: boolean;
};

export async function upsertPlatform(tx: Tx, platform: IgdbPlatform | undefined): Promise<number | null> {
  if (!platform) return null;

  // Named through platformNameFor on both paths, or the conflict branch would
  // put IGDB's own spelling back the next time a game on it is added.
  const name = platformNameFor(platform);

  const [row] = await tx
    .insert(platforms)
    .values({
      igdbId: platform.id,
      name,
      abbreviation: platform.abbreviation ?? null,
      source: "igdb",
    })
    .onConflictDoUpdate({
      target: platforms.igdbId,
      set: { name, abbreviation: platform.abbreviation ?? null },
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

  // Matched against the series already here, so IGDB's "Destiny" joins a
  // hand-typed "destiny" rather than standing beside it in the grouping. Read
  // through the transaction so a second game added in the same batch sees the
  // first one's series.
  const known = await tx
    .selectDistinct({ series: works.series })
    .from(works)
    .where(isNotNull(works.series));
  const series = canonicalSeries(
    seriesFor(game) ?? "",
    known.map((row) => row.series).filter((name): name is string => Boolean(name)),
  );

  const [created] = await tx
    .insert(works)
    .values({
      igdbId: game.id,
      // IGDB slugs are unique upstream, but a local work may already hold this
      // one. The IGDB id is the tiebreak that cannot collide.
      slug: clash ? `${base}-${game.id}` : base,
      title: game.name,
      // Matched against the series already here, so IGDB's "Destiny" joins a
      // hand-typed "destiny" rather than standing beside it in the grouping.
      series: series || null,
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

  // DLC added before its game was left without one. Now the game is here, it
  // takes them in: IGDB's parent_game is in each one's stored payload.
  await tx.execute(sql`
    UPDATE works SET parent_work_id = ${created.id}
    WHERE parent_work_id IS NULL
      AND work_kind <> 'main_game'
      AND id <> ${created.id}
      AND igdb_payload ? 'parent_game'
      AND (igdb_payload->>'parent_game')::int = ${game.id}
  `);

  return { id: created.id, coverUrl: created.coverUrl, created: true };
}

export { primaryPlatformFor };
