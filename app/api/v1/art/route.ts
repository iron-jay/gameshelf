import { json, withUser } from "@/lib/api";
import { flaggedArt } from "@/lib/art-review";

export const dynamic = "force-dynamic";

/**
 * Cover art to review (`/art`): art applied on a close match, on your shelf.
 * Each opens `/works/{workSlug}/art?version={versionId}`, where keeping it or
 * choosing other art clears the flag.
 */
export const GET = withUser(async (_request, { user }) => json({ items: await flaggedArt(user.id) }));
