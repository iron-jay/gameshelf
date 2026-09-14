-- ============================================================
-- gameshelf — Postgres schema
-- Goodreads-shaped game tracker with first-class romhack support
-- Target: PostgreSQL 16+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fuzzy title search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------

-- Where a record came from. 'igdb' rows are cached upstream data and
-- may be refreshed; 'local' rows are user-authored and never overwritten.
CREATE TYPE source_kind AS ENUM ('igdb', 'local');

-- What a version *is*, relative to its parent work.
CREATE TYPE version_kind AS ENUM (
  'original',      -- the original commercial release
  'port',          -- official port to another platform
  'remaster',
  'remake',
  'compilation',   -- included in a collection/anthology release
  'romhack',       -- community ROM modification
  'translation',   -- fan translation
  'decomp_port',   -- decompilation-based native port (Ship of Harkinian, 2Ship2Harkinian)
  'recomp',        -- static recompilation (Zelda64Recomp, UnleashedRecomp)
  'mod',           -- PC mod / total conversion
  'homebrew',
  'other'
);

-- What a work *is*, relative to its parent work.
-- Mirrors IGDB's game category so the mapping is mechanical.
CREATE TYPE work_kind AS ENUM (
  'main_game',
  'dlc',                  -- add-on requiring the base game
  'expansion',            -- large add-on requiring the base game
  'standalone_expansion', -- playable without the base game
  'episode',              -- episodic release
  'season',               -- live-service season / annual pass content
  'bundle'                -- collection containing other works
);

-- Where a cover image came from, so it can be re-fetched or left alone.
CREATE TYPE art_source AS ENUM ('igdb', 'steamgriddb', 'upload');

CREATE TYPE log_status AS ENUM (
  'backlog',
  'playing',
  'played',
  'dropped',
  'shelved',       -- paused indefinitely, not abandoned
  'wishlist'
);

-- The UI default when marking something done is 'credits'.
-- 'mastered' absorbs platinum trophies, 1000G and 100% completion — they
-- differ by platform but not in a way worth three separate enum values.
CREATE TYPE completion_level AS ENUM (
  'unfinished',
  'credits',       -- reached the end
  'completed',     -- end + most optional content
  'mastered'       -- 100% / platinum / all achievements
);

-- ------------------------------------------------------------
-- Users
-- ------------------------------------------------------------

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      text NOT NULL UNIQUE,
  display_name  text,
  password_hash text NOT NULL,
  is_admin      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions(user_id);

-- ------------------------------------------------------------
-- Platforms (cached from IGDB, extendable locally)
-- ------------------------------------------------------------

CREATE TABLE platforms (
  id           serial PRIMARY KEY,
  igdb_id      integer UNIQUE,           -- NULL for locally-added platforms
  name         text NOT NULL,
  abbreviation text,
  source       source_kind NOT NULL DEFAULT 'igdb'
);

-- ------------------------------------------------------------
-- Works — the abstract game. "Ocarina of Time", not any one build.
-- ------------------------------------------------------------

CREATE TABLE works (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  igdb_id             integer UNIQUE,    -- NULL => locally created work
  slug                text NOT NULL UNIQUE,
  title               text NOT NULL,

  -- DLC, expansions and seasons are works in their own right, hanging off
  -- the base game. They get their own versions, entries, ratings and reviews
  -- so "The Final Shape" can be logged separately from "Destiny 2".
  work_kind           work_kind NOT NULL DEFAULT 'main_game',
  parent_work_id      uuid REFERENCES works(id) ON DELETE CASCADE,

  sort_title          text,              -- "Legend of Zelda, The"
  summary             text,
  first_release_date  date,
  cover_url           text,
  cover_source        art_source,
  -- Set when art was auto-applied from a non-exact match. Drives the
  -- "covers needing review" filter.
  cover_needs_review  boolean NOT NULL DEFAULT false,
  -- SteamGridDB has no IGDB cross-reference, so once a match is made by hand
  -- we keep the id rather than re-solving it on every refresh.
  sgdb_game_id        integer,
  -- Raw IGDB payload kept verbatim so we can re-derive fields later
  -- without another API round trip. NULL for local works.
  igdb_payload        jsonb,
  igdb_synced_at      timestamptz,
  source              source_kind NOT NULL DEFAULT 'igdb',
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT works_no_self_parent CHECK (id <> parent_work_id),
  -- A main game never hangs off anything. Everything else may.
  CONSTRAINT works_parent_required CHECK (
    work_kind <> 'main_game' OR parent_work_id IS NULL
  )
);

CREATE INDEX works_title_trgm_idx ON works USING gin (title gin_trgm_ops);
CREATE INDEX works_source_idx ON works(source);
CREATE INDEX works_parent_idx ON works(parent_work_id);
CREATE INDEX works_kind_idx ON works(work_kind);

-- ------------------------------------------------------------
-- Versions — the thing you actually played.
--
-- Every work gets at least one version. A romhack is a version whose
-- kind is 'romhack' and whose base_version_id points at the ROM it
-- patches. This is the whole trick: local versions hang off canonical
-- IGDB works without contaminating the cached upstream data.
-- ------------------------------------------------------------

CREATE TABLE versions (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_id          uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  name             text NOT NULL,        -- "N64 (NTSC)", "Master of Time", "Ship of Harkinian"
  kind             version_kind NOT NULL DEFAULT 'original',
  platform_id      integer REFERENCES platforms(id) ON DELETE SET NULL,

  -- For derived versions: what this was built on top of.
  base_version_id  uuid REFERENCES versions(id) ON DELETE SET NULL,

  release_date     date,
  version_label    text,                 -- "v1.2.1", "Rev A", "8.0.6"
  author           text,                 -- romhack author / port team
  url              text,                 -- release page, repo, patch source
  cover_url        text,                 -- override art for hacks with custom covers
  cover_source     art_source,
  cover_needs_review boolean NOT NULL DEFAULT false,
  sgdb_game_id     integer,
  notes            text,

  igdb_id          integer,              -- set when this maps to an IGDB "game" row
  source           source_kind NOT NULL DEFAULT 'igdb',
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT versions_no_self_base CHECK (id <> base_version_id)
);

CREATE INDEX versions_work_idx ON versions(work_id);
CREATE INDEX versions_base_idx ON versions(base_version_id);
CREATE INDEX versions_kind_idx ON versions(kind);

-- ------------------------------------------------------------
-- Log entries — one per (user, version). The shelf row.
-- ------------------------------------------------------------

CREATE TABLE entries (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_id   uuid NOT NULL REFERENCES versions(id) ON DELETE CASCADE,

  status       log_status NOT NULL DEFAULT 'backlog',
  completion   completion_level,

  -- 1..10 half-star scale rendered as 0.5..5 stars in the UI
  rating       smallint CHECK (rating BETWEEN 1 AND 10),
  review       text,
  review_has_spoilers boolean NOT NULL DEFAULT false,

  is_favourite boolean NOT NULL DEFAULT false,
  is_private   boolean NOT NULL DEFAULT false,

  added_at     timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, version_id)
);

CREATE INDEX entries_user_status_idx ON entries(user_id, status);
CREATE INDEX entries_version_idx ON entries(version_id);

-- ------------------------------------------------------------
-- Plays — a single run through. An entry can have many.
-- Replays, aborted attempts, and a completed playthrough all live here.
-- ------------------------------------------------------------

CREATE TABLE plays (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id    uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  started_on  date,
  finished_on date,
  hours       numeric(6,1),
  completion  completion_level,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT plays_date_order CHECK (
    started_on IS NULL OR finished_on IS NULL OR finished_on >= started_on
  )
);

CREATE INDEX plays_entry_idx ON plays(entry_id);

-- ------------------------------------------------------------
-- Shelves — Goodreads-style user-defined buckets.
-- Status is separate from shelves on purpose: status is a state
-- machine, shelves are free-form tagging.
-- ------------------------------------------------------------

CREATE TABLE shelves (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  slug       text NOT NULL,
  is_pinned  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, slug)
);

CREATE TABLE shelf_entries (
  shelf_id uuid NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shelf_id, entry_id)
);

-- ------------------------------------------------------------
-- IGDB OAuth token cache
--
-- Twitch client-credentials tokens last ~60 days. Holding one row here rather
-- than in memory means a container restart does not burn a fresh token, and a
-- 401 can force a refresh without coordinating across processes.
-- ------------------------------------------------------------

CREATE TABLE igdb_tokens (
  id           boolean PRIMARY KEY DEFAULT true,
  access_token text NOT NULL,
  expires_at   timestamptz NOT NULL,
  obtained_at  timestamptz NOT NULL DEFAULT now(),

  -- Pins the table to a single row: the only allowed primary key is true.
  CONSTRAINT igdb_tokens_single_row CHECK (id)
);

-- ------------------------------------------------------------
-- Convenience view: a shelf row with everything needed to render a card
-- ------------------------------------------------------------

CREATE VIEW entry_cards AS
SELECT
  e.id                AS entry_id,
  e.user_id,
  e.status,
  e.rating,
  e.completion,
  e.is_favourite,
  e.updated_at,
  v.id                AS version_id,
  v.name              AS version_name,
  v.kind              AS version_kind,
  v.author            AS version_author,
  -- A community version never inherits the parent work's boxart: showing
  -- Ocarina of Time's cover for a romhack looks correct and is wrong, which
  -- is a worse outcome than no art at all. Own art or placeholder, nothing else.
  CASE
    WHEN v.kind NOT IN ('original','port','remaster','remake','compilation')
      THEN v.cover_url
    ELSE COALESCE(v.cover_url, w.cover_url)
  END                 AS cover_url,
  w.id                AS work_id,
  w.title             AS work_title,
  w.slug              AS work_slug,
  w.work_kind,
  w.parent_work_id,
  pw.title            AS parent_work_title,
  p.name              AS platform_name,
  (v.kind NOT IN ('original','port','remaster','remake','compilation')) AS is_community_version,
  e.added_at,
  -- The shelf sorts by "finished", which lives on plays rather than on the
  -- entry: a replay is a new play, so the latest finish is the meaningful one.
  (SELECT max(pl.finished_on) FROM plays pl WHERE pl.entry_id = e.id) AS last_finished_on
FROM entries e
JOIN versions v  ON v.id = e.version_id
JOIN works w     ON w.id = v.work_id
LEFT JOIN works pw    ON pw.id = w.parent_work_id
LEFT JOIN platforms p ON p.id = v.platform_id;

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER works_touch   BEFORE UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER entries_touch BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
