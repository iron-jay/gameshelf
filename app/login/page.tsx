import { count } from "drizzle-orm";
import { redirect } from "next/navigation";

import { authDisabled, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Both cases land in the same place: with sign-in off there is no form
  // worth showing, and signed in there is nothing to sign in to.
  if (authDisabled() || (await getCurrentUser())) {
    redirect("/");
  }

  // A self-hosted app where you forgot to seed would otherwise answer every
  // correct password with "incorrect" and give no hint why.
  const [row] = await db.select({ n: count() }).from(users);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-xs border border-line bg-panel p-6">
        <h1 className="mb-6 text-xl font-medium">gameshelf</h1>

        {row.n === 0 ? (
          <p className="font-narrow text-ink-dim">
            No user has been created yet. Run <span className="font-mono">npm run db:seed</span> to
            create one from <span className="font-mono">ADMIN_USERNAME</span> and{" "}
            <span className="font-mono">ADMIN_PASSWORD</span>.
          </p>
        ) : (
          <LoginForm />
        )}
      </div>
    </main>
  );
}
