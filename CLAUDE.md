# gameshelf — Project Brief

Self-hosted game tracker. Goodreads' interaction model, IGDB's catalogue, and
first-class support for romhacks, fan translations, decomp ports and recomps.

Single-user by default, multi-user capable. Runs as two containers on a home
server. No SaaS dependencies beyond the IGDB API.

---

## 1. Non-negotiables

These shape every other decision. Do not quietly relax them.

1. **Local versions are equal citizens.** A romhack entry must be as easy to
   create, shelve, rate and review as a commercial release. No second-class
   "custom game" flow bolted on the side.
2. **IGDB data is cached, never mirrored wholesale.** We fetch on demand and
   store what we fetched. We never run a bulk import, and the app must work
   fully offline once a work is cached.
3. **Simple beats complete.** Goodreads-simple. If a feature needs a settings
   page to explain it, it is out of scope for v1.
4. **The data model is the product.** Get works/versions/entries/plays right;
   everything else is CRUD over it.

---

## 2. Data model

Full DDL in `schema.sql`. Read it before touching anything database-shaped.

The core split, in plain terms:

```
work        Ocarina of Time                    (usually an IGDB row)
 └ version  N64 (NTSC)              original   (IGDB)
 └ version  Ship of Harkinian       decomp_port(local)
 └ version  Master of Time          romhack    (local, base = N64 NTSC)
     └ entry   Jay's shelf row: status, rating, review
         └ play   Mar 2026, 41h, credits
         └ play   Aug 2026, 12h, dropped
```

### Two hierarchies, and they are not the same thing

This is the easiest part of the model to get wrong. There are two parent links
and they mean different things:

- `works.parent_work_id` — **more content**. DLC, expansions, seasons.
- `versions.base_version_id` — **the same content, differently**. Romhacks,
  ports, recomps, translations.

```
work  Destiny 2                     main_game
 └ work  The Witch Queen            expansion   → own versions/entry/rating
 └ work  Lightfall                  expansion
 └ work  The Final Shape            expansion
```

An expansion is never a version. A version never adds content. If a proposed
feature blurs these, the feature is wrong, not the model.

Consequences to honour in the UI:

- DLC gets its own shelf row, its own rating and its own review. That is the
  point — the base game and the expansion are rated separately.
- Work pages show child works beneath the version list, not mixed into it.
- Shelf view needs a "group DLC under parent" toggle. Default on, or a
  Destiny 2 player's shelf is 90% Destiny 2.
- Live-service base games are never "finished". Leave Destiny 2 sitting in
  `playing` indefinitely; the expansions carry the completions. No special
  status enum for this.

Rules:

- A **work** is the abstract game. Its `igdb_id` is unique and nullable.
  `source = 'local'` works exist for things IGDB has never heard of.
- A **version** is what you actually played. Every work has at least one.
  Derived versions set `base_version_id` to what they patch or port.
- An **entry** is unique per `(user_id, version_id)`. Rating and review live
  here, so you can rate the hack differently from the original. That is the
  point.
- A **play** is one run through. Replays are new plays, not edits.
- **Status** (`wishlist`/`backlog`/`playing`/`played`) is a state machine and is
  separate from the free-form tags an entry can carry.
  - The interface calls the four statuses **shelves** — Goodreads' model, where
    the state you are in is the shelf it sits on — and calls the free-form ones
    **tags**. The column, the enum and the `shelves` table keep their names;
    this is language, not a migration. Decided 2026-09-17.
  - There is no `dropped` or `shelved`: both meant "I stopped" and neither could
    say it differently from the other. How far you got is `plays.completion`.
    Removed in migration `0005`.

When adding a feature, ask which of these four tables it belongs to. If the
answer is "a new table", push back on the feature first.

---

## 3. Stack

| Layer      | Choice                                   |
|------------|------------------------------------------|
| Framework  | Next.js (App Router), TypeScript strict  |
| DB         | PostgreSQL 16                            |
| ORM        | Drizzle (schema mirrors `schema.sql`)    |
| Styling    | Tailwind                                 |
| Auth       | Argon2id password + DB session cookie    |
| Images     | Next/Image, IGDB covers proxied + cached |
| Deploy     | Docker Compose, two services             |

No Prisma, no NextAuth, no component library. Server Components and server
actions for everything; client components only where interaction demands it.

### Why these

Drizzle because the SQL is already written and we want it to stay readable.
Hand-rolled auth because single-user auth is 80 lines and NextAuth is a
dependency treadmill. Tailwind because the UI is deliberately plain.

---

## 4. IGDB integration

- Auth is Twitch OAuth client credentials. `IGDB_CLIENT_ID` and
  `IGDB_CLIENT_SECRET` in env. Tokens last ~60 days — cache in the DB, refresh
  on 401, never on every request.
- Rate limit is roughly 4 requests/second. One user will never hit it, but the
  client must still serialise and back off rather than fan out.
- All IGDB access goes through `lib/igdb/` . No `fetch` to IGDB anywhere else.
- On search: query IGDB, show results, and only write a `works` row when the
  user actually adds something. Do not cache search misses.
- Store the raw response in `works.igdb_payload` so fields can be re-derived
  later without a refetch.
- Covers: download once on add, store under `/data/covers/`, serve locally.
  IGDB image URLs rot and we want the app to survive offline.

## 4a. SteamGridDB (cover art)

IGDB supplies the catalogue; SteamGridDB supplies the art that IGDB does not
have. Community-uploaded, not limited to Steam releases, which is what makes it
the right source for romhacks and fan ports.

- API v2, `https://www.steamgriddb.com/api/v2`, key in `SGDB_API_KEY`.
  Use the official `steamgriddb` npm wrapper. All access through `lib/sgdb/`.
- **There is no IGDB → SteamGridDB id mapping.** Lookup is by SGDB game id,
  Steam appid, other store ids, or free-text search. So matching is done on
  title, and the confidence of that match decides whether we apply art
  silently, apply it with a flag, or decline to guess.

### Automatic lookup

SteamGridDB is queried automatically in two cases:

1. **IGDB returned no cover** for a work.
2. **The version is a community release** — `romhack`, `translation`,
   `decomp_port`, `recomp`, `mod`, `homebrew`. IGDB will never have these, so
   going straight to SGDB is the expected path, not a fallback.

**Search with the right string.** This is the part that goes wrong:

- Official works/versions search on `works.title`.
- Community versions search on `versions.name` — the hack or port name
  ("Master of Time", "Ship of Harkinian"), **never** the parent work's title.

Searching the parent title for a romhack returns the original's boxart, which
looks correct and is wrong. That is a worse outcome than no art at all. A
community version never inherits `works.cover_url`; it shows a placeholder
until it has its own.

**Confidence tiers**, applied to the top result:

| Match | Action |
|---|---|
| Normalised title equal (case, punctuation, articles, edition suffixes stripped) | Apply. `cover_needs_review = false` |
| Fuzzy or substring match | Apply. `cover_needs_review = true` |
| No result | Placeholder. No art written, no flag |

Take the highest-scoring grid from the result set. Filter `nsfw` and `humor`
out of automatic selection; leave both available in the manual picker.

Surface a **covers needing review** filter on the shelf. Choosing art manually
clears the flag. Auto-lookup runs once on add and never re-runs on its own —
refresh is a manual action, so art you have approved is never silently
replaced.

### Manual override

Always available regardless of what automation did:

1. "Change art" → SGDB picker, seeded with the title used above.
2. Paste a SteamGridDB URL or game id. Keep this visible rather than hidden
   behind a disclosure — it is the reliable path for obscure hacks.
3. Direct file upload. `cover_source = 'upload'`.
- Persist `sgdb_game_id` once chosen so a later refresh reuses the match.
- Fetch `grid` type for covers. Heroes, logos and icons are out of scope; do
  not build a theming system.

### Adding a local version (the important flow)

From any work page: **Add version** → name, kind, platform, optional base
version, author, URL, notes. That is it. No approval, no moderation, no
"submit to catalogue". It is your server.

From search: if nothing matches, **Create work manually** with the same minimal
form. Used for doujin games, prototypes, unreleased builds.

---

## 5. Screens (v1 scope)

1. **Shelf** — the home page. Grid or list of entries, filter by status,
   platform, shelf. Sort by added/rated/finished.
2. **Search** — one box, IGDB results and local works interleaved, clearly
   marked. Add to shelf inline.
3. **Work page** — cover, summary, list of versions. Add version here.
4. **Version page** — your entry, rating, review, play history.
5. **Stats** — games finished per year, hours, platform breakdown. One page,
   no dashboard sprawl.
6. **Settings** — IGDB credentials check, export.

Out of scope for v1: social features, following, public profiles, Steam import,
achievements, recommendations, mobile app. Note them in `IDEAS.md` and move on.

### Add flows

There is **one** add flow. It always produces a version attached to a work.
Two entry points differ only in what is known first:

```
Door A — "Add game" in the top bar
  type selector: Game | Romhack | Recomp / port | Translation | Homebrew
  └ Game       → IGDB search → pick → version defaults to 'original'
  └ Romhack,   → name first, then base game, then details
    Recomp,
    Translation
  └ Homebrew   → creates a local WORK, not a version (see below)

Door B — "Add version" on an existing work page
  base game already known; straight to name + kind + details
```

Door B is Door A with the base game pre-filled. Build the form once and pass
the known fields in. Do not write two components.

**Community version form** (romhack, translation, decomp_port, recomp, mod):

| Field | Notes |
|---|---|
| Name | Required. The hack's own name. Drives the art search. |
| Kind | Required. Pre-selected by which door was used. |
| Base game | Required. Inline IGDB search; "create manually" if absent. |
| Base version | Optional. Which release it patches. Do not force a choice. |
| Author | The hack author or port team → `versions.author` |
| Version label | "v1.2.1", "Rev A" |
| Release date, URL, notes | All optional |

**Art lookup while the form is open.** On blur of the Name field, fire the
SteamGridDB search through a server action and show candidates inline. The user
keeps filling in details while it resolves. Nothing is persisted until final
submit — no draft rows, no orphan cleanup, and abandoning the form leaves no
trace. Confidence tiering from section 4a decides whether a result is
pre-selected or merely offered.

**Homebrew and original fan games are works, not versions.** They modify
nothing, so there is no parent to attach to. The Homebrew option creates a
local work with `source = 'local'`, then its own `original` version. If a form
is asking "what game is this based on?" and the honest answer is "nothing",
the user picked the wrong door — offer to switch rather than making them
invent a parent.

### Export

JSON and CSV export of everything, available from day one, no auth ceremony
beyond being logged in. This is a self-hosted app; data portability is table
stakes and it is much easier to build now than to retrofit.

---

## 5b. Visual design

The shelf is a wall of cover art. The art is the content; the interface is the
frame around it. Personality lives in how provenance is expressed, not in
decorated chrome.

### Tokens

```
--ground    #2E3439   mid-slate page. Not near-black, not cream.
--panel     #373E44   raised surfaces, form fields
--line      #464E55   hairlines
--ink       #E8E6E1   primary text
--ink-dim   #98A1A8   metadata, secondary
--label     #C08A3E   muted ochre. Community provenance only.
```

A mid-tone ground rather than a dark one: cover art from four decades sits on
it without the 8-bit palettes glowing or the modern art disappearing. Galleries
hang work on mid greys for the same reason.

`--label` is the only chromatic value in the app and it means exactly one
thing: this release is unofficial. Never use it for buttons, links, focus, or
emphasis. If it starts appearing on things that are not community releases, it
has stopped carrying meaning.

### Type

- **Archivo** throughout. Archivo Narrow for dense metadata rows and version
  tables — same superfamily, so it reads as one voice at two densities.
- **A mono face for literal codes only**: version labels, region codes, patch
  checksums. These are genuinely fixed-width data. Mono anywhere else — field
  labels, nav, buttons — is the tell, not the technique.
- Two weights, 400 and 500. No 600, no 700.
- Sentence case everywhere. No all-caps labels, no tracked-out eyebrows above
  headings, no em-dash-joined meta strings.

### Layout

Covers sit flush in a dense grid with hairline gaps — a shelf, not a feed of
cards. No border radius, no shadows, no hover lift on every tile. Metadata
appears on selection, not permanently under each cover.

```
┌────┬────┬────┐
│    │    │    │   covers flush, 1px gaps
│    │▓▓▓▓│    │   ▓ = label band on a community release
├────┼────┼────┤
│    │    │    │
└────┴────┴────┘
```

### The label band

The one bold element. Community versions (`romhack`, `translation`,
`decomp_port`, `recomp`, `mod`) render a solid `--label` band across the lower
portion of the cover, carrying the version name and author in Archivo Narrow.
It reads as a cartridge label applied over the boxart.

Official releases get no band, no badge, no marker. The absence is the signal.

Do not extend this into a system — no second band colour for DLC, no icon set
for version kinds. Spend the boldness here and keep everything else silent.

### Motion

One orchestrated moment: the shelf grid resolving as covers load. Beyond that,
motion only answers an action — a panel opening, art being applied, an entry
saving. No fade-and-slide on section entry, no transitions on card hover.

### Deliberately not doing

Cream backgrounds with terracotta accents; near-black with one acid accent;
identical rounded cards with soft grey shadows; all-caps eyebrow labels;
arrows appended to button text; numbered step markers on things that are not
sequences. These are defaults rather than decisions, and they show up
regardless of subject.

## 6. Development

Dev happens on a Windows workstation; production is Linux. Use **WSL2** for
development so the two environments match — Node on Windows with a Linux
container backend causes path, line-ending and file-watching problems that eat
hours for no benefit.

```bash
# In WSL2 (Ubuntu 24.04)
node --version            # 22 LTS
docker compose up -d db   # Postgres only; app runs on the host
npm run dev               # http://localhost:3000
```

- Repo lives in the WSL2 filesystem (`~/code/gameshelf`), **not** `/mnt/c/`.
  Cross-filesystem access is slow enough to break hot reload.
- `.gitattributes` sets `* text=auto eol=lf`.
- `npm run db:push` applies Drizzle schema changes in dev.
- Migrations are generated (`db:generate`) and committed before anything is
  deployed to the server.

---

## 7. Deployment (Proxmox)

Target is a Debian 13 VM, not an LXC. Docker inside an unprivileged LXC needs
`nesting=1` and `keyctl=1` and still produces odd storage-driver failures; a
2 vCPU / 2 GB VM avoids the whole category of problem and snapshots cleanly.

```
docker compose up -d      # app + db
```

- Postgres data on a bind mount, not a named volume, so the Proxmox backup
  covers it.
- `pg_dump` nightly via cron to the same path.
- Reverse proxy terminates TLS; the app listens on plain HTTP internally.
- Env vars: `DATABASE_URL`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`,
  `SESSION_SECRET`, `ORIGIN`.

---

## 8. Conventions

- **`PROGRESS.md`** is the dev log. Append a dated entry at the end of every
  working session: what changed, what broke, what is next. Read it at the start
  of every session before doing anything else.
- Commits are conventional (`feat:`, `fix:`, `chore:`), present tense.
- One migration per logical change, never squashed after being applied.
- Server actions live next to the route that uses them; shared logic goes in
  `lib/`.
- No `any`. No `@ts-expect-error` without a comment explaining the plan.
- Comments explain *why*, never *what*.

---

## 9. Build order

Work through these in sequence. Do not start the next until the previous one
runs end to end.

1. Scaffold, Docker Compose, Postgres up, Drizzle schema matching `schema.sql`.
2. Auth: single user seeded from env, login, session cookie, protected routes.
3. IGDB client + search page. Results render, nothing persists yet.
4. Add-to-shelf: creates work, version and entry in one transaction.
5. Shelf page with status filtering.
6. The unified add form (section 5a) plus SteamGridDB lookup. Verify a
   romhack end to end through Door A, then the same hack through Door B on
   an existing work page. If the two paths need different code, stop and fix
   the form before continuing.
7. Entry detail: rating, review, plays. Marking done defaults to `credits`
   with the other levels one click away — never a required dropdown.
8. Tags (free-form, on top of the four shelves).
9. Stats.
10. Export.

Ship after 6. Everything past that is refinement on a thing that already works.
