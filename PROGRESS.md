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

---

## 2026-09-14 — Step 5: the shelf

**Schema**

`entry_cards` could not answer section 5's "sort by added/rated/finished" —
rating was on the view, the other two were not derivable from it at all.
Migration `0002_entry_cards_sorting.sql` appends `added_at` and
`last_finished_on`, the latter being `max(finished_on)` over the entry's plays,
because a replay is a new play and the latest finish is the meaningful one.
`CREATE OR REPLACE VIEW` only ever appends, so existing columns keep their
positions. The view is lifted from `schema.sql` by the migration script rather
than retyped, same as before.

Title sorting was left out deliberately: it would need `works.sort_title` on the
view and section 5 does not ask for it.

**What changed**

- `app/(app)/page.tsx` replaces the holding page. Status filter, platform
  filter, sort, and the DLC grouping toggle, all as plain links and a GET form —
  no client component, and the whole thing works without JavaScript.
- `app/(app)/shelf-tile.tsx` — dense grid, 1px gaps, no radius, no shadow, no
  hover lift. Metadata is revealed on hover or keyboard focus rather than
  printed under every cover, so the grid stays a wall of art.
- The label band, finally with something to carry: a solid `--label` strip
  across the lower part of a community version's cover, version name and author
  in Archivo Narrow. Official releases get nothing, which is the signal.
- One stagger animation on grid load, the single sanctioned motion in section
  5b, disabled under `prefers-reduced-motion`.

**Two bugs found by checking rather than looking**

*IGDB has deprecated `category`.* It is not merely renamed — the field is absent
from the response entirely, so `workKindFor` silently mapped everything to
`main_game` and Destiny 2: Lightfall came back as a main game with no parent.
The replacement is `game_type`, whose ids match the old category values.
`category` is still read as a fallback for payloads cached before the change.
The lesson is the same as the platform one: a field that is quietly absent
produces a plausible wrong answer, not an error.

*The add flow never set `parent_work_id`.* It mapped the work kind and stopped,
so DLC never hung off its base game and the grouping toggle had nothing to
group. It now resolves `parent_game` against works already present — parents are
never fetched uninvited, and a main_game is never given a parent, which the
`works_parent_required` check also enforces.

**Verification**

With Destiny 2, Lightfall and Shadowkeep added from IGDB: Lightfall and
Shadowkeep are `expansion` with Destiny 2 as parent. The shelf reads "3 entries
· 2 grouped under parents" by default and 5 with grouping off. Status, platform
and sort filters each narrow correctly, and the romhack — which has no platform
— is correctly absent from a platform-filtered view.

The romhack fixture confirms the rule that motivated the section 4a change: it
renders a placeholder and its own label band, never Ocarina of Time's boxart.

Typecheck and lint clean.

**Next**

Step 6 and the point of the whole project: the unified add form plus
SteamGridDB. A romhack through Door A, then the same hack through Door B on an
existing work page. If the two paths need different code, stop and fix the form.

The dev database has a hand-inserted "Master of Time" romhack version standing
in for that flow. It should be deleted and recreated through the real form as
the first real test of step 6.

---

## 2026-09-14 — Step 6: the unified add form and SteamGridDB

This is the step the project exists for, and it works: a romhack added through
Door A and a decomp port added through Door B on the same work, both through the
same component and the same server action.

**SteamGridDB**

- `lib/sgdb/` using the official wrapper, behind the shared request queue that
  `lib/igdb/` now also uses (`lib/rate-limit.ts` — the queue was duplicated
  otherwise).
- `match.ts` normalises case, punctuation, leading articles and stacked edition
  suffixes, then tiers the top result: equal is exact, substring either way is
  fuzzy, anything else is none.
- `scripts/probe-sgdb.ts` exercises it against the live API.

The probe earned its keep immediately. Searching "a title that certainly does
not exist anywhere" returns **A Tithe in Blood** — SteamGridDB always answers
with its best effort, so without tiering we would cheerfully have applied that
art. The tier correctly reads `none` and nothing is written.

Two quality problems it also exposed:

- Every grid comes back with `score: 0`, so sorting by score was a no-op.
  Ordering now falls through to upvotes minus downvotes.
- Grids include Steam's 460x215 banners alongside portrait box art, and "Master
  of Time" was picking a banner. Portrait dimensions are now requested first,
  falling back to anything only when a release has nothing else.

**The form**

One `VersionForm`, two routes. Door A passes no work and gets an inline IGDB
base-game search; Door B passes the work it already knows, which replaces the
search with a fixed line and adds the base-version selector. Nothing about the
doors is duplicated — that was the explicit test in section 9 and it passed
without needing a fix.

Art resolves on blur of the name field through a server action while the rest of
the form is still being filled in. Nothing is persisted until submit: no draft
rows, no orphan cleanup, and abandoning the form leaves no trace.

Section 5's escape hatch is there too — the community form carries a "not based
on anything? add it as homebrew instead" link rather than making anyone invent a
parent. Homebrew creates a local work with its own `original` version, and its
art goes on the work rather than on a version.

**Schema**

`0003_entry_cards_review.sql` appends `cover_needs_review` to the view, following
whichever cover is actually on screen — a community version with no art of its
own shows a placeholder, and a placeholder needs no review.

**Verification**

Door A, "Master of Time": romhack, MelonSpeedruns, v1.2.1, art from SteamGridDB
with `cover_needs_review = true` because the match was fuzzy ("The Legend of
Zelda: Master of Time"), `sgdb_game_id` 5264549 kept for later.

Door B, "Ship of Harkinian": decomp_port, Harbour Masters, `base_version_id`
pointing at the N64 original, exact match so no review flag, id 5335518.

The parent work was untouched by both: still `cover_source = igdb`,
`cover_needs_review = false`. That is the rule from section 4a holding all the
way through — each community version shows its own art and never the original's
boxart. On screen the two of them carry the ochre band and the four official
releases carry nothing at all.

The "covers needing review" filter returns exactly one entry, the fuzzy one.

**Next**

Section 9 says ship after this. Remaining: step 7 entry detail (rating, review,
plays, with "done" defaulting to credits), step 8 shelves, step 9 stats, step 10
export.

Two things deliberately left for later, both from section 4a: the manual art
override (picker seeded with the same title, paste a SteamGridDB URL or id,
direct file upload) and a refresh action. Automatic lookup runs once on add and
never re-runs on its own, which is the intended behaviour — art you have
approved is never silently replaced — but that makes the manual path the only
way to correct a flagged cover, and it is not built yet.

### Runtime data moved out of the project tree

The production build failed, and the cause was worth the detour.

Turbopack does static analysis on filesystem access in server code. Any `fs`
call whose path it cannot fully resolve is treated as a directory asset
reference, and it responds by tracing **the entire project directory** into the
server bundle. With the Postgres volume sitting at `./data/postgres`, that walk
hit a root-owned directory and the build died with `Permission denied`.

Three code-shaped fixes did not work, and it is worth recording why: moving the
volume to `./pgdata` just moved the failure, removing the `"./data/covers"`
string literal did nothing, and an ignored dynamic import of `node:fs/promises`
did not stop the analysis either. Next's own warning names the real remedies —
scope the path statically, or opt out with `path.join(/*turbopackIgnore: true*/
…)` — and the anchor it was actually catching on was `process.cwd()` inside
`coversDir()`.

The fix is therefore two things, and the second matters more than the first:

- `COVERS_DIR` must now be absolute. Resolving a relative path means naming
  `process.cwd()`, which is precisely what tells the bundler the access is
  project-scoped.
- Runtime data lives at `../gameshelf-data/` — `pgdata` and `covers` — rather
  than inside the repository. A database volume and a user's cover library were
  never build input. This is the same root cause as the eslint crash back at
  step 1, which was patched over with an ignore rather than fixed.

Also fixed while here: since TypeScript 5.7 a Node `Buffer` is a
`Uint8Array<ArrayBufferLike>`, which is not assignable to `BodyInit`.
`readCover` returns a `Blob`, which avoids an assertion.

Build is clean, with zero tracing warnings and all seven routes present.

---

## 2026-09-14 — Manual art override (section 4a)

Automatic lookup runs once on add and never re-runs on its own, which is the
intended behaviour — art you have approved is never silently replaced. But that
made the manual path the only way to correct a flagged cover, and it did not
exist, so "Master of Time" was sitting on the shelf flagged with nothing to do
about it.

**What changed**

- `/work/[slug]/art`, optionally `?version=<id>`. One page for both targets; the
  version is re-validated against the work rather than trusted from the query
  string.
- The search box is **seeded with the same title the automatic lookup would
  use** — the version's own name for a community release, the work's title
  otherwise. Opening the picker for Master of Time seeds "Master of Time", not
  "The Legend of Zelda: Ocarina of Time".
- Paste a SteamGridDB URL or bare game id, kept visible rather than behind a
  disclosure, because it is the reliable path for obscure hacks.
- Direct file upload, `cover_source = 'upload'`, capped at 8 MB and limited to
  JPEG, PNG and WebP.
- nsfw and humor art stays filtered out of automatic selection and is available
  here behind a checkbox.
- Choosing art by any of the three routes clears `cover_needs_review`: making
  the choice *is* the review.
- The work page labels the link "Review art" instead of "Change art" when the
  cover is flagged.
- `lookupArt` was doing double duty; grid fetching is now `gridsForGame` so the
  picker and the pasted-id path can share it.

An upload deliberately leaves `sgdb_game_id` alone. Uploading your own art does
not invalidate a match someone made earlier, and a later refresh should still
reuse it.

**Verification**

All three routes exercised against the live API on real rows. Picking from the
grid set `cover_source = steamgriddb` and cleared the flag; pasting
`https://www.steamgriddb.com/game/21202` answered "Cover taken from The Legend
of Zelda: Ocarina of Time" and persisted id 21202; uploading a file set
`cover_source = upload`, cleared the flag, and kept 21202. The shelf's "covers
needing review" filter now returns nothing.

**Known gap: orphaned cover files**

Replacing a cover removes the superseded file, but deleting a work or a version
does not remove its art. Two orphans are sitting in the covers directory right
now from test rows that were deleted directly in SQL. There is no delete UI yet,
so nothing reaches this in normal use — but whoever builds deletion needs to
clear the file too, and a sweep for unreferenced covers would be worth having
before then.

---

## 2026-09-14 — Step 7: entry detail

`/version/[id]` — your entry for one version: status, rating, review, flags and
play history. Shelf tiles now point here rather than at the work page, because
from your own shelf the useful destination is your entry. The work page's
version rows link here too.

**Marking done**

Section 9 is explicit that this must never be a required dropdown, so it is
three buttons: `credits`, `completed`, `mastered`. Each is one click and each
also sets the status to `played`, so finishing a game is a single action rather
than a status change followed by a completion answer. The helper text says
reaching the end is the usual answer, which is the nudge rather than a default
that has to be dismissed.

**What else**

- Rating is ten buttons, 0.5 to 5, mapping onto the 1..10 half-star column, with
  a clear button that only appears once something is rated.
- Every action creates the entry on demand. Opening a version you have not
  shelved and rating it does the obvious thing instead of erroring, and the
  insert is `onConflictDoNothing` with a re-read behind it so two quick clicks
  cannot race into a duplicate.
- Plays are listed newest finish first, and adding one never edits an existing
  one. A replay is a new row, which is the model doing what section 2 says.
- `deletePlay` is scoped to the entry as well as the play id, so an id from
  someone else's shelf does nothing.

Only one client component on the page: the play form. Everything else is a plain
form posting to a server action, so status, rating, review and flags all work
with JavaScript off. The play form is the exception because a play can be
rejected — a finish date before a start date — and saying so without losing what
was typed needs `useActionState`.

**Verification**

Driven against the real app: marking credits set status `played` and completion
`credits` together; rating 4.5 stored as 9; review saved with the spoilers flag.
A play with the finish before the start was refused with "The finish date is
before the start date." and kept the typed values. Two valid plays were added —
a 41.5h run to credits and a 12h replay that was dropped — and a throwaway third
was deleted, 3 rows back down to 2.

`last_finished_on` on `entry_cards` now has something to do: it picks 2026-08-09,
the later of the two finishes, and the shelf's "Recently finished" sort puts
Master of Time first with everything unfinished after it.

**Next**

Step 8 shelves (free-form tags), step 9 stats, step 10 export.
