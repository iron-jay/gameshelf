import { count, eq } from "drizzle-orm";

import { ApiError, json, uuidParam, withUser } from "@/lib/api";
import { db } from "@/lib/db";
import { versions } from "@/lib/db/schema";
import { inspectVersionRemoval, inspectWorkRemoval } from "@/lib/works/removal";

export const dynamic = "force-dynamic";

/**
 * What Delete on this version would take, as the web's confirmation page says
 * it: `work` for the whole game, and `version` for just this one, null when it
 * is the game's only version (which goes only with the game).
 */
export const GET = withUser<{ id: string }>(async (_request, { params }) => {
  const id = uuidParam((await params).id, "version");
  const [version] = await db.select({ workId: versions.workId }).from(versions).where(eq(versions.id, id));
  if (!version) throw new ApiError("not_found", "No such version.");
  const [siblings] = await db.select({ total: count() }).from(versions).where(eq(versions.workId, version.workId));
  const [work, only] = await Promise.all([inspectWorkRemoval(version.workId), inspectVersionRemoval(id)]);
  return json({ work, version: siblings.total > 1 ? only : null });
});
