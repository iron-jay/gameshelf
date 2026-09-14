-- Adds added_at and last_finished_on so the shelf can sort by added and
-- finished. CREATE OR REPLACE only ever appends columns, so the existing
-- ones keep their positions and nothing reading the view breaks.
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
