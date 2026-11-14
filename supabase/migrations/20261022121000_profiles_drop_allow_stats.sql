-- Item #12, Migration A: drop profiles.user1_allow_stats and user2_allow_stats. Added by
-- 20260811000001_add_partner_stats_columns.sql and never read or written by any client version
-- (the old partner-stats feature used columns on partnerships, since removed). Both columns are
-- readable by anon and authenticated through column grants; dropping them removes that too.
--
-- Checked read-only on 2026-10-22: every profile holds the default (true); no function, view,
-- policy, trigger, constraint or index references them; pg_depend lists only their column
-- defaults. No Edge Function or api/ route uses them.
--
-- RUN ORDER: AFTER the production push, with Zakria's explicit go. Studio and production share one
-- Supabase project.
-- Migrations B (points_history) and C (active_habits) are NOT part of this file: held until each
-- friend has opened the app once on a current build.

BEGIN;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS user1_allow_stats,
  DROP COLUMN IF EXISTS user2_allow_stats;

COMMIT;

-- Verify (read-only):
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles' and column_name like '%allow_stats';
--     -> no rows
--
-- Rollback (every value was the default, so nothing is lost):
--   BEGIN;
--   ALTER TABLE public.profiles
--     ADD COLUMN user1_allow_stats boolean DEFAULT true,
--     ADD COLUMN user2_allow_stats boolean DEFAULT true;
--   GRANT SELECT (user1_allow_stats, user2_allow_stats) ON public.profiles TO anon, authenticated;
--   COMMIT;
