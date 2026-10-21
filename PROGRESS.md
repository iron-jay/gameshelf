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

---

## 2026-09-14 — Step 8: shelves

Free-form tags, kept deliberately separate from status. Status is a state
machine holding exactly one value; a game sits on as many shelves as you like.
Section 2 is emphatic about the distinction and the UI now shows it — the two
filters compose, so "Zelda hacks" plus `played` and "Zelda hacks" plus `backlog`
return different single entries from the same shelf.

**What changed**

- `tagWithShelf` / `untagShelf` on the version page. Typing a name that does not
  exist creates it, Goodreads-style: there is no "manage shelves" step to get
  through before you can use one.
- The input is backed by a datalist of the user's existing shelf names, so
  tagging a second game reuses "Zelda hacks" rather than quietly creating a
  near-duplicate that differs by a capital letter.
- Shelf filter on the shelf page, as a subquery against `shelf_entries` rather
  than a join, so it stacks with the status, platform, review and grouping
  filters without changing the row shape.
- `slugify` moved from `lib/igdb/mapping` to `lib/slug`. A user-typed shelf name
  has nothing to do with IGDB; it only lived there because IGDB was the first
  caller.

**Emptying a shelf deletes it**

Removing the last entry from a shelf drops the shelf row. This came out of
testing: a mistyped tag was sitting in the filter dropdown with nothing on it
and no way to get rid of it, and the alternative was a whole shelf-management
screen for a feature whose entire point is that it needs no ceremony. A
free-form tag with nothing on it is nothing.

**Verification**

Two shelves created from the version page, one shared across two entries. The
filter returns 2 for "Zelda hacks" and 1 for "Finished in 2026", and combining
it with a status filter narrows correctly in both directions. Adding "Zelda
hacks" to a second game reused the existing row — two shelves in the table, not
three. A throwaway tag was added and removed, and the shelf row went with it.

**Unused: `shelves.is_pinned`**

The column is in the schema and nothing sets it. Pinning needs somewhere to
pin things to, and the shelf page's filter row is already carrying status,
platform, sort, shelf, grouping and review. Left alone rather than adding a
seventh control nobody asked for.

**Next**

Step 9 stats, step 10 export.

---

## 2026-09-14 — Step 9: stats

One page: a few headline figures, finished per year, platform breakdown. Section
5 says no dashboard sprawl, so there are no cards, no panels and no chart
library — proportion is a one-pixel hairline under each row, enough to read a
shape from without pretending to be a chart.

**What counts as finished**

A play with a finish date and `unfinished` is where you stopped, not where you
got to the end, so only `credits`, `completed` and `mastered` count. The test
data proves the distinction is live: total hours read 53.5 across both plays,
while 2026 shows 1 game and 41.5h, because the 12h replay was dropped.

Years count distinct games rather than plays, so finishing the same game twice in
one year is one game — but the row also says "N finishes including replays" when
the two numbers differ, rather than silently picking one reading.

**Two judgment calls**

*A fourth statistic.* Section 5 names three — finished per year, hours, platform
breakdown — and I added the official-versus-community split. Adding to an
explicit list is exactly the sprawl the brief warns about, so it is worth
justifying: it is one line, and it is the one number this app exists to be able
to show. Easy to remove if it reads as clutter.

*Tabular figures, not mono.* Section 5b restricts mono to literal codes, and
statistics are not codes. `tabular-nums` gives the column alignment that made
mono tempting without breaking the rule. Years are mono, because a year is a
literal code.

**Observation: community versions have no platform**

"No platform" is the largest bucket in the breakdown, holding both community
releases. That is correct data rather than a bug — section 5's community version
form lists Name, Kind, Base game, Base version, Author, Version label, Release
date, URL and Notes, and platform is deliberately not among them.

It does mean a decomp port like Ship of Harkinian, which plainly runs on PC,
cannot be platform-filtered and shows as unplatformed in stats. Not changing the
form, because the field list is explicit — but flagging it, because the brief may
not have anticipated how it would read once the stats page existed.

**Next**

Step 10, export. JSON and CSV of everything, which is the last item in the build
order.

---

## 2026-09-14 — Step 10: export, and the build order is done

JSON and CSV of everything, plus the settings page section 5 puts them on.

**Two shapes, on purpose**

JSON is nested and keeps every play, every shelf membership, and the base
version and parent work by name. CSV is one row per shelf entry with plays
summarised into a count, total hours and first/last dates — the way a Goodreads
export is one row per book. A spreadsheet with a variable number of play columns
would be no use to anyone, and the JSON is there for anything the CSV flattens.

Cached IGDB payloads are excluded, and the export says so in a `note` field.
Portability means your data; `igdb_payload` is upstream catalogue data that can
be fetched again. Including it would have multiplied the file size for something
you do not own.

**Settings**

Credential status is reported as "set" or "not set" and never any part of a
value. The cached token's expiry is shown as a date. "Test connections" makes a
real request to each service rather than checking environment variables,
because "configured" and "working" are different questions and only the second
one is worth answering.

**Verification**

JSON: 200 with the right content type and a dated attachment filename, 6
entries, and Master of Time carrying rating 4.5, both shelves, both plays with
their hours, and its SteamGridDB id. No `igdb_payload` anywhere in the document.

CSV: parsed back with a real RFC 4180 reader rather than a regex. 21 columns, 6
rows, every row the same width. A review containing a comma, embedded double
quotes and a newline round-tripped at exactly its original 143 characters.

Connections: both services answered live — IGDB returned a search result,
SteamGridDB matched "Ship of Harkinian" with 38 grids.

**Three things fixed on the way**

- `aliasedTable` from `drizzle-orm` collapses a select row type to `never` when
  self-joining. The pg-specific `alias` from `drizzle-orm/pg-core` builds a
  properly typed table. Worth remembering: the generic helper is not the one to
  reach for in Postgres code.
- Selecting whole table objects alongside aliases made the same inference worse.
  Explicit columns are more verbose and more predictable.
- `Date.now()` during render trips `react-hooks/purity`. The token expiry is an
  absolute date now, which reads better than a countdown anyway.

---

## Build order complete

All ten steps in section 9 are done and each one runs end to end against the
real APIs. Ship point was step 6; the four steps after it are the refinement the
brief said they would be.

What is deliberately not built, all recorded above in more detail:

- **Deleting a work or version.** No UI for it, and whoever adds one has to
  clear the cover file too — nothing does that today.
- **`shelves.is_pinned`.** In the schema, unused. Pinning needs somewhere to pin
  to, and the filter row is already full.
- **A platform on community versions.** Section 5's form field list does not
  include one, so "No platform" is the largest bucket in the stats. Correct per
  the brief, but it may not have anticipated how that reads.
- **Refreshing art on demand.** Auto-lookup runs once on add and never re-runs,
  which is intended. The manual override covers correcting a cover; there is no
  "re-check SteamGridDB for this" action.

Out of scope for v1 and noted in `IDEAS.md`: social features, following, public
profiles, Steam import, achievements, recommendations, mobile app.

---

## 2026-09-14 — Shelf tile titles

A romhack or port is the thing you played, so on the tile overlay it now leads
and the game it is built on is the qualifier beneath it. An official release is
the other way round, which it already was. Same two lines, opposite order,
decided by `is_community_version`.

The author moved into the overlay for community releases too. The label band
carries it, and the overlay covers the band, so it was disappearing exactly when
you went looking for it.

Fixed while in there: an official version is named after its platform ("N64")
and the line below repeated it in full ("Nintendo 64"). The overlay now shows
the full platform name once, falling back to the version name for an official
release with no platform recorded.

The screen-reader label and the no-art placeholder follow the same title, so all
three agree on what a tile is called.

---

## 2026-09-14 — Shelf filters: apply on change, grouping, review count

**Filters apply as you change them**

The Apply button existed because the filter row was a plain GET form. It is now
a small client component that submits on any change event, so the selects behave
the same way as the checkbox rather than the checkbox being a special case.
Apply is still rendered server-side and disappears once the component hydrates,
so the page keeps working with JavaScript off.

Submitting through `router.push` rather than the form also keeps the URL to the
parts that mean something. A GET submit puts every control in the query string,
including the empty ones and the defaults — `?sort=added&groupBy=none&platform=&shelf=&dlc=separate`
rather than `?dlc=separate`. These links get bookmarked, so the noise was worth
removing.

Hydration detection is `useSyncExternalStore`, because the `useEffect` plus
`setState` version of the same trick is a lint error.

**Covers needing review shows a count, and only when there is one**

`0 covers need review` was a link to an empty page. It now appears only when the
count is above zero, and says `1 cover needs review` or `2 covers need review`.
It stays visible while the filter is active — otherwise fixing the last one
would strand you on an empty shelf with no way back except editing the URL — and
reads "Showing covers needing review — show everything" in that state.

**Grouping**

New `groupBy` selector: platform, year released, status or kind. Sections get a
heading and a count, and the load stagger runs across the whole grid rather than
restarting per section, so it still reads as one shelf resolving.

Unknowns sort last everywhere. "No platform" at the bottom rather than the top,
because an entry missing a field should not lead the page.

`release_year` is a new view column (migration 0004), taken from the version's
own release date and falling back to the work's. A romhack therefore groups
under the year the hack came out, not the year the original did — which only
works if the release date is filled in, so the two test community versions got
their real dates.

**A parameter rename**

`group=off` used to mean "do not nest DLC". With a real grouping selector
arriving, that name was ambiguous, so the DLC toggle is now `dlc=separate` and
`groupBy` is the sectioning axis. Different questions, different parameters.

---

## 2026-09-14 — Optional platform on the community version form

The gap flagged at step 9: section 5's field list for the community form does not
include a platform, so every romhack and port landed unplatformed and "No
platform" was the largest bucket in the stats.

**What changed**

An optional Platform field on the version form, so both doors get it — the form
is one component, which is the whole point of how step 6 was built.

The field is a text input backed by a datalist of platform names already in the
table, the same pattern as shelf tags. Matching is case-insensitive on the name,
because the alternative is two rows differing by a capital letter. A name the
table has never seen becomes a new row with `igdb_id` null and `source =
'local'` — which is exactly what the schema's comment on that column anticipated,
so no migration was needed.

**Verification**

Both branches, through the real form. Typing `nintendo 64` in lower case reused
the cached IGDB row rather than creating a second one — the platforms table
stayed at five. Typing `Linux`, which nothing had used, created a local row with
a null `igdb_id`. Stats now reads Nintendo 64 2, PC 2, PlayStation 4 1,
PlayStation 5 1, with no unplatformed bucket at all.

**Two existing versions were fixed by hand**

Master of Time and Ship of Harkinian were added before the field existed, and
**there is no edit form for a version** — you can change its art and everything
on the entry, but not the version's own details. Both platforms are known facts
rather than guesses, so they were set directly.

That missing edit form is now the sharpest gap in the app. Anything typed wrong
on the add form — a name, an author, a version label, and now a platform — is
stuck until the version is deleted and recreated, and deletion has no UI either.

---

## 2026-09-14 — Editing a version

The gap flagged last time: anything typed wrong on the add form was stuck, because
nothing could change a version's own details afterwards.

**Shared fields, not a shared form**

`VersionFields` now holds the fields a version has, and both the add form and the
new edit form render it. The two operations are genuinely different — adding
picks a base game and looks art up, editing does neither — so they stay separate
components, but the fields themselves are in one place and cannot drift.

This is a narrower claim than the one section 9 makes about the two doors. Door A
and Door B are the same operation and share the whole form. Create and edit are
different operations that share a field set.

**What edit does and does not do**

It changes name, kind, platform, author, version label, release date, URL, notes
and which release it patches. Every version kind is offered, not just the
community ones, so an official release added from IGDB is fixable too.

It does not move a version to a different work — that is not an edit, it is a
different version of a different game. Base version options are siblings on the
same work with the version itself excluded, because the schema forbids a version
being its own base and the rest would be meaningless.

Art stays on its own picker and the rating, review and plays stay on the entry.
Three separate things, three separate places.

**Verification**

The add form was the regression risk, so it was checked first: the fields all
render and the SteamGridDB lookup still fires on blur, returning the fuzzy match
for "Master of Time" with 12 candidates.

The edit form prefilled every field from the database, offered all twelve kinds,
and listed only siblings as base versions with Master of Time itself absent.
Changing the version label, URL, notes and base version saved all four and left
name, kind, author and platform alone.

Worth noting for future browser testing: `.focus()` does not take effect while
the browser pane is backgrounded, so a real blur never fires and an `onBlur`
handler looks broken when it is not. Dispatching `focusout` directly is the
reliable check.

**Still missing**

Deleting a version or a work. Much less pressing now that mistakes are fixable
in place, but a version added to the wrong game still cannot be removed — and
whoever builds it needs to clear the cover file too.

---

## 2026-09-14 — Deleting, and a sweep for stranded art

The last of the gaps flagged through the build: nothing could remove a work or a
version, and the cover file was the part that would have been forgotten.

**Confirmation says what actually goes**

Both deletes go through a page that names the damage first. The database
cascades silently — a work takes its expansions, their versions, every entry,
every play and every shelf tag with it — so the page counts all of that and
lists the works by name before offering the button.

It also names the versions that are *not* being deleted but will be affected.
`base_version_id` is ON DELETE SET NULL, so a romhack built on a release you
delete survives and quietly stops recording what it patches. Deleting the N64
release of Ocarina of Time correctly warns that both Ship of Harkinian and
Master of Time are built on it.

The cascade walk is a recursive CTE rather than one level of children, because
`parent_work_id` nests arbitrarily and a two-level chain would otherwise leave
files behind after the rows had gone.

**Order matters**

Art filenames are read *before* the delete, because afterwards nothing records
which files belonged to what. The files are removed after, so a failed unlink
leaves a stray file for the sweep rather than undoing a delete that was
confirmed.

**The sweep**

`orphanedCoverFiles` started as a helper nothing called, which is not worth
keeping, so it is wired into settings: a count of stored files, how many nothing
references, and a button that only appears when there is something to remove.
Deleting properly should mean it always finds nothing — it is there for what got
away, like rows removed directly in SQL, which is exactly how the two orphans
found earlier this session were created.

**Verification**

Tested on a throwaway rather than on real rows. "Cave Story" was added through
the homebrew door, which fetched art for it (an exact SteamGridDB match, 521 KB
on disk), then deleted through the confirmation page: work gone, version
cascaded, cover file gone, and the shelf left at exactly the 4 works, 6 versions
and 6 entries it had before.

The sweep was checked by planting a file with a valid-looking name that nothing
referenced. Settings went from "7 files stored, 1 file is no longer referenced"
to "6 files stored. Nothing unreferenced." with the button disappearing.

Also fixed here: the removal summary was briefly using `--label` for the warning
about dependent versions. Section 5b allows that colour exactly one meaning —
this release is unofficial — and never emphasis.

---

## 2026-09-15 — Containerising, rehearsed against a clean database

The Dockerfile had never once been built. Every `docker compose up -d db` this
whole project started Postgres only, and the app always ran on the host. So the
first job was finding out whether it worked at all. It did not.

**Two build failures**

`next build` imports every page module to collect metadata, and `lib/db/index.ts`
threw at module scope when `DATABASE_URL` was unset — which it is in an image,
since `.dockerignore` excludes `.env` and should. The connection is now made on
first use behind a proxy, so the several dozen `db.select(...)` call sites stay
as they are. A build should not need a database.

Then `COPY /app/public` failed, because the Vercel boilerplate was deleted at
step 1 and git does not track empty directories. `public/.gitkeep` keeps the
directory, which is better than dropping the COPY and silently not shipping
static assets the day someone adds one.

**Migrations and the first user**

The real blocker, and it needed a structural answer. `drizzle-kit` and `tsx` are
dev dependencies, and `.next/standalone` contains only what Next traced from the
app's own imports, so neither is in the runtime image. A fresh VM would have got
a running app pointed at an empty database with no way to create the schema.

There is now a `migrator` stage that keeps `node_modules`, and a compose service
that runs it to completion before the app starts — `service_completed_successfully`,
so a failed migration stops the deploy rather than producing a broken app. It
applies migrations and seeds the admin user, both idempotent, so it runs on every
deploy and does nothing when there is nothing to do.

**The rehearsal**

Rather than deploy and find out, the whole thing was run from nothing: the
working tree copied to a separate directory, empty data directories, its own
compose project and its own ports, leaving the development stack alone.

From an empty database: Postgres came up healthy, migrations applied, the admin
user was created, the app started. Login worked — which is the test worth caring
about, because it exercises the `@node-rs/argon2` native binding surviving Next's
file tracing, the session cookie, and a server action, all at once. IGDB search
returned real results against a token it had to fetch fresh. Adding a game wrote
a cover to the bind mount as uid 1001.

A second `up -d --build` re-ran migrate cleanly and reported "[exists] jay — left
unchanged", with the data intact.

**The proxy question, answered rather than guessed**

Next validates a server action's `Origin` against the host it thinks it serves,
and this app is server actions throughout. Four POSTs to the login action:

| Request | Result |
|---|---|
| Origin matching the real host | 303, accepted |
| Origin from somewhere else | 500, rejected |
| Host and Origin both carrying a public name, proxy-style | 303, accepted |
| No Origin at all | 303, accepted |

So a proxy that forwards `Host` — the nginx and Caddy default — needs no
application change. Worth having tested: the failure mode would have been every
button in the app silently not working behind TLS.

**Also changed**

Both port bindings default to `127.0.0.1` rather than `0.0.0.0`, with
`APP_BIND` / `APP_PORT` / `DB_BIND` / `DB_PORT` as overrides. The old compose
exposed Postgres to the LAN with a comment asking whoever deployed it to
remember to remove the block.

**Not done**

The image has only ever been built and run on x86_64 under WSL2. It has not run
on the actual Debian VM, and 2 GB is tight for `next build` — the README says to
add swap or build elsewhere.

---

## 2026-09-15 — Optional sign-in, and a one-command VM setup

**AUTH_DISABLED**

For a single-user server on a network you trust. `getCurrentUser` returns the
admin account without looking for a session, so every page loads from any device
that can reach the port. The user still has to exist — the login form just
redirects to the shelf rather than asking for anything.

Deliberately a whole-app switch rather than a per-route one. Half-authenticated
is a worse place to be than either end, and picking which routes stay locked
would be inventing a threat model nobody asked for. So it also removes the
password from editing, deleting, the cover route and the export — which is the
right trade behind a firewall and the wrong one anywhere a port forward or a VPN
guest could reach.

It says so where it matters rather than only in a config file: the header reads
`sign-in off` instead of offering a sign-out, and Settings states plainly what
has been given up.

Checked both ways on the real server. With it on, `/` returns 200 with the shelf
rendered and no cookie, and `/login` redirects away. With it off, `/` is still a
307 to `/login`. No regression either direction.

**scripts/install-debian.sh**

Docker's own installation docs are a keyring-and-repository dance, and Debian
packages Docker itself. The script prefers `docker.io` plus `docker-compose-v2`
when apt offers both — two packages, no third-party repository — and falls back
to Docker's repository only where compose v2 is not packaged. It then creates
the data directories, chowns covers to uid 1001, and drops `.env` in place.

Idempotent, and it refuses to run without root rather than failing halfway. The
README keeps the manual equivalent for anyone who would rather not run a script.

Syntax-checked and the root guard exercised, but **not run on an actual Debian
VM** — there isn't one here. The package-availability branch in particular is
written to detect rather than assume, precisely because I could not verify which
way Debian 13 falls.

---

## 2026-09-15 — Images built in CI, pulled by the server

The deployment target is 2 vCPU / 2 GB and `next build` does not fit comfortably
in that. Rather than tell whoever deploys it to add swap, the build moved to
GitHub Actions and the server now only pulls.

**Two images, not one**

`ghcr.io/iron-jay/gameshelf` is the app — Next's standalone output, no
node_modules, uid 1001. `ghcr.io/iron-jay/gameshelf-migrate` keeps node_modules
so it can run drizzle-kit and tsx. They are separate for the same reason the
migrator stage exists at all: the runtime image deliberately does not carry dev
dependencies, and merging them would undo that.

Both are tagged `latest` and with the commit sha, so `GAMESHELF_TAG` in `.env`
can pin a deploy to a specific build.

**Compose no longer builds**

The `build:` blocks are gone in favour of `image:`. Keeping both would have left
a bad failure mode: if `docker compose pull` failed for an auth reason,
`up -d` would quietly fall back to building on the 2 GB box and die there
instead of saying what was actually wrong.

Building by hand is still two `docker build --target` commands, in the README
for when Actions is down or something needs trying before it is pushed.

**One credential the server needs**

The repository is private so the packages are too, and the VM has to
`docker login ghcr.io` once with a `read:packages` token. That is a real step
and it is in the deployment docs rather than left to be discovered.

Making the packages public while the repository stayed private would have
avoided it — and would also have published the built application, which rather
defeats the point of a private repository.

### What the smoke test confirmed

Added because a green build only proves images were produced, not that they
work. On every publish it now pulls them back and checks:

```
app image        server.js present · runs as uid 1001 · node v22.23.2
                 no dev dependencies
migrate image    migrations: 5 · drizzle-kit runs · seed script present
```

The "no dev dependencies" check is the one worth keeping. The whole reason for
two images is that the runtime one carries none, and nothing else would notice
if a change to the Dockerfile quietly undid that.

### The registry token, confirmed the hard way

Trying to pull the published images from this machine failed with `denied`,
using a `gh` session holding `gist, read:org, repo, workflow`. Pushing from
Actions works because `GITHUB_TOKEN` is granted `packages: write` by the
workflow; pulling from anywhere else needs `read:packages`, which a `repo`
scope does not imply.

So the deployment note about creating a `read:packages` token is not caution,
it is the observed requirement. Worth knowing before standing in front of a VM
wondering why `docker compose pull` says `denied`.

### .env.example was never committed

`create-next-app`'s `.gitignore` carries `.env*`, which swallowed the template
along with the real thing. The deployment steps copy it into place, so
`install-debian.sh` died on a fresh VM with `cannot stat '.env.example'`.

The rehearsal did not catch it because it copied the working tree with `rsync`,
where the file exists whether or not git knows about it. A rehearsal that starts
from `git clone` would have. That is the lesson: when the thing being tested is
a deployment, the input has to be what the deployment actually receives, not
what happens to be on the machine building it.

Fixed with `!.env.example` and a forced add.

### Packages made public, repository left private

Pulling a private package needs a classic PAT with `read:packages` on every
machine that pulls, per user, and fine-grained tokens are not reliably accepted.
That is a lot of ceremony for a deployment whose images contain nothing secret.

So the two packages are public and the repository stays private. What that
publishes is the compiled application and the schema; what it does not publish
is `.env`, any key, or anything that makes the image useful on its own — an
image with no configuration does nothing at all.

Worth recording: there is no REST endpoint for changing container package
visibility. `PATCH /user/packages/container/<name>` returns Not Found. It is a
web UI setting only.

---

## 2026-09-15 — One image, and the account is renameable

**Collapsing the two images**

The second image existed because `drizzle-kit` and `tsx` are dev dependencies
and Next's standalone output only carries what the app imports. Checking rather
than assuming turned out to matter: `drizzle-orm/postgres-js/migrator` is
genuinely absent from the bundle, so a naive `migrate.mjs` importing it would
have failed at runtime on the VM rather than in testing.

The answer is esbuild. `scripts/migrate.ts` is bundled into the standalone
output with drizzle inlined and `@node-rs/argon2` left external — it cannot be
bundled, being native, and it is already there because login uses it. The
container then runs `node migrate.mjs && node server.js`, so the server does not
start if the schema could not be brought up to date.

esbuild arrives with drizzle-kit today, but depending on a transitive binary in
a production build is the kind of thing that breaks during an unrelated upgrade,
so it is now an explicit dev dependency.

Postgres notices are silenced in that script. Re-running against an up-to-date
database emitted a NOTICE object per statement, which buried the one line worth
reading in the deploy log.

**The account**

Default username is `admin` rather than `jay`, and it can be renamed in
Settings — username and display name, with the uniqueness check the database
would enforce anyway, reported as a message rather than a crash.

Two consequences needed handling, and both were tested rather than reasoned
about:

The seed now asks "is there anybody at all" instead of "is there someone called
ADMIN_USERNAME". Otherwise renaming the account would make the next restart
quietly create a second one.

The no-sign-in path falls back to the oldest account when `ADMIN_USERNAME` no
longer matches anybody. Without that, renaming the account with `AUTH_DISABLED`
on would have produced a redirect loop between `/` and `/login` — locked out of
a server with no login form.

Sessions key on the user id, so renaming does not sign you out. Confirmed.

**Verified from nothing**

Fresh tree, empty data, own project and ports: 317 MB image carrying `server.js`,
`migrate.mjs`, five migrations and no dev dependencies. From an empty database it
logged `[migrations] up to date` and `[user] created admin`, then served. A
rename to `jay` / `Jay T` saved and left the session intact; a restart said
`already exists, left alone` and there was still one user; and with
`AUTH_DISABLED=true` and `ADMIN_USERNAME` still saying `admin`, the shelf loaded
as Jay T with no cookie.

**Still missing**

Changing the password from the interface. Renaming an account you cannot change
the password of is a slightly odd pair, and worth closing next.

---

## 2026-09-15 — Password change, and importing from Grouvee

**Password**

Current password, new, and again, in Settings. Changing it ends every other
session for that user and keeps the one making the request — those other devices
were authorised by a password that no longer exists.

**Grouvee**

Reading the export before designing anything for it was the whole game. It
turned out to carry an `igdb_id` on every one of the 324 games, which means
matching is exact rather than a title search with a confidence tier — the
opposite of the SteamGridDB problem.

What is actually in it: 324 games, two shelves (Played 314, To Play 10), two
ratings, no reviews, no play log, no platforms. Grouvee's built-in shelves are a
status by another name so they become one; anything the user invented stays a
free-form shelf.

Dates matter more than they look. `date_added_to_collection` becomes
`entries.added_at`, so an imported shelf sorts the way it was actually built
rather than stamping three hundred games with today.

**Batched, and driven by the client**

IGDB takes `where id = (…)` up to 500 at a time, so a batch is one request
rather than forty. Covers are the slow part and they are fetched six at a time
after the database work, outside the transactions.

The client loops the batches so it can show progress. Three hundred games is a
minute or two of image downloads, and one silent request would look like a hang.
Every step is idempotent — `ensureWorkFromIgdb`, `onConflictDoNothing` on the
entry — so a retried batch changes nothing.

**Tested against the real file**

The parser on the actual export: 324 games, nothing unmatched, 314 played, 10
backlog, all dated. Then a real three-game slice chosen to include Ocarina of
Time, which was already on the shelf: `added: 2, alreadyThere: 1, missing: []`.
The two new ones arrived with their 2017 dates and their covers; the existing
Ocarina entries were left exactly as they were rather than being overwritten by
the import's idea of their status.

`scripts/probe-grouvee.ts` stays as a dry run — it reports what an export would
do and writes nothing.

**Worth noting**

The import never overwrites. A game already on the shelf is counted and skipped,
including its status and rating. That is the right default for a re-run, but it
does mean the import cannot be used to update an existing shelf from Grouvee,
only to fill in what is missing.

---

## 2026-09-16 — The import was broken by one exported constant

Reported as "read the file throws a server error, with or without a file". The
"without a file" half was the clue: the failure could not be about parsing.

```
Error: A "use server" file can only export async functions, found number.
  6 | export {IMPORT_CHUNK as '...'} from 'ACTIONS_MODULE2'
POST /settings 500
```

`IMPORT_CHUNK` was a number exported from a `"use server"` module, which Next
forbids. It does not break only that export — it breaks the whole generated
actions module for any page importing it, so the connection check, the cover
sweep, the password change and the account rename were all dead on that page
too. The form, unable to bind its action, fell back to a native POST to the page
route, which is where the 500 came from.

It came from extracting the import logic into `lib/`: the constant went with the
function and the re-export looked harmless.

**Neither the build nor eslint said anything.** `next build` passed, `tsc`
passed, eslint passed. The first sign was a 500 from a form. So there is now
`scripts/check-server-actions.ts`, which walks every `"use server"` file and
asserts each export is an async function, and the Dockerfile runs it before
building. Verified by reintroducing the bug: it exits 1 and names the line.

**Also fixed: the file input**

The native control renders differently in every browser and its button is
usually small, grey and not obviously the thing to press. There is now a shared
`FilePicker` — a styled label with the real input visually hidden behind
`sr-only`, so labelling, keyboard focus and form submission all still work. Both
uploads use it, the Grouvee export and the cover art, which had the same problem
waiting.

The submit button is deliberately **not** disabled until a file is chosen. That
would make it depend on a change event firing, and the server already answers
"choose a file" perfectly well on its own — gating it would trade a clear
message for a button that might never enable.

**What was and was not verified**

The whole flow, on the real export: the summary reads "324 games from
JayTruscott, exported 2026-09-14. 314 played, 10 backlog." and the Import button
appears.

Not verified: that the filename appears next to the picker after choosing one.
Setting `input.files` from a script does not trigger React's `onChange`, so the
harness cannot exercise it — a real click will. That is exactly why the submit
button no longer depends on it.

---

## 2026-09-17 — Coming back to the shelf you left, and a platform you can pick

Two things, both about state the interface was throwing away.

**The shelf forgot its grouping.** All of the shelf's state lives in the URL,
which is what makes a view bookmarkable — and also what loses it, because the
header link goes to a bare `/`. Group by platform, open a game, click gameshelf,
and you are back to an ungrouped list.

The shelf now records its own query string in a `shelf-view` cookie, and the
links back to it (the header, and stats' "Back to the shelf") restore it.
Nothing else reads the cookie: `/` typed or bookmarked is still a clean shelf,
and a view is never restored behind your back. Clearing every filter is itself a
view, so it is stored as an empty string rather than deleted — turning grouping
off and coming back does not turn it on again.

**The first attempt read the cookie in the layout and it did not work.** The
header link kept its old href as I navigated. Layouts are not re-rendered on
client navigation — that is the point of them — so a value read there is
however stale the last full page load left it. The read has to happen at click
time, so `ShelfLink` is a client component that reads `document.cookie` in its
onClick and pushes. Its `href` stays `/`, which keeps the markup identical
across hydration and leaves the link working with scripting off. Modified clicks
fall through untouched: a new tab should be the plain shelf, not a copy of this
one's filters.

**Platform was a text box pretending to have suggestions.** It had a `datalist`,
but nothing on screen says a datalist is there, so in practice you retype
"Nintendo 64" and get a second row differing by a space. It is a select now,
listing the platforms already in use, with "Something else…" swapping in a text
box — because a recomp running on something nothing else on the shelf runs on is
the normal case here, not the exception. The text box keeps the datalist, so a
near-miss on an existing name is visible before it becomes a duplicate.

Only one control carries the `platformName` name at a time, so there is no
question of which one the form submits. The sentinel the "Something else…"
option carries is mapped to null in the action: with scripting off the select
cannot swap itself, and submitting it should mean no platform rather than create
a platform called `__other__`.

**Verified** end to end against the dev database: grouping by platform survived
a round trip through a version page and back via the header; clearing the
filters left the cookie empty and did not come back; free-typing "Sega Saturn"
created a local platform row, and the field rendered as a select with it
selected on reload. Test row removed and the version put back on Nintendo 64
afterwards.

---

## 2026-09-17 — Naming an original release

"What is the difference between name and platform on this page?" — a fair
question, because on an original release they held the same string. The name is
free text and distinguishes this release from the other versions of a work; the
platform is a row in `platforms` that drives the shelf filter, the grouping and
the stats breakdown. They coincided because the add flow, having no name to work
with, named the version after its platform.

Two changes, both about making that coincidence deliberate rather than
accidental.

**The default is the platform's full name**, not its abbreviation. "Nintendo 64"
reads as a name; "N64" reads as a code, and §5b reserves mono-looking codes for
things that actually are codes. Both creation sites — add-to-shelf and the
Grouvee import — had the same `abbreviation ?? name ?? "Original release"`
expression inline; they now share `originalVersionName` in `lib/igdb/mapping`,
so the next change to it happens once.

**Changing the platform renames the version to match**, and only for
`original`. The name stays editable afterwards, so a "N64 (PAL)" survives. The
guard is the kind selected in the form rather than a string comparison against
the old platform: a romhack has a name someone gave it, and moving "Master of
Time" to the right platform must never overwrite it. Kind is exact where a
heuristic would not be — the existing rows are named after abbreviations, which
are not in the list the form is given, so a match against it would silently do
nothing.

Free text mirrors as you type. Picking "Something else…" leaves the name alone
until something is actually typed, rather than blanking it for as long as the
box is empty.

**This only affects versions created from here on.** Originals already on a
shelf keep their abbreviations. The backfill is one statement, and it touches
only rows whose name is still exactly the abbreviation, never a name anyone
typed:

```sql
update versions v set name = p.name from platforms p
 where p.id = v.platform_id and v.kind = 'original' and v.name = p.abbreviation;
```

**Verified** in the form against the dev database: with kind `romhack`, moving
the platform from Nintendo 64 to Wii left "Master of Time" alone; with kind
`original`, the name followed PlayStation 4 and then Linux, and mirrored "Sega
Saturn" as it was typed into the free-text box. Nothing was submitted, and the
row is untouched. `originalVersionName` checked directly: a platform with an
abbreviation gives the full name, one without gives its name, and none gives
"Original release".

---

## 2026-09-17 — The platform list offers only platforms in use

A Grouvee import landed a game on 64DD. Corrected to Nintendo 64 — and 64DD was
still in the dropdown, ready to be picked again by mistake.

The form was listing every row in `platforms`. A row is created the moment IGDB
mentions a platform, so the table accumulates platforms nothing is filed under:
this dev database had three (Linux, Wii, Xbox 360) before I touched anything.
The list now comes from `platformsInUse()` — a join through `versions`, so a
platform appears only while something is actually on it. All three call sites
(both doors and the edit form) had the same query written out inline and now
share it.

The orphaned row is left alone rather than deleted. It is keyed on its IGDB id,
so it gets reused rather than duplicated if something genuinely does turn up on
that platform; it just has to be typed out once, which is the point of the
request. Deleting rows to hide them from a list is a heavier answer to a
question about a dropdown.

**Verified** the whole cycle against the dev database: the three unused
platforms disappeared from the edit form; typing "Nintendo 64DD" as free text
and saving put it in the list on reload; moving the version back to Nintendo 64
took it out again, on the edit form and on both add doors. Test row removed
afterwards and the version left on Nintendo 64.

---

## 2026-09-17 — Choosing which release you played, on the way in

Adding from search took the platform the server guessed: `primaryPlatformFor`,
the earliest dated release. Right for Ocarina of Time on N64, wrong for anyone
who played it on the Wii, and the only fix was to add it and then edit it. The
search row now carries a picker of every platform IGDB lists for that game.

It only appears when there is something to choose — a single-platform game gets
no picker — and once it is there, the metadata line stops repeating a truncated
copy of the same platforms and just reads "IGDB".

**The default has to be the server's answer, or the picker lies.** Untouched, it
must produce exactly what Add produced before. That meant widening the search
projection: it fetched `platforms.name` but neither `platforms.id` nor
`release_dates`, so `primaryPlatformFor` on a search result would have fallen
back to `platforms[0]` and quietly reintroduced Ocarina of Time on 64DD — IGDB
does list 64DD for it. Both sides now call the same function on the same data.

The choice is checked against the game IGDB just returned rather than believed,
so a submitted id that is not one of that game's platforms falls back to the
guess. With scripting off there is no value at all, and the same fallback
applies.

**When the original version already exists, the choice is not applied** — this
flow has always reused it rather than creating a second one, and that is still
right. But silently ignoring an explicit choice is how a feature gets a
reputation, so the message names the platform it is actually on: "Already on
your shelf, on Nintendo 64".

**Verified** against IGDB and the dev database: Ocarina of Time offered 64DD,
Nintendo 64, Wii and Wii U with Nintendo 64 preselected; adding it on Wii
reported "Already on your shelf, on Nintendo 64" and changed nothing. Celeste,
not on the shelf, added on Nintendo Switch rather than the preselected Xbox One,
and the row reads `Celeste | Nintendo Switch | original | Nintendo Switch`. Test
work, version, entry, platform row and cover file all removed afterwards.

---

## 2026-09-17 — Bulk platform and status, and a form reset that ate the selection

A hundred games imported onto the wrong platform is a repair job, and doing it
one version at a time is not a repair job anyone finishes. The shelf now has a
select mode.

**Selecting is a mode, not a checkbox on every cover.** §5b is explicit that the
art is the content and the interface is the frame; a permanent checkbox on every
tile is the frame taking over. "Select" turns it on, the whole tile becomes the
target — a checkbox small enough not to sit on the art is too small to hit on a
phone — and a bar appears with the platform field, the status list and the
counts. Filter the shelf first and "Select all" does the rest, which is the
actual workflow: platform = 64DD, select all, change platform.

Platform reuses the same `PlatformField` as the version form, so free text is
there for a platform nothing is on yet, and `resolvePlatform` moved to
`lib/platforms` rather than being copied.

**The bug worth recording.** The first version used real checkboxes with
`name="entryId"` and React state alongside them for the count. It worked once.
The second action on the same selection submitted nothing, while the screen
still said "2 of 6 selected" and still outlined two tiles — because React resets
a form's fields once its action resolves, and it does not re-sync a controlled
checkbox whose prop never changed. Two sources of truth for one answer, and they
drifted the moment an action completed.

So the tick is drawn (a button with `role="checkbox"`), and what gets submitted
is hidden inputs rendered from the selection state. Hidden inputs survive the
reset, because a reset restores exactly the value rendered. One answer to what
is selected.

**Renaming on a bulk move** follows the same rule as the edit form, but stricter:
only an `original` whose name is still the one a platform gave it — the platform
name, its abbreviation, or "Original release" when it had no platform. "Master of
Time" and "N64 (PAL)" were written by someone and stay. That last case had to be
added after testing: moving a version off "no platform" left it called "Original
release" because the name matched neither the old platform nor its abbreviation.
`UNPLACED_ORIGINAL` is now shared with `originalVersionName` rather than being
a string in two places.

Platform writes to `versions`, which is shared across users; status writes to
`entries`, which is not. Both are documented at the top of the actions.

**Verified** against the dev database, watching the rows rather than the screen:
two entries to `playing` left the other six alone; a free-text "Sega Saturn"
moved three and renamed the two originals while leaving the romhack's name; a
move to Nintendo 64 renamed the two that had come from no platform. All test
works, versions, entries, platform rows and cover files removed afterwards, and
the shelf is byte-for-byte the six rows it started as.

**Not reproduced: the 500 on Add.** Tried `next dev`, the production standalone
server, and the container image itself against the same database — Add works in
all three, with and without the picker, for a new game and for one already on
the shelf. Whatever it is needs the error out of `docker compose logs app`.

---

## 2026-09-17 — A database outage should not read as a 500

The "adding a game throws a 500" report turned out to be Postgres, not the add
flow: `57P03`, the database system is in recovery mode, on the session lookup
that runs before every page. Which is why it could not be reproduced in `next
dev`, in the standalone build, or in the container image — there was nothing
wrong with the code. The only thing that said so was `docker compose logs`.

So the failure now has a face.

`app/error.tsx` sits at the root, which is where it has to be: the session
lookup runs in the app layout, and a boundary inside that layout cannot catch
its own layout throwing.

**It cannot read the error, so it asks.** Next strips a server error's message
before it reaches the browser — correctly — so the component has no way to see
`57P03`. `app/health` is a `select 1` and nothing else, and its answer separates
"the database is down" from "gameshelf is broken", two problems with nothing in
common but a status code. It is unauthenticated because it cannot be anything
else: sessions live in the database, so a check requiring one would fail for the
exact reason it exists to report. It returns up or down and no detail.

**`reset()` alone does not recover.** Found by testing the thing rather than
trusting it: stop the database, load the page, start the database, press Try
again — and it failed again. `reset()` re-renders the boundary against the
payload it already has, which is the failed one. `router.refresh()` inside the
same transition is what asks the server a second time.

**Verified** against a genuinely stopped container, not a mock. `docker compose
stop db` gives "gameshelf cannot reach its database" and `/health` 503s;
`/version/not-a-uuid` with the database up gives "Something went wrong" and the
digest; starting the database and pressing Try again brings the shelf back
without a reload.

Noticed on the way: `/version/<not a uuid>` reaches Postgres and fails on
invalid input syntax where it should be a 404. Left alone — it is a different
change.

---

## 2026-09-17 — A typo in a URL is a 404, and logs that cannot eat the disk

**The uuid guard.** A route id comes from the address bar, so anything at all
can land in one, and Postgres answers a malformed uuid with `invalid input
syntax` — which reached the browser as a 500, reporting a typo as the server
having broken. `isUuid` in `lib/uuid` now runs before the query on all three
version routes.

The art page is the exception and deliberately so: `?version=` junk falls back
to the work's own art rather than 404ing, because the work in the path does
exist and the query string is only the qualifier.

Verified with real requests: `/version/not-a-uuid`, `/edit` and `/delete` all
404, a well-formed id that matches nothing still 404s, `art?version=nope` is
200, and the real routes are untouched at 200.

Server actions that take an id from a form are not guarded. They are reachable
only by a crafted POST, and a 500 there is already the honest answer to a
request nobody's browser would send.

**Log rotation.** The VM ran out of disk and took Postgres down with it, which
is the outage the error boundary was written for. Docker's json-file driver has
no size limit by default, so a container failing in a loop writes until the disk
is gone — and Postgres cannot write either, which is the part that looks like
everything breaking at once. Both services now cap at 10 MB × 3 files.

That is prevention, not diagnosis: the 32 GB that went is almost certainly old
images, one left behind by every `docker compose pull`, and today saw six of
them. `docker system df` says where it went.

---

## 2026-09-17 — The 32 GB disk was 2.9 GB

The database failure was the disk. `df -h /` said `/dev/sda1  2.8G  2.8G  0  100%`
on a VM Proxmox reports as 32 GB.

A Debian cloud image ships a ~3 GB root and does not grow into the disk it is
given; nothing in the deploy steps said to check, and a hypervisor reporting
32 GB says nothing about the filesystem inside. Root then filled in an
afternoon — six image pulls in one day, each leaving the previous image behind,
plus an unbounded container log while the app retried against a database that
could no longer write. Postgres went into recovery, every page 500ed, and the
visible symptom was "adding a game is broken".

The layout was the standard cloud-image one: partitions 14 (BIOS boot) and 15
(EFI) at the front, root as partition 1 and last, with 29 GB unallocated after
it. `growpart /dev/sda 1 && resize2fs /dev/sda1`, online, no reboot. 31 GB now.

Three things came out of it, in the order they matter:

1. `README` now says to check `df -h /` on the guest, because that is the step
   whose absence caused this.
2. Both services cap their logs at 10 MB × 3, so a crash loop cannot do it again.
3. `app/error.tsx` means the next outage says "gameshelf cannot reach its
   database" rather than presenting as a broken feature. That one cost an
   afternoon of looking for a bug in the add flow that was never there.

The lesson is the same one the rehearsal-versus-clone entry already records:
the thing under test has to be the thing that runs. Three environments said the
add flow was fine, and all three were right.

---

## 2026-09-17 — "PC (Microsoft Windows)" is just PC

IGDB's name for it, and a mouthful in two places at once: the platform column
and the name of every original release filed under it.

Renaming the row would not have held. `upsertPlatform` writes
`onConflictDoUpdate({ set: { name } })`, so IGDB's own spelling goes back the
next time a game on that platform is added — a fix that works until it quietly
does not. The rename belongs on the way in, so `PLATFORM_ALIASES` sits in
`lib/igdb/mapping` and `platformNameFor` is what both the insert and the
conflict branch use. `originalVersionName` goes through it too, and so does the
search picker, so what is offered is what gets stored.

The abbreviation was not the answer. "PC" is IGDB's abbreviation here, but "N64"
is too, and §5b keeps codes for things that are codes. An explicit map says
which names are being shortened and stops there.

**Verified** through the conflict branch specifically, which is the one that
would have undone a plain rename: adding Half-Life 2 on PC renamed the existing
`igdb_id = 6` row from "PC (Microsoft Windows)" to "PC" and named the version
"PC". Test work, version, entry and cover removed afterwards.

Existing rows therefore self-correct the next time something is added on that
platform, but only then — the backfill is a statement, and worth checking first
for a local row that already carries the short name. This database has two
"Linux" rows for exactly that reason: one from IGDB, one typed in.

---

## 2026-09-17 — Status on the way in, preferences that stay, and a delete on the tile

Four requests, one session.

**Status when adding**, defaulted from the release date: something not out yet
is a wishlist entry, something that is out is a backlog entry. A game with no
release date counts as out — IGDB not knowing a date is far more common than a
game being unreleased. The picker is right there when the guess is wrong, and so
is the shelf afterwards.

Note the word: these are *statuses*, not shelves. Shelves are the free-form tags
in §2, and wishlist/backlog are the state machine. Mixing them would have put
the same thing in two places.

**One status order, `lib/status.ts`.** wishlist, backlog, playing, played, then
dropped and shelved — a game's progress, then the two ways out of it. The enum
declares them in the order the column was written, which means nothing to anyone
reading a shelf. Applied to the status tabs as well as the grouping: two orders
for one set of values is worse than either. Say if the tabs should go back.

**Preferences persist, filters do not.** How you sort, group and treat DLC is
how you like to look at your shelf, so a bare "/" now restores it — a bookmark,
a fresh tab, the link after adding a game. Which status or platform you were
filtering to is what you were looking at a minute ago, and restoring that
unasked leaves you staring at a subset with no memory of why. The URL still wins
wherever it says anything, so a shared link shows what it says.

The trap here is the one that bit the first attempt at remembering the view:
turning grouping *off* produces a bare "/", indistinguishable from arriving
fresh. So `FilterForm` writes the cookie before it navigates, and what it writes
is exactly what it is about to put in the URL. Verified both directions — set
grouping, reload, still grouped; turn it off, reload, still off.

**Delete on the tile.** A link to the existing confirmation page, not a delete:
this is a grid of covers and a one-click delete on a wall of art is one mis-tap
from losing something. The page already explains what goes with it.

`--color-danger` is a second chromatic value and a deliberate exception to §5b,
which reserves colour for community provenance. Destructive actions announce
themselves on hover and nowhere else — never at rest, never as text.

The fiddly part was hit-testing. The metadata overlay fades with `opacity`, and
an opacity between 0 and 1 creates a stacking context, so a click landing
mid-fade went to the tile's link underneath instead of the button. The overlay
now carries `z-20` and `pointer-events-none`, and the controls inside take the
events back. Painting and hit-testing no longer depend on how far through the
fade you are.

**Verified** against the dev database: GTA VI (2026-11-19) added itself to the
wishlist and appeared in the first group; the tabs and the groups both read
wishlist, backlog, played; a bare "/" kept sort and DLC while dropping a status
filter; the delete link resolves `hover:bg-danger` to `rgb(168, 71, 63)` and
sits above the tile link. Test work, version, entry and cover removed.

---

## 2026-09-17 — Four shelves, and the word "shelves" means one thing again

Two requests that turned out to collide, so I asked before touching anything.

**"Change status to shelves"** ran straight into §2, which already had shelves:
the free-form tags on the version page and the filter beside the grouping
selector. Relabelling statuses would have put two different features called
shelves inches apart on the same page.

Settled as the Goodreads model, which is what §1 says the app is: the four
states **are** your shelves, and the free-form ones are **tags**. Language only
— the column, the enum and the `shelves` table keep their names, because
renaming them buys nothing and costs a migration. `CLAUDE.md` §2 now records the
decision, since a brief that contradicts the interface is a trap for the next
session.

**`dropped` and `shelved` are gone**, and everything in them became `played`.
Both meant "I stopped", and neither could say it differently from the other; a
state machine with two indistinguishable states is one state and a coin flip.
How far you got was never the shelf's job — that is `plays.completion`, which
already has four levels.

Migration `0005` does it. Postgres cannot remove a value from an enum, so the
type is rebuilt, and `entry_cards` selects `e.status` so the view has to be
dropped and recreated around it — copied verbatim from `0004` rather than
retyped. Applied to the dev database against seeded `shelved` rows: two moved to
`played`, the enum came back with exactly four values in reading order, the view
kept its six rows and the column kept its default.

The Grouvee importer mapped five Grouvee shelves into the two that no longer
exist. They all map to `played` now — with four shelves, something you started
and abandoned is something you played.

Also folded the duplicate `isStatus` in `version/[id]/actions.ts` into
`lib/status.ts`. Two copies of the same guard over the same enum is how one of
them ends up stale.

**Verified** in the browser: the tabs read wishlist, backlog, playing, played;
grouping offers "Group by shelf"; the filter beside it offers "All tags"; the
bulk bar says "Change shelf"; the version page has a "Shelf" row of four and a
separate "Tags" section. Dev entries put back where they started.

---

## 2026-09-17 — A wishlist that empties itself, and 4px

**Released games leave the wishlist.** Waiting for something and owning it
unplayed are different states, and the first stops being true on its own the day
it ships. One statement, run when the shelf is read — there is no scheduler
here and a single-user app does not need a job runner to notice a date has
passed. It is idempotent and touches nothing once everything is caught up.

**It only promotes what was wishlisted before release.** Wishlisting a game that
is already out is a real thing to do — you want it, you do not own it — and
sweeping that onto the backlog the moment you saved it would leave the wishlist
useful for pre-orders and nothing else. `added_at` earlier than the release date
is what separates "I was waiting for this" from "I want this". The version's own
date wins over the work's, so a port is out when the port is out.

Writing during a render is not free of sin, but the alternatives are a cron
container for one UPDATE or a status that lies on screen until something else
fixes it. Noting the trade rather than pretending it is not one.

**Verified** with three entries set up to be told apart, which is the only way
this is worth testing: wishlisted 2016 and released 2017 moved to backlog;
released 2023 and wishlisted today stayed put; releasing in 2027 stayed put. The
first attempt failed on my own test data — I had written case one with
`added_at` *after* its release date, which is case two — and the query was right
all along. Dev rows put back afterwards.

**Covers get 4px between them** instead of 1px. §5b calls for hairline gaps and
this is still a dense grid rather than a feed of cards, but the wall reads
better with the covers not quite touching.

---

## 2026-09-18 — Trimming: no plays, no stats, ten-point ratings

Six changes, one of which needed asking about first.

**"Can plays be removed from pages, as well as stats"** had two readings and
both were destructive, so it got a question rather than a guess. Answer: the
plays UI and the whole Stats page, with the `plays` table left in place. So
nothing recorded is lost, the export still carries every play, and §2's
four-table model is intact — there is simply no longer a screen that writes to
it. `addPlay`, `deletePlay`, `PlayForm` and `app/(app)/stats` are gone, along
with the Stats link in the header.

**Ratings are out of ten, whole numbers.** The column always stored 1..10; the
interface was halving it to show stars out of five, so this is display only and
needs no migration. The export's `ratingOutOfFive` becomes `rating`, and the CSV
column `rating_out_of_five` becomes `rating_out_of_ten`.

**Covers needing review have their own page**, `/art`, linked from Settings, and
the shelf loses the `review` parameter entirely. It is a job you sit down and
work through, not a way of looking at what you own, and a permanent line above
the grid counting unfinished chores is not what a wall of covers is for.

**A search box on the shelf**, submitting to `/search` — searching is the way
onto a shelf, so it belongs where the shelf is. And a local result now links: to
the entry when exactly one version of that work is on your shelf, to the work
page when several are. Guessing between a romhack and the original would be
worse than asking.

**`dropped` is back** (`0006`). It says something the other four cannot: you
played it and stopped, which is not the same as having finished it. `shelved` is
not coming back with it — that was the half of the pair with no distinct
meaning. Adding a value to an enum needs no type rebuild, so the view was left
alone this time.

Entries that `0005` folded into `played` stay there. Nothing recorded which of
them had been dropped, and that is the cost of the round trip.

**The release-date auto-promotion is reverted**, one day old. The add-time
default stays — an unreleased game still lands on the wishlist — but nothing
moves it afterwards. `lib/wishlist.ts` deleted, and with it the one place that
wrote to the database during a page render.

`CLAUDE.md` follows all of it: §2's status list, §4a's review filter, §5's
screens and §9's build order. A brief that contradicts the app is a trap for the
next session, and this session has now contradicted it twice.

**Verified** in the browser: `/stats` is a 404 and the nav has four links; the
version page reads Shelf / Finished it / Rating 9 of 10 / Tags / Review with no
Plays; rating buttons are 1–10; the shelf row of buttons includes dropped; the
enum came back as five values in reading order; `/art` lists the one flagged
cover and links to its picker; the shelf has a search box and no review line;
searching "destiny 2" links each owned result to its entry while Ocarina of
Time, with three versions shelved, links to the work. Dev rows left as found.

---

## 2026-09-18 — The shelf's search box filters the shelf

Yesterday's search box handed off to `/search`, which is the IGDB door. What was
wanted was the opposite: type "fable" and the wall of covers becomes the ones
called Fable.

So it filters on the client, per keystroke, with no round trip and no debounce
to tune — every card is already in `ShelfGrid`'s props, so a keystroke is a
re-render of a list of a few hundred. Going through the URL would have meant a
server render per character for no gain.

It matches the two lines a tile actually shows: the work's title and the
version's name. A romhack is findable by its own name as well as by the game it
patches, which is the point of putting its name on the band in the first place.

**It moved down the page.** It was above the status tabs and it is now in the
row directly above the grid, beside Select. State has to live in the client
component that holds the cards, and that component starts below the filter row —
the alternative was a context provider wrapping half the page to keep an input
20 pixels higher. It also reads better there, next to the other controls that
change what the grid shows. Say if it should go back up.

The nav's Search is untouched and still goes out to IGDB. Two boxes that both
say "search" would be a problem, so this one says "Filter by title".

**Verified** by typing into it: "d" → 4 of 4, "de" → Destiny 2 alone,
"harkinian" → the decomp port by its own name, "zelda" → all three Ocarina
entries, "fable" → "Nothing on your shelf matches". Focus survives every
keystroke — the input is the same DOM node before and after, so nothing
remounts and the caret stays put.

---

## 2026-09-25 — Two auth fixes, found while building bookshelf

**A rename followed by `db:seed` made a second account.** `scripts/seed.ts`
looked for a user *named* `ADMIN_USERNAME`; `scripts/migrate.ts` looked for
*anyone*. Renaming `admin` in Settings and seeding again created a fresh
`admin` beside the renamed one. Both now call `lib/auth/first-user.ts`, which
does nothing once any user exists — the rule `migrate.ts` already had.

**`AUTH_DISABLED=true` with no user yet looped forever.** The app layout sent
you to `/login`, which saw sign-in was off and sent you back. The login page
now counts users before redirecting, and with nobody there shows the "no user
has been created yet" message instead.

Both reproduced against the old code first, on a throwaway database
(`gameshelf_fixtest`, dropped afterwards — the real one was not touched): the
old seed created `admin` next to `renamed`; the old login page hit curl's
10-redirect limit. With the fix, seed and the bundled `migrate.mjs` both report
"renamed already exists", and the loop is one redirect to the message.
`tsc`, eslint and `check:actions` clean. README's seed lines say what it now
does.

Not in this change: `next dev` run by an AI coding agent appends a
`nextjs-agent-rules` block to `CLAUDE.md` (Next 16's
`generate-agent-files.js`, triggered by `CLAUDECODE` / `AI_AGENT` in the
environment). It did so here during testing and was reverted. Starting
`next dev` with those unset prevents it.

---

## 2026-09-26 — Back to shelf landed you in the wrong place when it had nowhere to go

Reviewing `824f254`. `ShelfLink` passes `scroll: false` whenever `restoreScroll`
is set, so Next does not scroll to the top and the shelf is expected to scroll
itself. But `takeShelfScroll` returned a bare `number | null`, and `null` meant
two different things: nobody asked for a restore, and somebody asked but there
is nothing saved. The caller skipped the scroll on both.

So opening a game without having scrolled the shelf first — the ordinary first
move — then scrolling down that game's page and pressing **Back to shelf** left
you at the game page's offset. On a four-tile shelf that clamps and looks like a
glitch; on 324 games it drops you somewhere arbitrary.

`takeShelfScroll` now returns `{ asked, y }`. An ask with no position scrolls to
the top, because the link has already suppressed the scroll that would have done
it. And `askToRestoreShelfScroll` reports whether it managed to record the ask,
so with storage blocked the link stops suppressing and the default takes over —
previously a blocked write left the suppression in place with nothing on the
other side to act on it.

**Verified as unit tests rather than in a browser.** The pane this session drives
runs hidden, `document.hidden` is true, and `requestAnimationFrame` never fires
there — so no scroll-restoring code can execute in it at all, and an earlier
in-browser "reproduction" of this bug was really just that. Seven cases against a
`sessionStorage` stub: no ask; asked with nothing saved; asked with a position
for this view; asked with a position for a different view; saved but not asked;
the ask being one-shot; and a blocked store. All pass, and the second is the one
that was wrong.

Also: two comments said "book" — this code came from bookshelf. Now "game".

### For bookshelf

If its "back to shelf" shares this shape, it has both faults:

1. **The scroll-to-top one.** Same fix: have the take-function report whether a
   restore was asked for, separately from whether it found a position, and
   scroll to 0 on an ask with no position. Reproduce it first by opening a book
   without scrolling the shelf, scrolling that book's page, and pressing back.
2. **The blocked-storage one.** Only suppress the framework's scroll-to-top when
   the ask was actually recorded.

Worth checking there too, both unverified here: the scroll listener writes to
`sessionStorage` once per animation frame while scrolling, which is a synchronous
write per frame on a long shelf and wants a trailing debounce; and a saved
position taken from a shelf that has since got shorter will overshoot — browsers
clamp it, so it is untidy rather than broken.

**Re-verified before committing** (2026-09-26), on a throwaway `gameshelf_authtest`
dropped afterwards — the real database was only read. `scripts/migrate.ts` has
top-level await and only ever runs as the esbuild bundle, so it was built and run
that way rather than through `tsx`:

| | |
|---|---|
| Fresh database, bundled migrate | `[user] created admin` |
| Rename to `renamed`, then `seed` | `renamed already exists`, still one user |
| Migrate again on a populated database | `renamed already exists` |
| Empty database, no `ADMIN_PASSWORD` | both exit 1 with the message |
| `AUTH_DISABLED=true`, zero users | `/` → one 307 to `/login` → 200, "No user has been created yet" |

The loop was the interesting one: one hop, not curl's ten-redirect ceiling.
`next dev` was started with `CLAUDECODE` and `AI_AGENT` unset, and `CLAUDE.md`
came through clean.

## 2026-09-26 — The shelf fade-in plays once, not on every return

Found in bookshelf, same code here. Covers looked like they reloaded on every return to the shelf. They did
not — the covers route sends `immutable` and the browser had them — but the
fade-in replayed on each visit, holding tile n back 18 ms × n: seconds on a
long shelf. The fade-in now plays once per tab (module state in
`shelf-grid.tsx`, set after mount, so server and hydration agree; a full
reload plays it again), and the stagger stops at the 24th tile. Same change
in both apps. Checked: the shelf renders with the class on first load; the
replay on client navigation is not something curl can see.

---

## 2026-10-11 — Series

"Add the ability to add, and sort by series." §2 says to ask which of the four
tables a feature belongs to and to push back if the answer is a new one — and
here it isn't. A series is a fact about the **work**: Ocarina of Time is a Zelda
game whoever owns it and whichever version they played. So `works.series`, a
nullable text column, indexed.

Not a tag, which is per-entry and per-user, and which you cannot sort by. Not a
table either: a series has nothing but a name, and a table of names exists only
to be joined. Platforms earned their table by carrying IGDB ids and
abbreviations; this carries neither. `lib/series.ts` says so, so the next person
to wonder has an answer.

**Migration `0007`** adds the column and puts it on `entry_cards`, because the
shelf sorts on the view. Appended at the end of the select list, not inserted
where it reads best: `CREATE OR REPLACE VIEW` may only add columns after the
existing ones. My first attempt put `w.series` next to `work_title` and Postgres
would have refused it — `0004` already learned this and said so in its header,
which I did not read closely enough.

**Sorting** is `series asc nulls last, release_year asc nulls last, work_title`.
Within a series the order you play it in is the order it came out in, which the
view already knows, so no position column. Anything with no series sorts last
rather than leading the page under a blank heading.

**Adding** is an inline field on the work page — one field, and the work page is
the only screen that represents the work itself, so a whole edit page for it
would be ceremony. The box suggests series already in use, and what you type is
matched against them case-insensitively: typing "destiny" when "Destiny" exists
joins that series rather than starting a rival spelling. Emptying the box and
saving clears it.

**Verified** against the dev database: saving "The Legend of Zelda" on Ocarina
put it in the datalist for every other work; typing `  destiny  ` on Lightfall
stored `Destiny`; and `?sort=series` ordered Destiny 2 (2017), Shadowkeep
(2019), Lightfall (2023), then Ocarina (1998), Master of Time (2021), Ship of
Harkinian (2022) — series alphabetically, release order inside each, and before
Shadowkeep was given a series it sorted last on its own, which is the nulls-last
rule doing its job.

Dev works now carry real series values rather than being put back as they were:
they are correct, and clearing them is
`update works set series = null;` if they are not wanted.

Not done, and worth saying: there is no "group by series" on the shelf, only the
sort. The grouping machinery would take one line, but the ask was sorting.
IGDB's `collections` could fill this in automatically on add; nothing here reads
that field yet.

---

## 2026-10-11 — Grouping by series, and IGDB filling it in

**Group by series** is one entry in `GROUPINGS` and one case in `bucketFor`,
with the same "unknowns last" rule platform already uses, so the games in no
series collect at the bottom under "No series" rather than leading the page.

**IGDB fills it in on add**, and the interesting part is which field.
`collections` is the one that looks right and is not: Ocarina of Time comes back
in two of them — "The Legend of Zelda" and "The Legend of Zelda: Ocarina of
Time", the second being a grouping of that one game's re-releases — and the
order is not stable between games. Breath of the Wild returns the same pair the
other way round. Taking the first would have filed Ocarina in a series of one,
which looks correct in a list and is wrong, which is §4a's whole complaint about
guessing.

`franchises` is the dependable field: "The Legend of Zelda" for both Zelda games,
"Destiny" for Destiny 2, "Grand Theft Auto" for GTA V. So `seriesFor` takes the
franchise, and only falls back to a collection when there is no franchise —
skipping any collection named after the game itself, shortest first, since the
broader series has the shorter name. That was learned by asking IGDB rather than
by assuming: the probe is in this entry's commit message.

What IGDB returns is matched against the series already in the database, so its
"Destiny" joins a hand-typed "destiny" instead of standing next to it in the
grouping. The read goes through the transaction, so a second game added in the
same import batch sees the first one's series.

**Verified.** Eleven unit cases over `seriesFor` and `canonicalSeries` built from
the live response shapes — franchise beating a same-named collection in both
collection orders, franchise-only, collection-only, collection named after the
game, nothing at all, blank names, and the case-insensitive join. Then end to
end: adding Breath of the Wild from search stored `The Legend of Zelda` with
nobody typing it, and "Breath of the Wild Multiplayer" — a mod IGDB files under
no franchise — correctly stored nothing. The shelf then grouped Destiny 3, The
Legend of Zelda 4, No series 1. Both test works and their covers removed
afterwards.

**This only fills in works added from now on.** The 324 already on the shelf
keep whatever they have, because `igdb_payload` was stored before `franchises`
was in the field list — so the answer is not in the cached payload and a
backfill means refetching each game from IGDB at four a second. That is a
Settings action with progress, like the Grouvee import, and it is not built.

---

## 2026-10-11 — Backfilling series from IGDB

The series feature only filled in works added after it existed, which left a
shelf of 324 games blank. `igdb_payload` cannot answer it — those payloads were
cached before `franchises` was in the field list — so the only way is to ask
IGDB again.

A Settings section, driven a chunk at a time from the browser the way the
Grouvee import is: fifty works per round trip, one IGDB request each, progress
after every chunk. A few hundred works is around a minute, and a single server
action running that long with nothing on screen is indistinguishable from one
that has hung.

**It only ever writes where the series is null**, twice over: the listing
selects on `series IS NULL`, and the update repeats the condition, so a series
typed between listing and chunk still wins. Overwriting a name someone chose
with IGDB's opinion is not undoable and is the opposite of helpful.

What IGDB returns is matched against the series already stored, so a backfill of
a shelf that already has a hand-typed "destiny" does not add "Destiny" beside
it. Names learned within a chunk join the list as they go.

**"Clear every series" sits next to it**, because the button writes a few
hundred rows at once and undoing that one work page at a time is not an undo.

**Verified** against live IGDB on the dev database:

| | |
|---|---|
| Three blanks, one set by hand | `3 of 3 · 3 filled in`, Zelda and Destiny correct |
| `Destiny 2` set to "Bungie things I like", one blank | `1 of 1`, the typed name **untouched** |
| Clear every series | `Cleared 4 series`, count back to zero |
| Run again from empty | `4 of 4 · 4 filled in` |

The second row is the one that matters: the backfill saw a game whose series
disagreed with IGDB and left it alone.

The production build failed once on this, fetching Google Fonts — `next/font/google`
wants the network at build time. Nothing to do with the change; the retry was clean.

## 2026-10-13 — Device tokens, the first slice of a JSON API

A companion phone app is now in scope, and it needs an API: until now
everything was server components and server actions, which a phone cannot
call. This is the first of several steps, and only covers signing in.

**A device token is a session row.** `sessions` gains `kind` (`cookie` or
`device`), `label`, `created_at` and `last_used_at` (`0008`). The token is
32 random bytes stored as its sha256, exactly like the cookie, so revoking,
expiry and "a new password signs everything else out" already work for it.
`kind` keeps the two apart: a cookie value sent as a bearer token is refused,
and the reverse. Devices last 180 days from last use against a browser's 30,
because a phone opened once a month should not need signing in again.

**`getCurrentUser()` reads `Authorization: Bearer` after the cookie.** That one
change is why `/covers` and `/export` work for the phone without edits.

**Routes:** `GET /api/v1/meta` (public: app name, shelves and labels, whether
sign-in is on), `POST` and `DELETE /api/v1/auth/token`, `GET /api/v1/me`.
Every route goes through `withUser()` or `publicRoute()` in `lib/api`, because
the `(app)` layout's guard does not reach `app/api`. Errors are
`{ error: { code, message } }`; signed out is 401 rather than the web's 404,
so the phone can tell an expired token from a missing game.

**Sign-in is throttled**, which it never was: ten failures per username or per
client address in fifteen minutes, in memory, for the web form and the token
endpoint alike. The address is the last `X-Forwarded-For` entry, the one the
proxy itself added.

**Settings lists signed-in devices** with a sign-out button each.

**Verified** against Postgres 16 and the production build:

| | |
|---|---|
| `0008` applied twice | second run a no-op |
| Token with right password | 201, row is `device`, labelled, 180-day expiry |
| `/api/v1/me`, `/covers/…`, `/export/json` with the token | 200 |
| Same requests with no token | 401, 404, 404 |
| Device token sent as the cookie | 401 |
| `DELETE /api/v1/auth/token`, then `/me` | 204, then 401 |
| Ten bad passwords, then the right one | 401 ×10, then 429 with `Retry-After: 900` |
| A different username from the same address | 429; from another address, 401 |
| `AUTH_DISABLED=true`, `/me` with no token | 200, `meta` says `authRequired: false` |

**Next:** move the shelf query and the entry actions into `lib/`, then the read
endpoints.

## 2026-10-13 — Shelf and entry logic moved into `lib/`

Step 2 of the API work, and nothing a person would notice. The rules for
reading a shelf and changing an entry lived inside the home page and the
version page's server actions, tied to `FormData` and `requireUser()`; the
phone's API needs to call the same rules with a user id and typed input.

- **`lib/entries`**: `entryIdFor`, `updateEntry` (any of shelf, completion,
  rating, review, spoilers, favourite, private), `markDone`, `tagEntry`,
  `untagEntry`, `ratingFrom`, `isCompletion`. Each returns false when the
  version does not exist, which is what the API will turn into a 404.
- **`lib/entries/add.ts`**: `addFromIgdb`, the add-from-search transaction and
  the cover download after it. A network failure reaching IGDB is now reported
  as an `IgdbError`, so the search page says the same thing as before; any
  other error is no longer dressed up as "IGDB request failed".
- **`lib/shelf.ts`**: `shelfRows` with the status, platform, tag and sort
  filters, plus `shelfPlatforms` and `userTags`. Grouping and DLC nesting stay
  in the page: they are how the web draws a shelf, not which rows it holds.
- The server actions are now a few lines each: read the form, call `lib/`,
  revalidate.

**Verified** against Postgres 16 with a seeded shelf (Ocarina of Time with a
decomp port, Destiny 2 with an expansion, a tag):

| | |
|---|---|
| Shelf page for 8 filter, sort and grouping combinations | byte-identical `<main>` before and after |
| Version page forms posted as a browser would: shelve, shelf, rating, review with spoilers, favourite, private, credits, clear rating, clear review, a bogus shelf | each row as expected; the bogus value changes nothing |
| Tag "  Roguelikes  ", then untag | tag created trimmed, then removed with its last entry |

Not exercised: adding from IGDB, which needs IGDB credentials this
environment does not have. It is typechecked and the transaction is moved
unchanged.

**Next:** the read endpoints, `/api/v1/shelf`, `/entries/{id}`, `/works/{slug}`,
`/search`, `/tags`.

## 2026-10-13 — Read endpoints for the phone

Step 3 of the API work: everything the phone needs to look at a shelf.

| Route | Built on |
|---|---|
| `GET /api/v1/shelf` | `lib/shelf.ts` `shelfRows`, the same query as the web shelf, paged after it |
| `GET /api/v1/entries/{id}` | `lib/entries/read.ts` |
| `GET /api/v1/versions/{id}`, `/works/{slug}` | `lib/works/read.ts` |
| `GET /api/v1/search` | `lib/search.ts`, now shared with the search page |
| `GET /api/v1/tags`, `/platforms` | `lib/shelf.ts` |

**One card shape** (`lib/api/cards.ts`) for every shelf item, built so that
bookshelf can return the same thing: id, title, subtitle, creator, cover,
shelf, rating, year, dates, series, with what only games have (platform, kind,
community, DLC parent) under `extra`. The shelf is not DLC-nested; each card
carries `extra.parentWorkId` so the phone can group it.

**The search page now reads through `lib/search.ts`**, the local-works query
and the IGDB result shaping that used to be inline in it. Its HTML is
byte-identical before and after for four searches.

Validation: unknown `shelf` or `sort`, or an out-of-range `limit`, is a 422
naming the field; a malformed or unknown id is a 404, as on the web.

**Verified** against the seeded shelf on Postgres 16 with the production
build: every route above with a device token, each filter and the paging,
each 422 and 404, and a 401 with no token. The IGDB half of search could only
be checked for its "not configured" answer.

**Next:** write endpoints: `POST`, `PATCH` and `DELETE /api/v1/entries`, and tags.


## 2026-10-13 (API step 4)

Step 4 of the API work: the phone can change the shelf, not just read it.

| Route | Built on |
|---|---|
| `POST /api/v1/entries` | `lib/entries/add.ts` `addFromIgdb` for an IGDB id, new `shelveVersion` for a version already on the server |
| `PATCH /api/v1/entries/{id}` | `updateEntry`, the function the version page's buttons call |
| `DELETE /api/v1/entries/{id}` | new `removeEntry` |
| `PUT`/`DELETE /api/v1/entries/{id}/tags/{name}` | `tagEntry`, `untagEntry` and new `tagIdByName` |

**Removing an entry is new.** The web never had it; a version or a work could
be deleted, which takes the catalogue rows with it. `removeEntry` takes only
your shelf row, which cascades its plays and tag links, then drops any tag
left on nothing, the same rule untagging already followed. That rule moved
into one function both use.

**Adding twice keeps the shelf.** A second `POST` for the same version answers
200 with the entry as it is, the way adding from search says "already on your
shelf" rather than moving it.

**A PATCH is all or nothing.** Any bad or unknown field is a 422 naming every
problem and nothing is saved, so the phone never shows a value the server did
not take.

**Tags by name**, URL-encoded: `couch%20co-op` finds "Couch co-op" by slug, as
the web's box does.

**Verified** with the production build on Postgres 16 using a device token:
each PATCH field and its clearing, each 422 together and alone, 404 for an
unknown or malformed id, 401 without a token; tagging with a new name, an
existing one in different case, a name with a slash and accents, and a blank
one; untagging, including a tag nobody has; removing an entry with a play and
a tag on it, then adding it back by version (201, then 200). Untagging from
the version page still drops an empty tag. Adding by IGDB id could only be
checked for its "no credentials" 502.

**Next:** port steps 1 to 4 to bookshelf.

## 2026-10-13 — "Living room" redesign

Jay picked direction A from the redesign mockups: a dark room, covers standing
on planks, chunky Archivo, amber for games (sage for bookshelf). CLAUDE.md §5b
is rewritten to match.

- **System** (`app/globals.css`): new tokens, Archivo as one variable family
  across its width axis (`font-display`, `font-narrow`), and `.btn`,
  `.segmented`, `.field`, `.card`, `.plank`, `.sticker`. Every page's ad hoc
  button and input classes now use them.
- **Shelves** (`/`): "Now playing" band with Finished it and Drop, then a
  sideways strip per shelf with "See all". The full wall moved to
  `/?view=all` (and any shelf/platform/tag filter), a plank under every row,
  columns from a container query.
- **Version and work pages**: the whole cover standing on a plank beside the
  title; the shelf as a segmented control; rating as ten climbing bars;
  "Ways to play" strip of the work's versions; Delete moved here.
- **Phones**: bottom tab bar (Shelves, Search, Add, More), filters in one
  sideways-scrolling row, search results wrap the add controls under the title.
- **Fixed**: the shelf tile's Delete link was invisible on touch but took the
  tap, so the lower corner of a cover opened its delete page. Tiles no longer
  carry Delete.
- `BOOKSHELF_URL` (optional) puts a link across to bookshelf in the header.

Checked in Chromium at 1280 and 390 wide against a seeded local database:
shelves, wall grouped by shelf, version, work, search, add, settings. `next
build`, lint and `check:actions` pass.

**Next:** port to bookshelf.

## 2026-10-13 — API startup check in the image build

- `publish.yml` now starts the published image against an empty Postgres
  16, the way the VM runs it, and asks `/api/v1/meta` (must answer with this
  app's name and API version 1) and `/api/v1/me` (must read the seeded
  admin, so migrations and the first user ran). On failure it prints the
  app's log.
- Checked by running the same script against a local standalone build and a
  fresh database, both passing and with a wrong app name to see it fail.
  Docker Hub was rate-limited from the test environment, so the containers
  themselves only run in Actions.
- Catalogue adds through the API are still untested: the cloud environment's
  network policy blocks the catalogue hosts.

## 2026-10-13 — SteamGridDB art when IGDB has no cover

- Tested the API's IGDB adds live: search, add on a chosen platform, the same
  game again on another platform (`keptOn`), an unknown id (404), a decomp
  port with its IGDB cover.
- **Fixed**: brief §4a says SteamGridDB is asked when IGDB returned no cover,
  but `addFromIgdb` never did, on the web or the API. It now looks up the
  work's title once, when the add creates the work: exact matches applied,
  fuzzy ones applied and flagged for `/art`, nothing below that. Checked on
  five coverless IGDB games: three got flagged art, two stayed placeholders.
- Seen, not changed: SteamGridDB's top hit for "Untitled Goop Game" is a game
  called "UNTITLED", which the substring rule counts as fuzzy, so it gets art
  flagged for review. That is the brief's tier working as written.
- Seen, not changed: IGDB's search order puts the 1998 Ocarina of Time fourth
  for "ocarina of time", behind fan projects.

## 2026-10-14 — Wishlist first on the shelves page

Jay asked for the wishlist above the backlog. The overview's strips now run
Wishlist, Backlog, Recently played, Dropped (`ROOM_ORDER` in
`app/(app)/page.tsx`), the same order the shelf nav and the wall already use.
Checked on a local database: the strips render in that order.

## 2026-10-20 — Series on the main page

Jay: "I just want to be able to collect games in a series, and sort by them on
the main page." Series already existed (`works.series`, 2026-10-11: set on the
work page, IGDB fills it, sort and group by series on the wall), but none of it
showed on the shelves overview, which is what `/` is since the redesign, and a
series had no page of its own.

- **Overview**: a Series strip after the shelves, one tile per series your
  shelf touches (any shelf), alphabetical. Each is its earliest game's cover
  with two hard box edges behind it (`.series-stack`, the same stack bookshelf
  draws for a finished comic run), the name and "2 of 3 played" above it so
  the plank stays under the art. "See all by series" opens the wall grouped
  and sorted by series. Folded in the page from rows it already had
  (`seriesOnShelf`), so no extra query.
- **Series page** `/series/{name}`: every game in the series, shelved or not,
  in release order, with your shelf (and rating) beside each, linking to the
  version. Bookshelf's series page with release order for position. The work
  page's series is now a link to it, and so is each heading of the wall when
  grouped by series.
- **Collecting**: the wall's select mode has "Put in series" beside platform
  and shelf. Writes `works.series` for the selected games' works, matched to
  an existing spelling like the work page. An empty box is refused rather than
  clearing a whole selection; the work page still clears one.
- Phone API: unchanged. Cards already carry `series` and the shelf already
  sorts by it; shelf-mobile's All tab already groups by it.

Checked against a local database with seven games added from live IGDB
(Zelda ×3, Halo ×2, Destiny, Hollow Knight): the strip showed Destiny, Halo,
The Legend of Zelda with the right counts and earliest covers; the Zelda page
listed Ocarina, Majora's Mask 3D, Breath of the Wild in release order with
Played, Backlog, Playing; selecting Hollow Knight and typing a series put it
in one. tsc, lint and `check:actions` pass.

**Next:** nothing pending here. The "Finished it" rating prompt is a separate
change.

## 2026-10-20 — A rating when you finish, and finished first

Jay asked that "Finished it" ask for a rating and put the game at the top of
Recently played.

- **The prompt** (`app/(app)/finish-prompt.tsx`): Finished it in the Now
  playing band opens a dialog with the ten climbing bars, "Skip the rating"
  (or "Keep 7 / 10" when it was rated while playing) and "Not yet". Nothing is
  written until it is answered; Not yet leaves the game playing. A rating and
  the finish go in one `markDone`.
- **The order**: Recently played already sorted by `last_finished_on`, but
  nothing had written a play since the plays UI went (2026-09-18), so a game
  finished today had no date and sorted last. `updateEntry` now records a play
  finished today whenever an entry arrives on `played` (web, phone API, the
  game's page), not when it is already there. Same-day finishes go by the
  entry's `updated_at`, so the one just finished leads. Bulk moves still write
  no play.
- Checked on a local database in Chromium: Not yet left Hades playing; rating
  it 9 moved it to played with credits, 9 and a play today; Tunic kept its 7;
  the strip read Tunic, Hades, Celeste (finished earlier today), Outer Wilds
  (no play). `tsc`, lint and `check:actions` pass.

**Next:** the phone app's Finished it does not prompt yet.


## 2026-10-20 — Series where you would look for it

Jay asked where to set a series. The field was only at the bottom of the game
page, which is a link away from the version page a cover opens. It is now a
shared `SeriesForm` on both pages (under the review on the version page), and
the version page shows the series as a link beside platform and year.
`setSeries` revalidates the version and series pages too. Checked locally on
desktop and phone; tsc and lint pass.

## 2026-10-20 — A series box that suggests

Jay: the box should offer the series already entered as you type, keep
anything new you type, and make the example obvious; then, let the example
cycle. `SeriesInput` (client) replaces the `<datalist>` on the game page, the
version page and the wall's "Put in series": matching series drop down under
the box (prefix matches first, six at most), a tap or arrows and Enter picks
one, and a line under it says when what you typed will be a new series. The
placeholder reads "e.g. …" and cycles every 2.2 s through your own series
(fixed examples when you have fewer than three), stopping once you focus the
box. `.field::placeholder` is now `--line-strong`, so an example can no longer
pass for a filled-in value anywhere. Checked on a phone-width page: "ha"
offered Halo, picking it filled the box, "Team Cherry" said it would be new.

Then: the series Save button says "Saving…" while it saves and "Saved" once
the box holds what was stored, back to "Save" when the box changes (Jay: the
page refreshes in place, so nothing showed the save happened). `setSeries`
now returns what it stored, for `useActionState` in a client `SeriesForm`.

## 2026-10-20 — The main page as an overview, and All shelves

Jay asked for the main page to show at most ten items to a shelf, as an
overview, with a place in the nav for every shelf in full.

- `STRIP_LENGTH` is 10 (was 24). The Now playing band is capped at ten too, with
  "See all N" when there are more; the Series strip already had it.
- **All shelves** replaces "All books/games" in the header and joins the phone
  tab bar as "All" (five tabs now). It opens the wall grouped by shelf
  (`/?view=all&groupBy=status`), titled "All shelves", and each shelf heading there opens that
  shelf alone. The nav marks it current for any wall (a shelf or tag filter
  too), not only `view/show=all`.
- The "See them all, with filters" link under the strips is gone (Jay):
  All shelves does that job.
- Checked on a local database with Chromium, desktop and phone. tsc and lint
  pass.


## 2026-10-20 — Delete the game or just this version

Jay asked that Delete on a page offer removing just that version or the whole
game, the whole game by default. The version page's Delete (and the edit
page's) opens `/version/{id}/delete`, which now has a segmented switch, "The
whole game" preselected, with the heading, the summary of what goes and the
button following the choice. A game with one version shows no switch: a work
never stands without a version, so its last one only goes with it, and
`deleteFromVersion` enforces the same on the server. The work page's Delete is
unchanged (it was already the whole game). The phone app only removes entries
from the shelf, so the API is untouched.

Checked on a local database in Chromium at phone width: whole game removed
Celeste and its entry and landed on the shelf; Just this version removed Ship
of Harkinian and left Ocarina with N64 (NTSC), landing on the game; Ocarina's
last version then showed no switch. tsc, lint and `check:actions` pass.

## 2026-10-20 — New icons

Jay asked for new icons for both web apps, a distinct pair, and a matching
one for the phone app. Jay picked the rating sticker from three directions.

- `app/icon.svg`: an amber sticker tilted right with a heavy Archivo "G" in
  the ground colour, on a ground tile (bookshelf has the sage "B").
- `app/favicon.ico` (16/32/48), `app/apple-icon.png` (180, full bleed) and
  `public/icons/` (192, 512, maskable 512) are rendered from it; the new
  `app/manifest.ts` lists the PNGs for "Add to home screen".
- tsc and lint pass.

## 2026-10-20 — DLC under its game

Jay wasn't happy with DLC: it should be added under each game, and each game
should be able to show its DLC as separate entries on the shelf.

- **Under the game.** The game page and each of its (official) versions'
  pages have a DLC strip under Ways to play: each DLC's cover on a plank, its
  name without the game's prefix ("Forsaken", not "Destiny 2: Forsaken"), your
  shelf and rating sticker. A tap opens it; it is still a work of its own, with
  its own entry, rating and review. A DLC's own pages say "DLC for Destiny 2".
- **Add DLC** (`/work/{slug}/dlc`) lists what IGDB hangs off the game
  (`parent_game`, game types DLC/expansion/standalone/episode/season), the
  expansions first and seasons after, each with the search page's Add (the
  platform starts on the game's own). Ones already here link to their page.
  "Not listed?" makes one by hand: a local work under the game, its version on
  the game's platform, your entry, and one SteamGridDB lookup.
- **Parents always found.** Adding DLC whose game is not here brings the game
  in from IGDB (work and version, no entry). Adding a game adopts DLC already
  here by its stored `parent_game`; migration `0009` did the same for
  existing DLC whose game was here. Older DLC whose game is not here shows
  "Its game is not here yet. Bring it in from IGDB".
- **The shelf.** The global "Show DLC separately" checkbox (and its `dlc`
  preference) is gone. A DLC leaves the shelf when its game is on your shelf
  anywhere within the same platform/tag filters, unless the game is set to
  "As separate games" (`works.dlc_on_shelf`, a segmented switch under the DLC
  strip). A DLC you are playing still shows on Playing unless the game is
  there too, so Now playing never hides what you are playing. The wall's count
  says "7 games, 5 DLC under their games". `lib/dlc.ts`.
- **API.** `GET /shelf?dlc=fold` applies the same rule (`dlcUnder` counts what
  it left out); without it the shelf is unchanged, so the phone app as built
  still works. `GET /works/{slug}` children carry versionId, entryId, status,
  rating, cover and year, plus `dlcOnShelf`; `PATCH /works/{slug}` sets it.
- Search results say "expansion"/"dlc" in front of the platforms.

Checked on a local database with real IGDB data (Witcher 3 and two
expansions, Destiny 2 and three, Shadow of the Erdtree as an orphan) in
Chromium on desktop and phone width; tsc, lint and `check:actions` pass.

Next: the phone app should ask for `?dlc=fold`, show each DLC's shelf in the
work screen, and offer the "Under the game / As separate games" switch.

## 2026-10-20 — deploy on push

- `publish.yml` gains a `deploy` job: after the image is published and
  smoke-tested, a self-hosted runner on the VM (label `shelf-vm`) pulls it,
  `docker compose up -d`, prunes old images and waits for `/api/v1/meta`.
  It uses the commit's own compose file with `--project-directory
  $DEPLOY_DIR`, so the VM's clone needs no credentials or `git pull`.
- Off until the repository variable `DEPLOY_DIR` is set; README "Deploying on
  push" has the runner setup. Checked: the workflow parses, and `docker
  compose config` with `--project-directory` resolves `.env`, the project name
  and the `../<app>-data` mounts against the deploy directory. Not yet run on
  the VM.

## 2026-10-20 — DLC pre-filled, one press to shelve

Jay: can DLC be pre-filled, so you just press its shelf?

- The first time a game's page is opened (the version page a cover opens, the
  game page, or `GET /api/v1/works/{slug}`), `fillDlcOnce` (`lib/dlc-fill.ts`)
  asks IGDB once for the game's DLC, expansions and standalone expansions
  (full payloads, one request) and places each as a work and original version
  with no entry, on the game's platform where it came out there. Covers are
  downloaded in `after()`, so the first view shows placeholders. Claimed with
  `works.dlc_filled_at` (migration `0010`) so it runs once; reset on failure,
  so offline just tries again next time. Seasons and episodes stay on Add DLC.
- The DLC section is now a list: cover, name, kind, year, rating, and the
  shelf segmented control. A press shelves it or moves it (`setDlcStatus` →
  `updateEntry`, so arriving on Played records a play).
- `placeIgdbGame` / `artForPlaced` came out of `addFromIgdb` so the fill
  reuses the add's rows and art rules.
- `POST /api/v1/entries` with a versionId and `shelf: "played"` now records a
  play for a new entry, as the web does, for the phone's one-press shelving.

Checked locally with Destiny 2: 13 DLC appeared on first view (about 8 s,
once), covers on the next; pressing Played on Shadowkeep shelved it with a
play, and it stayed off the shelf under its game.

## 2026-10-20 — Restore from an export

Jay asked for each app to import its own export, to restore a library or
move it to another server. Built with bookshelf's, as a pair.

- **Settings → Export and restore** gains "Restore from an export": the JSON
  download, read once (`lib/import/restore.ts`, which also refuses a
  bookshelf file by name) and sent back from the page ten entries at a time
  (`RESTORE_CHUNK`) with progress, Stop, and the failures listed.
- `lib/import/restore-run.ts`: one IGDB request per batch for games not here
  yet. A game is joined by IGDB id, else a local game of the same title and
  kind; its version by name and kind; an entry already on the shelf is left
  alone, so a second run adds nothing. New games take the file's title,
  series, summary and DLC switch over IGDB's; a DLC's game comes in without an
  entry (`placeIgdbGame`). Art as on add: IGDB, else the SteamGridDB game it
  was matched to, else a lookup — a community version by its own name.
- The export now carries `work.series`, `summary`, `dlcOnShelf`,
  `sgdbGameId`, `parentIgdbId` and `version.igdbId`. Older exports restore
  without them.

Checked on a local database: Ocarina of Time (renamed, series, rating,
review, a play, a tag), a romhack on it with its base version, The Witch
Queen (with Destiny 2 brought in) and a local homebrew, exported, restored
into an empty database through the Settings page, exported again: identical
but for the romhack, which now has SteamGridDB art it never had. Running it
again: 4 already here. A bookshelf export is refused with a message. tsc,
lint and `check:actions` pass. Uploaded art is not in the export, so it is
looked up again rather than restored.

## 2026-10-20 — tab titles

- Every page's tab said only "gameshelf". The root layout now has a title
  template, "%s · gameshelf", and each page names itself, as its heading
  does: a version page by its game's title, or a romhack's own name ("Edit
  …", "Delete …", "Art for …" on its other pages), a game and its Add DLC /
  Add a version pages, a series by name, the wall by its heading ("All
  shelves", "All games", a shelf, a tag or a platform), "Search: zelda",
  "Add a romhack", "Settings" and so on. The overview stays plain
  "gameshelf". Lookups are in `app/(app)/page-titles.ts`; each checks the
  session first. Same change in bookshelf.
- Checked on a local database: every page's `<title>`. tsc, lint and
  `check:actions` pass.

## 2026-10-20 — Rename and remove a series

Jay asked for a way to edit and remove series, and to take games out of one.
All on the series page (`series/[name]/actions.ts`):

- **Rename**: a Name box and Rename. A name that matches another series
  (ignoring case) joins the two; the series' own name is left out of that
  match, so "zelda" can become "Zelda". Lands on the renamed page.
- **Remove the series**: a confirm page, as deleting a game has. Clears
  `works.series` on every game in it; games and entries stay.
- **Take out**: on each row, clears that game's series. The last one out
  goes back to the shelves, since the page no longer exists.

Checked on a local database in Chromium at phone width: Halo renamed to
"halo", one game taken out, the series removed, both games still there.
tsc, lint and `check:actions` pass.

## 2026-10-20 — Romhacks as games of their own

Jay: a romhack should be its own thing, separate from its base game — details
pulled from the base when it is made, but its year, ways to play and the rest
its own.

- **Model.** `works.based_on_work_id` (migration `0011`, `ON DELETE SET NULL`):
  a romhack is a local main game based on its original. Its versions, kind
  `romhack`, are its ways to play; `base_version_id` still names the release
  it patches, on the original's work. `OWN_WORK_VERSION_KINDS` /
  `isCommunityVersionKind` (`lib/db/schema.ts`) and `entry_cards` now treat a
  romhack version like an official one: the work's art and title, no band.
- **Migration.** Every romhack version on another game moves to a new local
  work (same-named ones on one game become one work with several ways to
  play): the hack's name, the original's series and summary, the hack's date
  else the original's, and its art moved up to the work. Versions keep their
  ids, so entries, plays, tags, ratings and reviews are untouched (checked by
  hashing them before and after on seeded data). Running it twice moves
  nothing.
- **Adding.** Door A and Door B make a new work (`lib/romhacks.ts`); Door A's
  original now arrives with its own release (no entry) via `placeIgdbGame`,
  so it is never a game with no versions. Door B on a romhack's page is "Add a
  way to play". A new romhack plays where what it patches does unless the form
  says otherwise.
- **Editing.** `/work/{slug}/edit` (any game): title, release date, summary.
  The version edit page offers a romhack's original's releases as what it
  patches, and refuses turning a romhack into another kind or back.
- **Pages.** "Romhack of …" on its game and version pages; the original lists
  its "Romhacks"; no DLC section on a romhack. Tiles no longer repeat a title
  as the subtitle.
- **Export/restore.** The export carries `work.basedOn` / `basedOnIgdbId`;
  restore links them (fetching the original from IGDB if missing) and turns an
  older export's romhacks into games of their own, as the migration does.
  Restore now matches a version by platform and label as well as name and
  kind, since a romhack's ways to play often share its name.
- **API.** `GET /works/{slug}` gains `basedOn` and `romhacks`; cards already
  say `community: false` for romhacks via the view.

Checked locally: migration on seeded data and through `drizzle-kit migrate`
and the production migrate bundle; adding through Add, a game's page and a
romhack's page; editing; the delete page (hacks stay); export then restore of
new and old-format files into empty databases, twice. tsc, lint and
`check:actions` pass.
