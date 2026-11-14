import { json, withUser } from "@/lib/api";
import { offShelfGames } from "@/lib/off-shelf";

export const dynamic = "force-dynamic";

/**
 * Games not on your shelf (`/off-shelf`): every game here with no entry of
 * yours, as the page groups them. One with a single way to play goes on a
 * shelf in one press (`POST /off-shelf/{workId}`).
 */
export const GET = withUser(async (_request, { user }) => json({ items: await offShelfGames(user.id) }));
