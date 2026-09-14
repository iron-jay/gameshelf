/**
 * Create the single user named by ADMIN_USERNAME / ADMIN_PASSWORD.
 *
 *     npm run db:seed
 *
 * Idempotent: an existing user is reported and left alone. It deliberately does
 * not reset the password of an account that already exists — changing someone's
 * credentials as a side effect of running a setup script is a nasty surprise.
 */
import { eq } from "drizzle-orm";

import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

async function main(): Promise<number> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error("ADMIN_USERNAME and ADMIN_PASSWORD must both be set in .env");
    return 1;
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username));

  if (existing) {
    console.log(`[exists] ${username} — left unchanged`);
    return 0;
  }

  const [created] = await db
    .insert(users)
    .values({
      username,
      displayName: username,
      passwordHash: await hashPassword(password),
      isAdmin: true,
    })
    .returning({ id: users.id });

  console.log(`[created] ${username} (${created.id})`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
