import { and, asc, eq, isNull } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/lib/db";
import { platforms, versions, works } from "@/lib/db/schema";
import { artForPlaced, placeIgdbGame, type Placed } from "@/lib/entries/add";
import { getDlcOfGame } from "@/lib/igdb/games";
import { primaryPlatformFor } from "@/lib/igdb/mapping";
import type { IgdbGame } from "@/lib/igdb/types";

/**
 * A game's DLC is there under it without being added one at a time (Jay,
 * 2026-10-20), so each one only needs its shelf pressed. The first time the
 * game's page is opened, IGDB's DLC for it become works and versions here —
 * no entries, so nothing lands on the shelf — and their covers follow once
 * the page has been sent. Once per game; "Add DLC" lists anything newer.
 *
 * Every failure is quiet: offline, or no IGDB credentials, the page shows
 * the DLC already here and the next visit tries again.
 */
export async function fillDlcOnce(userId: string, workId: string): Promise<void> {
  // Claimed before IGDB is asked, so two pages opened at once fill it once.
  const [claimed] = await db
    .update(works)
    .set({ dlcFilledAt: new Date() })
    .where(and(eq(works.id, workId), isNull(works.dlcFilledAt)))
    .returning({ igdbId: works.igdbId });
  if (!claimed?.igdbId) return;

  let found: IgdbGame[];
  try {
    found = await getDlcOfGame(claimed.igdbId);
  } catch {
    await db.update(works).set({ dlcFilledAt: null }).where(eq(works.id, workId));
    return;
  }
  if (found.length === 0) return;

  // DLC is played where the game is, so each starts on the game's platform
  // when it came out there too.
  const [gamePlatform] = await db
    .select({ igdbId: platforms.igdbId })
    .from(versions)
    .innerJoin(platforms, eq(platforms.id, versions.platformId))
    .where(eq(versions.workId, workId))
    .orderBy(asc(versions.createdAt))
    .limit(1);

  const placed: { game: IgdbGame; placed: Placed }[] = await db.transaction(async (tx) => {
    const done = [];
    for (const game of found) {
      const platform =
        (game.platforms ?? []).find((p) => p.id === gamePlatform?.igdbId) ?? primaryPlatformFor(game);
      done.push({ game, placed: await placeIgdbGame(tx, userId, game, platform, null) });
    }
    return done;
  });

  after(async () => {
    for (const one of placed) {
      try {
        await artForPlaced(one.placed, one.game);
      } catch {
        // A cover is a nicety; the placeholder stands until Change art.
      }
    }
  });
}
