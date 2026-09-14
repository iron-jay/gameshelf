import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Next's dev server re-evaluates modules on every hot reload. Without pinning
// the client to globalThis each reload opens another pool and Postgres starts
// refusing connections after a few dozen edits.
const globalForDb = globalThis as unknown as { conn?: ReturnType<typeof postgres> };

const conn = globalForDb.conn ?? postgres(connectionString);
if (process.env.NODE_ENV !== "production") {
  globalForDb.conn = conn;
}

export const db = drizzle(conn, { schema });
export { schema };
