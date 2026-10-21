import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { versions, works } from "@/lib/db/schema";
import { placeIgdbGame } from "@/lib/entries/add";
import { updateEntry } from "@/lib/entries";
import type { IgdbGame } from "@/lib/igdb/types";
import type { Status } from "@/lib/status";
import { primaryPlatformFor } from "@/lib/works/ensure";

/**
 * Games on the server that never reach your shelf, so nothing on it leads to
 * them (Jay, 2026-10-21). A game stands on the shelf through an entry on one of
 * its versions; these have none of yours. Some are left over — a game taken
 * off the shelf, an original whose romhacks moved to games of their own in
 * 0011 and took its only versions with them, a standalone expansion
 * pre-filled before #25 — and some are here on purpose for something you have.
 *
 * DLC under a game is left out: it is listed on its game's page, which is where
 * it lives. Its game is listed here if that is off the shelf too.
 */

export type OffShelfGame = {
  workId: string;
  slug: string;
  title: string;
  workKind: string;
  year: number | null;
  coverUrl: string | null;
  fromIgdb: boolean;
  versionCount: number;
  /** The one version a shelf press lands on, when there is exactly one. */
  versionId: string | null;
  versionName: string | null;
  /** A standalone expansion's game. */
  parentTitle: string | null;
  /** Romhacks made from it. */
  romhacks: string[];
  /** It holds DLC or romhacks that are on your shelf: here for them. */
  holdsShelved: boolean;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  work_kind: string;
  first_release_date: string | null;
  cover_url: string | null;
  igdb_id: number | null;
  version_count: number;
  version_id: string | null;
  version_name: string | null;
  parent_title: string | null;
  romhacks: string[] | null;
  holds_shelved: boolean;
};

export async function offShelfGames(userId: string): Promise<OffShelfGame[]> {
  const rows = await db.execute<Row>(sql`
    SELECT w.id, w.slug, w.title, w.work_kind, w.first_release_date, w.cover_url, w.igdb_id,
      (SELECT count(*)::int FROM versions v WHERE v.work_id = w.id) AS version_count,
      (SELECT v.id FROM versions v WHERE v.work_id = w.id ORDER BY v.created_at, v.id LIMIT 1) AS version_id,
      (SELECT v.name FROM versions v WHERE v.work_id = w.id ORDER BY v.created_at, v.id LIMIT 1) AS version_name,
      p.title AS parent_title,
      (SELECT array_agg(h.title ORDER BY h.title) FROM works h WHERE h.based_on_work_id = w.id) AS romhacks,
      EXISTS (
        SELECT 1 FROM works c
        JOIN versions cv ON cv.work_id = c.id
        JOIN entries ce ON ce.version_id = cv.id AND ce.user_id = ${userId}
        WHERE c.based_on_work_id = w.id
           OR (c.parent_work_id = w.id AND c.work_kind <> 'standalone_expansion')
      ) AS holds_shelved
    FROM works w
    LEFT JOIN works p ON p.id = w.parent_work_id
    WHERE NOT EXISTS (
        SELECT 1 FROM versions v
        JOIN entries e ON e.version_id = v.id AND e.user_id = ${userId}
        WHERE v.work_id = w.id
      )
      -- A DLC with a way to play is reachable from its game's page. One with
      -- none is stuck there too, so it is listed.
      AND (
        w.parent_work_id IS NULL
        OR w.work_kind = 'standalone_expansion'
        OR NOT EXISTS (SELECT 1 FROM versions v WHERE v.work_id = w.id)
      )
    ORDER BY coalesce(w.sort_title, w.title), w.id
  `);

  return rows.map((row) => ({
    workId: row.id,
    slug: row.slug,
    title: row.title,
    workKind: row.work_kind,
    year: row.first_release_date ? Number(String(row.first_release_date).slice(0, 4)) : null,
    coverUrl: row.cover_url,
    fromIgdb: row.igdb_id !== null,
    versionCount: row.version_count,
    versionId: row.version_count === 1 ? row.version_id : null,
    versionName: row.version_count === 1 ? row.version_name : null,
    parentTitle: row.parent_title,
    romhacks: row.romhacks ?? [],
    holdsShelved: row.holds_shelved,
  }));
}

/**
 * Puts a game listed here on a shelf in one press. A game with one way to play
 * goes on in that one, by the version page's rules. A game from IGDB with none
 * first gets its own release back from the payload stored on add — the same
 * row an add from IGDB makes, so no request is needed. False when there is no
 * one obvious way to play: several to choose from, or a local game with none.
 */
export async function shelveOffShelfGame(userId: string, workId: string, status: Status): Promise<boolean> {
  const [work] = await db
    .select({ igdbPayload: works.igdbPayload })
    .from(works)
    .where(eq(works.id, workId));
  if (!work) return false;

  const own = await db
    .select({ id: versions.id })
    .from(versions)
    .where(eq(versions.workId, workId))
    .orderBy(asc(versions.createdAt));
  if (own.length > 1) return false;

  let versionId = own[0]?.id;
  if (!versionId) {
    const game = work.igdbPayload as IgdbGame | null;
    if (!game?.id) return false;
    const placed = await db.transaction((tx) => placeIgdbGame(tx, userId, game, primaryPlatformFor(game), null));
    versionId = placed.versionId;
  }

  return updateEntry(userId, versionId, { status });
}
