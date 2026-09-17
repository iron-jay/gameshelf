-- Four shelves: wishlist, backlog, playing, played.
--
-- 'dropped' and 'shelved' both meant "I stopped", which the other four could
-- not say — but neither could they say it differently from each other, and a
-- state machine with two indistinguishable states is one state and a coin flip.
-- Anything in either becomes 'played': you did play it, and how far you got is
-- what plays.completion already records.
--
-- Postgres cannot remove a value from an enum, so the type is rebuilt. The view
-- selects e.status and so has to go first; it is recreated below exactly as
-- 0004 left it.
UPDATE entries SET status = 'played' WHERE status IN ('dropped', 'shelved');--> statement-breakpoint
DROP VIEW entry_cards;--> statement-breakpoint
ALTER TYPE "public"."log_status" RENAME TO "log_status_old";--> statement-breakpoint
CREATE TYPE "public"."log_status" AS ENUM('wishlist', 'backlog', 'playing', 'played');--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "status" TYPE "public"."log_status" USING "status"::text::"public"."log_status";--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "status" SET DEFAULT 'backlog';--> statement-breakpoint
DROP TYPE "public"."log_status_old";--> statement-breakpoint
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
  (SELECT max(pl.finished_on) FROM plays pl WHERE pl.entry_id = e.id) AS last_finished_on,
  -- The flag belongs to whichever cover is on screen. A community version with
  -- no art of its own shows a placeholder, and a placeholder needs no review.
  CASE
    WHEN v.cover_url IS NOT NULL THEN v.cover_needs_review
    WHEN v.kind NOT IN ('original','port','remaster','remake','compilation') THEN false
    ELSE w.cover_needs_review
  END                 AS cover_needs_review,
  -- The version's own date when it has one, so a romhack groups under the year
  -- the hack came out rather than the year the original did.
  extract(year FROM COALESCE(v.release_date, w.first_release_date))::int AS release_year
FROM entries e
JOIN versions v  ON v.id = e.version_id
JOIN works w     ON w.id = v.work_id
LEFT JOIN works pw    ON pw.id = w.parent_work_id
LEFT JOIN platforms p ON p.id = v.platform_id;
