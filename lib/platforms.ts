import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { platforms, versions } from "@/lib/db/schema";

/**
 * The platform names the version form offers.
 *
 * Only the ones something is actually on. A row in `platforms` is created the
 * moment IGDB mentions one, so the table accumulates platforms nothing is
 * filed under — a game imported as 64DD and then corrected to Nintendo 64
 * leaves 64DD behind, and offering it again is how the mistake gets repeated.
 *
 * The orphaned row stays: it is keyed on its IGDB id and will be reused rather
 * than duplicated if something genuinely does turn up on that platform. It just
 * has to be typed out once, which is the point.
 */
export async function platformsInUse(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: platforms.name })
    .from(platforms)
    .innerJoin(versions, eq(versions.platformId, platforms.id))
    .orderBy(asc(platforms.name));

  return rows.map((row) => row.name);
}
