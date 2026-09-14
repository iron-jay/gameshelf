# Progress

Dev log. Newest entry at the bottom. Append one at the end of every session:
what changed, what broke, what is next.

---

## 2026-09-14 — Step 1: scaffold, Postgres, Drizzle

**Environment moved to WSL2.** Dev was going to happen on Windows against
`C:\Projects\gameshelf`. It now lives at `~/code/gameshelf` inside Ubuntu 24.04.
The machine had no Node, Docker or WSL installed, so there was nothing to
migrate and the switch cost one setup pass.

The deciding factor was the Postgres bind mount. `./data/postgres` through
Docker Desktop's Windows filesystem bridge fails when the container chowns its
data directory; on ext4 it just works, which it now does. Secondary wins: no
case-insensitivity trap between dev and the Debian target, no `cross-env`, no
native-module friction.

Docker Engine is installed **inside the distro**, not Docker Desktop, so dev
runs the same daemon and the same `docker compose` as the server. systemd is
enabled in `/etc/wsl.conf` to make that work.

**What changed**

- Next 16.3.5 / React 19.2.8 / TypeScript strict / Tailwind v4.
- `lib/db/schema.ts` — Drizzle mirror of `schema.sql`. All 6 enums, 9 tables,
  every index and check constraint. `entry_cards` is declared `.existing()`
  because drizzle should not own a view this shaped.
- `drizzle/0000_init.sql` — generated, then hand-augmented with the four things
  drizzle-kit cannot express: the two extensions (they must run first, since
  `uuid_generate_v4()` is a default nearly everywhere), `touch_updated_at`, both
  triggers, and the view. The view is lifted verbatim out of `schema.sql` by
  `scripts/augment-migration.py` rather than retyped, so the cover rule lives in
  one place.
- `lib/db/index.ts` — postgres.js client pinned to `globalThis` in dev. Without
  that, every hot reload opens another pool and Postgres starts refusing
  connections after a few dozen edits.
- Design tokens from section 5b into `@theme`, Archivo + Archivo Narrow + IBM
  Plex Mono self-hosted via `next/font`. No light mode: the mid-slate ground is
  part of the design, not a preference.
- Dockerfile (standalone output, non-root, migrations copied into the image).
- `app/page.tsx` is a holding page that counts `works`. It exists only to prove
  Server Component → Drizzle → Postgres is live; the shelf replaces it at step 5.

**One change to `schema.sql`**

`entry_cards.cover_url` was `COALESCE(v.cover_url, w.cover_url)`, which hands a
romhack the original's boxart when it has no art of its own. Section 4a calls
that outcome worse than no art at all. Now guarded by a CASE on the same
expression that drives `is_community_version`, so a community version shows its
own art or a placeholder, never the parent's.

**Verification**

Built one database from `schema.sql` and another from the migration and diffed
the dumps: 9 tables, 1 view, 26 indexes and 2 triggers on both sides, identical
apart from auto-generated constraint names (Postgres `_fkey`/`_key` vs Drizzle
`_fk`/`_unique`). Because of that divergence the migration — not `schema.sql` —
is now what actually builds a database. `schema.sql` stays the readable design
reference. The dev database was dropped and rebuilt through
`drizzle-kit migrate`; `drizzle-kit check` reports no drift.

Typecheck clean, production build clean, dev server serves 200 with the row
count rendered.

**What broke**

- `create-next-app` generates its own `CLAUDE.md` and `AGENTS.md`. They were
  excluded from the merge; anyone re-scaffolding needs to watch for that.
- The scaffold's `LayoutProps<"/">` is a Next-generated global that only exists
  after a build, so a clean `tsc --noEmit` failed. Replaced with an explicit
  prop type.
- eslint crashed scanning `data/postgres`, which the container owns as root.
  Added to `globalIgnores`.

**Next**

Step 2, auth: single user seeded from `ADMIN_USERNAME` / `ADMIN_PASSWORD`,
Argon2id hash, DB session cookie against the `sessions` table, protected routes.

Two things to settle first:

- **Argon2 library.** `@node-rs/argon2` (Rust, prebuilt) vs `argon2`
  (node-gyp). Now that dev and prod are both Linux the original reason to avoid
  node-gyp is weaker, but `@node-rs/argon2` still builds faster and has no
  toolchain dependency in the Docker builder stage.
- **IGDB and SteamGridDB credentials.** `.env` currently holds placeholders, so
  nothing past step 3 can be tested end to end. Needed before step 6.

`--color-label` is defined but absent from the compiled CSS — Tailwind v4 emits
only theme variables something actually uses, and no community-release UI
exists yet. Expected; it will appear with the label band.
