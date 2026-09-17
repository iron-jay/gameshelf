import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Move wishlist entries onto the backlog once the game is actually out.
 *
 * Waiting for something is a different thing from owning it and not having
 * started, and the moment it ships the first stops being true on its own. There
 * is no scheduler here — a self-hosted app with one user does not need a job
 * runner for this — so it runs when the shelf is read. It is one statement,
 * idempotent, and touches nothing once everything is caught up.
 *
 * **It only promotes what was wishlisted before release.** Wishlisting a game
 * that is already out is a real thing to do — you want it, you do not own it —
 * and sweeping that onto the backlog the second you saved it would make the
 * wishlist useless for anything but pre-orders. `added_at` before the release
 * date is what separates "I was waiting for this" from "I want this".
 *
 * The version's own date wins over the work's: a port released years later is
 * out when *it* is out, not when the original was.
 */
export async function promoteReleasedWishlist(userId: string): Promise<number> {
  const moved = await db.execute(sql`
    UPDATE entries e
       SET status = 'backlog'
      FROM versions v
      JOIN works w ON w.id = v.work_id
     WHERE v.id = e.version_id
       AND e.user_id = ${userId}
       AND e.status = 'wishlist'
       AND COALESCE(v.release_date, w.first_release_date) <= CURRENT_DATE
       AND e.added_at::date < COALESCE(v.release_date, w.first_release_date)
    RETURNING e.id
  `);

  return moved.length;
}
