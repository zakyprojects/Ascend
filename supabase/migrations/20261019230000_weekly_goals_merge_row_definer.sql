-- weekly_goals_merge_row (20261019200000) runs as the writing user and calls public.ascend_instant,
-- whose EXECUTE is revoked from anon/authenticated (20261015000000). Every app write carrying
-- deletedGoalIds failed with 42501 "permission denied for function ascend_instant" and the outbox
-- dropped it: weekly goal edits (e.g. a carry-over dismiss) never reached the server.
-- Fix: the trigger function runs as its owner. It reads only NEW/OLD and pins search_path ''.
-- EXECUTE stays revoked from the API roles (a trigger function needs no grant to fire).
-- Run order: NOW (production 11.4.0 is affected too), before the studio test.

BEGIN;

ALTER FUNCTION public.weekly_goals_merge_row() SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.weekly_goals_merge_row() FROM PUBLIC, anon, authenticated;

COMMIT;
