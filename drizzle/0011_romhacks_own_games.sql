-- A romhack is a game of its own (Jay, 2026-10-20): its own page, year, ways
-- to play and details, edited apart from the game it was built on. Until now
-- it was a version hanging off that game's work, so it showed the game's
-- year, summary and platforms as if they were its own.
--
-- The link back is "based on", not parent_work_id: that one means more
-- content (DLC) and cascades on delete. Deleting the original must leave the
-- hack standing, so this one only forgets.
ALTER TABLE works ADD COLUMN IF NOT EXISTS based_on_work_id uuid REFERENCES works(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS works_based_on_idx ON works (based_on_work_id);--> statement-breakpoint
ALTER TABLE works DROP CONSTRAINT IF EXISTS works_no_self_based_on;--> statement-breakpoint
ALTER TABLE works ADD CONSTRAINT works_no_self_based_on CHECK (id <> based_on_work_id);--> statement-breakpoint
-- Every romhack already here moves to a local work of its own, made from what
-- its game had, as a new one is: the hack's name, the game's series and
-- summary, the hack's own date else the game's. Versions keep their ids, so
-- entries, plays, tags, ratings and reviews come along untouched; only
-- versions.work_id changes. Versions of one hack with the same name (two
-- platforms, say) become one game with two ways to play. Its own art moves
-- up to the work, which its versions now show as an original's would.
--
-- Only hacks still on a game that is not itself a hack's, so running this
-- twice moves nothing the second time.
DO $$
DECLARE
  hack record;
  new_id uuid;
  base_slug text;
  art record;
  moved int := 0;
BEGIN
  FOR hack IN
    SELECT v.work_id,
           lower(btrim(v.name)) AS key,
           (array_agg(btrim(v.name) ORDER BY v.created_at, v.id))[1] AS title,
           array_agg(v.id ORDER BY v.created_at, v.id) AS version_ids,
           min(v.release_date) AS release_date,
           min(v.created_at) AS created_at,
           (array_agg(v.created_by ORDER BY v.created_at, v.id))[1] AS created_by,
           w.series, w.summary, w.first_release_date
    FROM versions v
    JOIN works w ON w.id = v.work_id
    WHERE v.kind = 'romhack' AND w.based_on_work_id IS NULL
      -- A local game holding nothing but romhacks is a hack's own already
      -- (one whose original has since been deleted), not an original.
      AND NOT (w.source = 'local' AND NOT EXISTS (
        SELECT 1 FROM versions o WHERE o.work_id = w.id AND o.kind <> 'romhack'
      ))
    GROUP BY v.work_id, lower(btrim(v.name)), w.series, w.summary, w.first_release_date
  LOOP
    new_id := uuid_generate_v4();
    base_slug := left(trim(both '-' from regexp_replace(regexp_replace(lower(hack.title), '[^a-z0-9\s-]', '', 'g'), '[\s-]+', '-', 'g')), 80);
    IF base_slug = '' THEN base_slug := 'untitled'; END IF;
    IF EXISTS (SELECT 1 FROM works WHERE slug = base_slug) THEN
      base_slug := base_slug || '-' || left(new_id::text, 8);
    END IF;

    INSERT INTO works (
      id, slug, title, work_kind, based_on_work_id, series, sort_title, summary,
      first_release_date, source, created_by, created_at
    ) VALUES (
      new_id, base_slug, hack.title, 'main_game', hack.work_id, hack.series,
      CASE WHEN hack.title ~* '^(the|a|an)\s+'
        THEN regexp_replace(hack.title, '^(\S+)\s+(.*)$', '\2, \1')
      END,
      hack.summary, COALESCE(hack.release_date, hack.first_release_date), 'local',
      hack.created_by, hack.created_at
    );

    SELECT id, cover_url, cover_source, cover_needs_review, sgdb_game_id INTO art
    FROM versions
    WHERE id = ANY (hack.version_ids) AND cover_url IS NOT NULL
    ORDER BY created_at, id
    LIMIT 1;

    IF FOUND THEN
      UPDATE works SET cover_url = art.cover_url, cover_source = art.cover_source,
        cover_needs_review = art.cover_needs_review, sgdb_game_id = art.sgdb_game_id
      WHERE id = new_id;
      -- Moved, not copied: one file has one owner, so deleting a version
      -- never removes art its game is still showing.
      UPDATE versions SET cover_url = NULL, cover_source = NULL, cover_needs_review = false
      WHERE id = art.id;
    ELSE
      UPDATE works SET sgdb_game_id = (
        SELECT sgdb_game_id FROM versions
        WHERE id = ANY (hack.version_ids) AND sgdb_game_id IS NOT NULL
        ORDER BY created_at, id LIMIT 1
      ) WHERE id = new_id;
    END IF;

    UPDATE versions SET work_id = new_id WHERE id = ANY (hack.version_ids);
    moved := moved + 1;
  END LOOP;

  RAISE NOTICE 'romhacks made games of their own: %', moved;
END $$;--> statement-breakpoint
-- A romhack's version is now a release of its own game, so it shows that
-- game's art and title as an original does. The other community kinds are
-- still versions of somebody else's game and keep the rule they had.
CREATE OR REPLACE VIEW entry_cards AS
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
  -- Ocarina of Time's cover for a translation looks correct and is wrong,
  -- which is a worse outcome than no art at all. Own art or placeholder.
  CASE
    WHEN v.kind NOT IN ('original','port','remaster','remake','compilation','romhack')
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
  (v.kind NOT IN ('original','port','remaster','remake','compilation','romhack')) AS is_community_version,
  e.added_at,
  -- The shelf sorts by "finished", which lives on plays rather than on the
  -- entry: a replay is a new play, so the latest finish is the meaningful one.
  (SELECT max(pl.finished_on) FROM plays pl WHERE pl.entry_id = e.id) AS last_finished_on,
  -- The flag belongs to whichever cover is on screen. A community version with
  -- no art of its own shows a placeholder, and a placeholder needs no review.
  CASE
    WHEN v.cover_url IS NOT NULL THEN v.cover_needs_review
    WHEN v.kind NOT IN ('original','port','remaster','remake','compilation','romhack') THEN false
    ELSE w.cover_needs_review
  END                 AS cover_needs_review,
  -- The version's own date when it has one, so a port groups under the year
  -- it came out rather than the year the original did.
  extract(year FROM COALESCE(v.release_date, w.first_release_date))::int AS release_year,
  w.series
FROM entries e
JOIN versions v  ON v.id = e.version_id
JOIN works w     ON w.id = v.work_id
LEFT JOIN works pw    ON pw.id = w.parent_work_id
LEFT JOIN platforms p ON p.id = v.platform_id;
