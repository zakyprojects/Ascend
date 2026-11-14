-- 12B: drop profiles.points_history (always '[]' in every profile; no reader needs it: the app's
-- reads are `p.points_history || []`). The season-points trigger kept blanking it, so the function
-- is replaced first (same body minus those two lines), then the column goes. One transaction:
-- dropping first would make every profile write fail ("record new has no field points_history").
-- Rollback: ALTER TABLE public.profiles ADD COLUMN points_history jsonb DEFAULT '[]'::jsonb;
-- then restore the two `NEW.points_history := '[]'::jsonb;` lines in this function.

BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_derive_season_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- A direct app edit (stats, settings, timezone) cannot move the score: keep the stored,
  -- ledger-derived values. Ledger changes reach this trigger nested (depth >= 2), crons carry no
  -- JWT role, and a new season_id marks the season boundary; all of those recompute below.
  IF TG_OP = 'UPDATE'
     AND pg_trigger_depth() = 1
     AND coalesce(auth.role(), '') IN ('anon', 'authenticated')
     AND NEW.season_id IS NOT DISTINCT FROM OLD.season_id
  THEN
    NEW.season_points := OLD.season_points;
    NEW.total_points := OLD.season_points;
    NEW.season_history := OLD.season_history;
    RETURN NEW;
  END IF;

  NEW.season_points := public.ascend_season_points(NEW.id);
  NEW.total_points := NEW.season_points;
  NEW.season_history := public.ascend_season_history(NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.profiles_derive_season_points() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profiles DROP COLUMN points_history;

COMMIT;
