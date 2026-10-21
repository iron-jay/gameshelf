import { eq } from "drizzle-orm";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { versions, works } from "@/lib/db/schema";
import { isUuid } from "@/lib/uuid";
import { isCommunityKind } from "@/lib/works/read";

/*
 * What a game's tab says. The root layout adds " · gameshelf", so these are
 * only the part before it, and a miss falls back to the layout's bare name
 * while the page itself answers with its 404.
 *
 * Each checks the session first: metadata resolves beside the layout rather
 * than after it, and a title is as much a game's name as the page is.
 */

function titled(name: string | undefined, prefix?: string): Metadata {
  if (!name) return {};
  return { title: prefix ? `${prefix} ${name}` : name };
}

export async function workTitle(slug: string, prefix?: string): Promise<Metadata> {
  await requireUser();
  const [row] = await db.select({ title: works.title }).from(works).where(eq(works.slug, slug));
  return titled(row?.title, prefix);
}

/** Named as its page's heading is: a romhack by its own name, a release by its game's. */
export async function versionTitle(id: string, prefix?: string): Promise<Metadata> {
  await requireUser();
  if (!isUuid(id)) return {};
  const [row] = await db
    .select({ name: versions.name, kind: versions.kind, title: works.title })
    .from(versions)
    .innerJoin(works, eq(works.id, versions.workId))
    .where(eq(versions.id, id));
  if (!row) return {};
  return titled(isCommunityKind(row.kind) ? row.name : row.title, prefix);
}
