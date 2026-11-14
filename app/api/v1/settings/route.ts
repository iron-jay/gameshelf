import { json, withUser } from "@/lib/api";
import { settingsSummary } from "@/lib/settings-summary";

export const dynamic = "force-dynamic";

/**
 * What Settings says beside each section: `credentials` (whether each secret
 * is set, never its value), `igdbTokenExpires`, `offShelf`, `coverFiles` and
 * `orphans` (files nothing points at), `fromIgdb` and `seriesless` (IGDB
 * games with no series), `entries`.
 */
export const GET = withUser(async (_request, { user }) => json(await settingsSummary(user.id)));
