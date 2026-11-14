import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { entryCards } from "@/lib/db/schema";

/**
 * Art applied on a close match and flagged for a second look (§4a), on your
 * shelf: shared by `/art` and the phone's `GET /art`. Each opens its version's
 * art page.
 */
export async function flaggedArt(userId: string) {
  const rows = await db
    .select()
    .from(entryCards)
    .where(and(eq(entryCards.userId, userId), eq(entryCards.coverNeedsReview, true)));
  return rows.map((row) => ({
    entryId: row.entryId,
    versionId: row.versionId,
    workSlug: row.workSlug,
    title: row.workTitle,
    subtitle: [row.versionName, row.versionAuthor].filter(Boolean).join(" · "),
    coverUrl: row.coverUrl,
  }));
}
