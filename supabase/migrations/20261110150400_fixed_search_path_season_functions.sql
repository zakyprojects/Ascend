-- GLB-L9 (audit 2026-11-10): the last 10 public functions without a fixed search_path get one
-- (Supabase linter warning function_search_path_mutable).
--
-- All 10 are SECURITY INVOKER, so the real risk was negligible. Each body was read live on
-- 2026-11-10: every table and app function is written schema-qualified (public.…), and the rest
-- (greatest, floor, extract, coalesce, round, to_char, now, jsonb_*, types, operators) is in
-- pg_catalog, which is always searched, so search_path = '' changes nothing they do.
-- Cost: a SQL function with SET cannot be inlined by the planner; these are called a few times per
-- statement from plpgsql (league boards, member card, rollover), never per row in an index or
-- constraint (catalog check 2026-11-10), so the difference is microseconds.
--
-- Order: any time; prod-compatible (no signature, grant or result change).
-- Rollback (exact): the same ALTER FUNCTION lines with RESET search_path instead of SET search_path = ''.

BEGIN;

ALTER FUNCTION public.ascend_lesson_season(timestamptz) SET search_path = '';
ALTER FUNCTION public.ascend_run_season_rollover() SET search_path = '';
ALTER FUNCTION public.ascend_season_begin(integer) SET search_path = '';
ALTER FUNCTION public.ascend_season_epoch() SET search_path = '';
ALTER FUNCTION public.ascend_season_history(uuid) SET search_path = '';
ALTER FUNCTION public.ascend_season_length() SET search_path = '';
ALTER FUNCTION public.ascend_season_number(timestamptz) SET search_path = '';
ALTER FUNCTION public.ascend_season_points(uuid) SET search_path = '';
ALTER FUNCTION public.ascend_season_start(timestamptz) SET search_path = '';
ALTER FUNCTION public.prevent_profile_uid_change() SET search_path = '';

COMMIT;

-- Verify (read-only):
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proconfig IS NULL;   -- 0 rows
--   SELECT public.ascend_season_number(now()), public.ascend_season_start(now());   -- 1, 2026-11-01 00:00+00
