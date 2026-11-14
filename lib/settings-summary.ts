import { and, count, isNotNull, isNull } from "drizzle-orm";

import { listCoverFiles } from "@/lib/covers";
import { db } from "@/lib/db";
import { entries, igdbTokens, works } from "@/lib/db/schema";
import { offShelfGames } from "@/lib/off-shelf";
import { orphanedCoverFiles } from "@/lib/works/removal";

/** The counts and states Settings shows beside each section, shared with the phone's `GET /settings`. */
export async function settingsSummary(userId: string) {
  const [token] = await db.select().from(igdbTokens).limit(1);
  const [entryTotal] = await db.select({ total: count() }).from(entries);
  const coverFiles = await listCoverFiles();
  const orphans = await orphanedCoverFiles(coverFiles);
  const [fromIgdbRow] = await db.select({ total: count() }).from(works).where(isNotNull(works.igdbId));
  const [seriesLessRow] = await db
    .select({ total: count() })
    .from(works)
    .where(and(isNotNull(works.igdbId), isNull(works.series)));
  return {
    // Whether each secret is present, never any part of its value.
    credentials: {
      igdbClientId: Boolean(process.env.IGDB_CLIENT_ID),
      igdbClientSecret: Boolean(process.env.IGDB_CLIENT_SECRET),
      sgdbApiKey: Boolean(process.env.SGDB_API_KEY),
    },
    igdbTokenExpires: token ? token.expiresAt.toISOString().slice(0, 10) : null,
    entries: entryTotal.total,
    coverFiles: coverFiles.length,
    orphans: orphans.length,
    fromIgdb: fromIgdbRow.total,
    seriesless: seriesLessRow.total,
    offShelf: (await offShelfGames(userId)).length,
  };
}
