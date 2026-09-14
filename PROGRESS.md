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

---

## 2026-09-14 — Step 2: auth

**What changed**

- `@node-rs/argon2` over `argon2`. Both dev and prod are Linux now, so the
  original node-gyp argument is weaker, but the prebuilt binding still keeps a
  build toolchain out of the Docker builder stage. OWASP's Argon2id baseline:
  19 MiB, 2 iterations, 1 lane.
- `lib/auth/session.ts` — the cookie carries a 32-byte random token; the
  database stores only its SHA-256 digest. A dump of the `sessions` table is
  then a list of hashes rather than a set of usable logins. 30 day TTL with
  sliding renewal, written only once past the halfway mark so a page view is
  not also a write.
- `lib/auth/index.ts` — `getCurrentUser` wrapped in React `cache`, so a layout
  and the page inside it cost one round trip between them, not two.
- Route group `app/(app)/` with a layout that calls `requireUser()`. Guarding
  there rather than in middleware keeps session validation on the Node runtime
  where the database client already lives, and avoids the edge-runtime trap
  entirely. `/` is unchanged as a URL — route groups do not affect paths.
- `scripts/seed.ts` + `npm run db:seed`. Idempotent, and deliberately does not
  reset the password of an account that already exists.
- Login page, form and sign-out action, styled to section 5b. The error state
  is marked by position and a hairline rather than colour, because `--label` is
  the only chromatic value in the app and it means community provenance.

**Two small decisions worth recording**

Login answers the same message and spends roughly the same time whether the
username is unknown or the password is wrong — `burnVerificationTime` verifies
against a decoy hash — so login cannot double as a username oracle.

The login page counts users and shows a setup notice when there are none. A
self-hosted app where you forgot to seed would otherwise answer every correct
password with "incorrect" and give no hint why.

**Verification**

Driven through a real browser, not just curl: unauthenticated `/` redirects to
`/login`; a wrong password re-renders with the alert and no session; correct
credentials land on the home page with the username in the header. Confirmed
the stored session id is a 64-character SHA-256 hex digest expiring in 30 days,
and that the cookie is invisible to `document.cookie`. Sign-out deletes the row
and both a missing and a forged cookie get 307. The unseeded path was tested by
deleting the user and checking the notice renders.

Typecheck, lint and production build all clean.

**What broke**

- Moving `app/page.tsx` into the route group left stale generated validators in
  `.next/types` referencing the old path, which failed `tsc --noEmit` until
  `.next` was cleared. Worth knowing when routes move.
- A backgrounded dev server started inside a `wsl.exe bash script.sh` call dies
  when that call returns. It needs a persistent handle, and `-H 0.0.0.0` to be
  reachable from a browser on the Windows side. Noted in the README.

**Next**

Step 3: the IGDB client and search page. Results render, nothing persists yet.
All IGDB access behind `lib/igdb/`, Twitch OAuth client-credentials token
cached in the database and refreshed on 401, requests serialised with backoff
rather than fanned out.

This is the point where the placeholder credentials in `.env` stop being good
enough — `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` are needed from
https://dev.twitch.tv/console/apps before step 3 can be tested end to end.
`SGDB_API_KEY` follows at step 6.

---

## 2026-09-14 — Step 3: IGDB client and search

**Schema**

Added `igdb_tokens`, a deliberately single-row table — `id boolean PRIMARY KEY
DEFAULT true` with `CHECK (id)` — for the cached Twitch token. Section 4 asks
for the token to live in the database, and section 2 says to push back before
adding a table, so this was raised rather than assumed. A dedicated table beat a
generic `app_settings` key/value store, which tends to become a junk drawer.
Migration `0001_igdb_tokens.sql`, applied.

**What changed**

- `lib/igdb/token.ts` — client-credentials flow. Credentials go in the POST body
  rather than the query string, because query strings end up in proxy logs. A
  token is treated as spent an hour before Twitch says so, so no request can
  straddle the expiry.
- `lib/igdb/client.ts` — one request at a time, spaced 250ms. A 401 retries once
  with a forced token refresh; a 429 backs off exponentially. The retry happens
  inside the queue, so everything behind it waits too, which is the point. A
  rejected request resolves the queue rather than poisoning it.
- `lib/igdb/search.ts` — apicalypse has no parameter binding, so the search term
  is escaped by hand for quotes and backslashes.
- `app/(app)/search/page.tsx` — one box, local works and IGDB results in one
  list, each row marked. Local works are queried regardless of whether IGDB is
  reachable, so an offline or unconfigured server still finds what it knows.
- IGDB thumbnails render `unoptimized`: most search results are never added, and
  optimising them would have the server fetch and cache art for every result.
  Anything actually added gets its cover downloaded at step 4.

**Verification**

`/search` is behind the session check (307 without a cookie). Searching with a
local work present returns it marked "On your server". With the placeholder
credentials still in `.env`, the Twitch token request returns 400 and the page
renders "IGDB search failed (400). Local results are still shown." rather than
erroring — the degraded path works.

Typecheck, lint and production build clean.

**Live verification**

Credentials added and confirmed against the real API. A search for "ocarina of
time" returns 20 results with years and platforms, no error notice. The token
cache now holds one row: 30-character token, 60 days valid.

The result set is a good sign for the model — alongside the 1998 original it
returned Ship of Harkinian, Zelda 64: Recompiled and a spread of romhacks, which
are exactly the things that will need versions hanging off a work rather than
works of their own.

The SteamGridDB key was checked at the same time: searching "ship of harkinian"
returns that game as the top hit, id 5335518. That is section 4a's rule working
in practice — searching the community version's own name finds its art, where
searching the parent work's title would have returned Ocarina of Time's boxart.

**Next**

Step 4: add-to-shelf creating work, version and entry in one transaction,
with the cover downloaded to `/data/covers` and served locally.

---

## 2026-09-14 — Step 4: add to shelf

**What changed**

- `app/(app)/search/actions.ts` — one transaction creating platform, work,
  version and entry. The IGDB game is refetched by id inside the action rather
  than passed through the form: that payload is what lands in `igdb_payload`,
  and a client-supplied copy is not something to trust.
- Every step is idempotent. Adding the same game twice reuses the work and
  version and answers "Already on your shelf" — the entry insert is
  `onConflictDoNothing` against the `(user_id, version_id)` unique.
- `lib/igdb/mapping.ts` — IGDB category to `work_kind`, slug, sort title
  ("Legend of Zelda: Ocarina of Time, The"), and the platform choice below.
- `lib/covers.ts` + `app/covers/[file]/route.ts` — cover downloaded once on add
  to `COVERS_DIR`, named by work uuid, served through a session-checked route.
  404 rather than 403 throughout, so an unauthenticated caller learns nothing
  about what is on the shelf.
- The download happens **outside** the transaction: it is network I/O that
  should not hold one open, and a failed download must not roll back an
  otherwise correct shelf row. A work with no art is a fine state.

**The bug this step actually turned up**

The first working version of the add flow used `game.platforms[0]` as the
version's platform. That produced an `original` version of Ocarina of Time on
**Wii**, because IGDB's platforms array is in no meaningful order — it returned
`Wii · N64 · 64DD · WiiU`.

That matters more than it looks. An `original` version is what `base_version_id`
points at when a romhack or decomp port is attached, so getting it wrong would
have quietly mis-parented every derived version later. Now `primaryPlatformFor`
takes the earliest entry from `release_dates` and falls back to array order only
when there are no dated releases. Ocarina of Time now lands as N64 / Nintendo 64
/ 1998-11-21.

Worth remembering as a general rule: IGDB array order carries no meaning.

**Verification**

Added The Legend of Zelda: Ocarina of Time through the real UI. Work, version,
entry and platform all correct, `igdb_payload` stored with 4 platforms, cover
downloaded (9,212 bytes) and served from `/covers/<uuid>.jpg`, rendering in the
browser at 264×352. `entry_cards` resolves with `is_community_version = false`.
Adding it again left the counts at 1/1/1. The cover route returns 404
unauthenticated, on path traversal attempts and on malformed filenames.

Typecheck and lint clean.

**Next**

Step 5: the shelf page. Grid of entry_cards, filter by status, platform and
shelf, sorted by added/rated/finished. This is where section 5b's dense grid and
the label band start to matter — though nothing on the shelf is a community
release yet, so the band arrives properly at step 6.
