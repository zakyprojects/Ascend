-- Stop publishing point entries on profiles (apply AFTER the app that reads league points from
-- ascend_league_points is in production; older apps still build standings from points_history).
-- profiles are readable by every member, and points_history carried each member's last 500
-- point entries with their reasons (habit, bad-habit and emotion names). League standings now
-- come from ascend_league_points (numbers only). The ledger itself (public.point_entries,
-- owner-only) is untouched.

BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_derive_season_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  NEW.season_points := public.ascend_season_points(NEW.id);
  NEW.total_points := NEW.season_points;
  NEW.season_history := public.ascend_season_history(NEW.id);
  NEW.points_history := '[]'::jsonb;
  RETURN NEW;
END;
$function$;

UPDATE public.profiles SET points_history = '[]'::jsonb;

COMMIT;
