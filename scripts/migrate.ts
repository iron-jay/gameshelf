/**
 * Applies migrations, makes sure there is a user, and exits.
 *
 * Bundled by esbuild into the app image and run before the server starts, so
 * one image does both jobs. It cannot simply import what it needs at runtime:
 * Next's standalone output only contains what the app itself imports, and
 * `drizzle-orm/postgres-js/migrator` is not among them. esbuild inlines it.
 *
 * `@node-rs/argon2` stays external because it is a native module and cannot be
 * bundled — it is already in the standalone output, since login uses it.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { hashPassword } from "../lib/auth/password";
import { users } from "../lib/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// One connection, used briefly and closed. This is not the app's pool.
// Notices are silenced because re-running against an up-to-date database emits
// a "schema already exists, skipping" object for every statement, which buries
// the one line anybody actually wants to read in the deploy log.
const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("[migrations] up to date");

  // Deliberately "is there anybody at all", not "is there someone called
  // ADMIN_USERNAME". Renaming the account in settings must not cause the next
  // restart to quietly create a second one.
  const [existing] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .limit(1);

  if (existing) {
    console.log(`[user] ${existing.username} already exists, left alone`);
  } else {
    const username = process.env.ADMIN_USERNAME?.trim() || "admin";
    const password = process.env.ADMIN_PASSWORD;

    if (!password) {
      console.error("[user] ADMIN_PASSWORD must be set to create the first user");
      process.exit(1);
    }

    await db.insert(users).values({
      username,
      displayName: username,
      passwordHash: await hashPassword(password),
      isAdmin: true,
    });

    console.log(`[user] created ${username}`);
  }
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await sql.end();
}
