-- Leaderboard score from the server (knowledge/trusted-clock-plan.md, Part 2 #1)
-- profiles.season_points / total_points were written by the app, so a console write could
-- put any score on the leaderboard. Now the database always derives them from the points
-- ledger with public.ascend_season_points() (the same rules as the app's
-- calculateSeasonalTotal): whatever the app sends is replaced. Point values and rules are
-- unchanged. The backfill at the end brings every profile in line with its ledger.

BEGIN;

-- 1. Every profile write takes its score from the ledger.
CREATE OR REPLACE FUNCTION public.profiles_derive_season_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  NEW.season_points := public.ascend_season_points(NEW.id);
  NEW.total_points := NEW.season_points;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.profiles_derive_season_points() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_derive_season_points BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_derive_season_points();

-- 2. A ledger change refreshes its owners' profiles once per statement (the app sends entries
--    after the profile, so the profile write alone would miss them). The no-op update fires
--    the trigger above. RLS on point_entries already limits a user to their own rows.
CREATE OR REPLACE FUNCTION public.point_entries_refresh_season_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.profiles p
     SET season_points = p.season_points
   WHERE p.id IN (SELECT DISTINCT r.user_id FROM changed_rows r);
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.point_entries_refresh_season_points() FROM PUBLIC, anon, authenticated;

-- A trigger with a transition table takes one event, hence two.
CREATE TRIGGER point_entries_refresh_season_points_ins AFTER INSERT ON public.point_entries
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.point_entries_refresh_season_points();
CREATE TRIGGER point_entries_refresh_season_points_upd AFTER UPDATE ON public.point_entries
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.point_entries_refresh_season_points();

-- 3. Backfill: every profile recomputed from its ledger.
UPDATE public.profiles SET season_points = season_points;

COMMIT;
