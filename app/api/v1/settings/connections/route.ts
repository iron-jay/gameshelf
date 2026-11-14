import { json, withUser } from "@/lib/api";
import { checkServices } from "@/lib/connections";

export const dynamic = "force-dynamic";

/** Settings → Check connections: a real request to IGDB and SteamGridDB, `{ igdb, sgdb }` each `{ ok, detail }`. */
export const POST = withUser(async () => json(await checkServices()));
