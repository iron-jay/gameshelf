import { json, withUser } from "@/lib/api";
import { shelfPlatforms } from "@/lib/shelf";

export const dynamic = "force-dynamic";

/** Only the platforms on your shelf, so the phone's filter never offers an empty choice. */
export const GET = withUser(async (_request, { user }) => json({ items: await shelfPlatforms(user.id) }));
