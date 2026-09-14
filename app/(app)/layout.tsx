import Link from "next/link";

import { requireUser } from "@/lib/auth";

import { logout } from "./actions";

/**
 * Everything in this route group is behind the session check. Guarding here
 * rather than in middleware keeps session validation on the Node runtime, where
 * the database client already lives.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <>
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <nav className="flex items-center gap-5">
          <Link href="/" className="font-medium">
            gameshelf
          </Link>
          <Link href="/search" className="font-narrow text-ink-dim hover:text-ink">
            Search
          </Link>
          <Link href="/add" className="font-narrow text-ink-dim hover:text-ink">
            Add
          </Link>
          <Link href="/stats" className="font-narrow text-ink-dim hover:text-ink">
            Stats
          </Link>
          <Link href="/settings" className="font-narrow text-ink-dim hover:text-ink">
            Settings
          </Link>
        </nav>

        <form action={logout} className="flex items-center gap-4">
          <span className="font-narrow text-ink-dim">{user.displayName ?? user.username}</span>
          <button type="submit" className="font-narrow text-ink-dim hover:text-ink">
            Sign out
          </button>
        </form>
      </header>

      {children}
    </>
  );
}
