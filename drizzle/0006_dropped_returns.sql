-- 'dropped' is back, after 0005 removed it.
--
-- It says something the other four cannot: you played it and stopped, which is
-- not the same as having finished it. 'shelved' is not coming back with it —
-- that was the half of the pair with no distinct meaning.
--
-- Adding a value to an enum does not need the type rebuilding, so the view is
-- left alone this time. Entries that 0005 folded into 'played' stay there:
-- nothing recorded which of them were dropped.
ALTER TYPE "public"."log_status" ADD VALUE IF NOT EXISTS 'dropped' AFTER 'played';
