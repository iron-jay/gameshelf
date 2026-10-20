-- DLC lives under its game (2026-10-20): listed and added on the game's pages,
-- and not a tile of its own on the shelf unless the game says so. The setting
-- is the game's, because it is a fact about how that game is played: Destiny 2's
-- expansions are games in their own right, a costume pack is not.
ALTER TABLE works ADD COLUMN IF NOT EXISTS dlc_on_shelf boolean NOT NULL DEFAULT false;--> statement-breakpoint
-- DLC added before its game never found it: the parent link was only looked
-- for on the DLC's own add. IGDB's parent_game is in the stored payload, so
-- everything whose game is already here attaches now, data untouched.
UPDATE works AS child
SET parent_work_id = parent.id
FROM works AS parent
WHERE child.parent_work_id IS NULL
  AND child.work_kind <> 'main_game'
  AND child.igdb_payload ? 'parent_game'
  AND parent.igdb_id = (child.igdb_payload->>'parent_game')::int
  AND parent.id <> child.id;
