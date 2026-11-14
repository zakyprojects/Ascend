-- profiles.season_history holds each closed season's final score, which other members read for
-- that season's standings and profile views. The app used to write it from its own archives, so
-- a member could set any score. It is now derived from point_entries in the trigger that already
-- derives season_points: for every closed season, the season total computed exactly like
-- ascend_season_points (time order, floored at 0, system rows excluded) inside that season's
-- window, kept only when above 0, newest season first, in the shape the app wrote.

CREATE OR REPLACE FUNCTION public.ascend_season_history(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_epoch   timestamptz := '2026-08-01 00:00:00+00';
  v_length  interval    := interval '90 days';
  v_current int;
  v_start   timestamptz;
  v_end     timestamptz;
  v_total   numeric;
  v_amount  numeric;
  v_history jsonb := '[]'::jsonb;
BEGIN
  v_current := 1 + greatest(0, floor(extract(epoch FROM now() - v_epoch) / extract(epoch FROM v_length)))::int;
  FOR v_season IN REVERSE (v_current - 1)..1 LOOP
    v_start := v_epoch + v_length * (v_season - 1);
    v_end   := v_start + v_length;
    v_total := 0;
    FOR v_amount IN
      SELECT coalesce((pe.data->>'amount')::numeric, 0)
      FROM public.point_entries pe
      WHERE pe.user_id = p_user
        AND pe.deleted_at IS NULL
        AND coalesce(pe.data->>'source', '') <> 'system'
        AND coalesce(pe.data->>'reason', '') <> 'System: Debt Forgiveness'
        AND public.ascend_instant(pe.data->>'timestamp') >= v_start
        AND public.ascend_instant(pe.data->>'timestamp') < v_end
      ORDER BY public.ascend_instant(pe.data->>'timestamp')
    LOOP
      v_total := greatest(v_total + v_amount, 0);
    END LOOP;
    IF round(v_total) > 0 THEN
      v_history := v_history || jsonb_build_array(jsonb_build_object(
        'seasonNumber', v_season,
        'seasonName', 'Season ' || v_season,
        'points', round(v_total)::int,
        -- Last day of the season (UTC).
        'date', to_char((v_end - interval '1 millisecond') AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      ));
    END IF;
  END LOOP;
  RETURN v_history;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_season_history(uuid) FROM PUBLIC, anon, authenticated;

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

-- Rebuild every existing profile once (the no-op update fires the trigger).
UPDATE public.profiles p SET season_points = p.season_points;
