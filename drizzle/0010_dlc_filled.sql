-- A game's DLC is listed under it from IGDB without being added one by one
-- (Jay, 2026-10-20): the works and versions are written, no entries, the
-- first time the game's page is opened. This says it has been done.
ALTER TABLE works ADD COLUMN IF NOT EXISTS dlc_filled_at timestamptz;
