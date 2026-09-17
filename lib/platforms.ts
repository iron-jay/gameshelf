import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { platforms, versions } from "@/lib/db/schema";
import type { Tx } from "@/lib/works/ensure";

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

/**
 * The id for a platform name, creating the row if nothing has that name yet.
 *
 * Matched case-insensitively, because the alternative is two rows differing
 * only by a capital letter. A platform IGDB has never heard of becomes a local
 * row, which the schema allows for exactly this.
 */
export async function resolvePlatform(tx: Tx, name: string | null): Promise<number | null> {
  if (!name) return null;

  const [existing] = await tx
    .select({ id: platforms.id })
    .from(platforms)
    .where(sql`lower(${platforms.name}) = lower(${name})`);

  if (existing) return existing.id;

  const [created] = await tx
    .insert(platforms)
    .values({ name, source: "local" })
    .returning({ id: platforms.id });

  return created.id;
}
