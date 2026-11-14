-- profiles.points_history is the public copy of a member's ledger that other members read for
-- weekly and monthly league standings and profile views. The app used to write it, so a member
-- could set any history (and it carried the app's unsent preview rows). It is now derived from
-- point_entries in the same trigger that derives season_points: the member's 500 newest live
-- entries, newest first, as the app wrote them. Values the app still sends are overwritten.

CREATE OR REPLACE FUNCTION public.profiles_derive_season_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  NEW.season_points := public.ascend_season_points(NEW.id);
  NEW.total_points := NEW.season_points;
  NEW.points_history := coalesce((
    SELECT jsonb_agg(h.data ORDER BY h.at DESC NULLS LAST, h.id)
    FROM (
      SELECT pe.data, pe.id, public.ascend_instant(pe.data->>'timestamp') AS at
      FROM public.point_entries pe
      WHERE pe.user_id = NEW.id
        AND pe.deleted_at IS NULL
      ORDER BY public.ascend_instant(pe.data->>'timestamp') DESC NULLS LAST, pe.id
      LIMIT 500
    ) h
  ), '[]'::jsonb);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.profiles_derive_season_points() FROM PUBLIC, anon, authenticated;

-- Rebuild every existing mirror once (the no-op update fires the trigger).
UPDATE public.profiles p SET season_points = p.season_points;
