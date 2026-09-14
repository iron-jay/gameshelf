import { count } from "drizzle-orm";

import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";

// Holding page for build order step 1. Its only job is to prove the chain
// Server Component -> Drizzle -> Postgres is live. The shelf replaces it at
// step 5.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [row] = await db.select({ n: count() }).from(works);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="border border-line bg-panel p-8">
        <h1 className="text-2xl font-medium">gameshelf</h1>
        <p className="mt-2 font-narrow text-ink-dim">
          Database connected. {row.n} works catalogued.
        </p>
      </div>
    </main>
  );
}
