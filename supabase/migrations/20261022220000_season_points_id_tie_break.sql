-- Season totals: entries with the same awarded_at are summed in id order, as ascend_period_points does
-- (the app's calculateSeasonalTotal mirrors it with entryIdOrder), so the 0-floor always sees the same sequence. Same signatures;
-- grants are kept by CREATE OR REPLACE. Checked 2026-10-22: no live total changes under either tie order.

CREATE OR REPLACE FUNCTION public.ascend_season_points(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_start  timestamptz := public.ascend_season_start(now());
  v_total  numeric := 0;
  v_amount numeric;
BEGIN
  FOR v_amount IN
    SELECT coalesce((pe.data->>'amount')::numeric, 0)
    FROM public.point_entries pe
    WHERE pe.user_id = p_user
      AND pe.deleted_at IS NULL
      AND coalesce(pe.data->>'source', '') <> 'system'
      AND coalesce(pe.data->>'reason', '') <> 'System: Debt Forgiveness'
      AND pe.awarded_at >= v_start
    ORDER BY pe.awarded_at, pe.id
  LOOP
    v_total := greatest(v_total + v_amount, 0);
  END LOOP;
  RETURN round(v_total)::int;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ascend_season_history(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_current int := public.ascend_season_number(now());
  v_start   timestamptz;
  v_end     timestamptz;
  v_total   numeric;
  v_amount  numeric;
  v_history jsonb := '[]'::jsonb;
BEGIN
  FOR v_season IN REVERSE (v_current - 1)..1 LOOP
    v_start := public.ascend_season_begin(v_season);
    v_end   := v_start + public.ascend_season_length();
    v_total := 0;
    FOR v_amount IN
      SELECT coalesce((pe.data->>'amount')::numeric, 0)
      FROM public.point_entries pe
      WHERE pe.user_id = p_user
        AND pe.deleted_at IS NULL
        AND coalesce(pe.data->>'source', '') <> 'system'
        AND coalesce(pe.data->>'reason', '') <> 'System: Debt Forgiveness'
        AND pe.awarded_at >= v_start
        AND pe.awarded_at < v_end
      ORDER BY pe.awarded_at, pe.id
    LOOP
      v_total := greatest(v_total + v_amount, 0);
    END LOOP;
    IF round(v_total) > 0 THEN
      v_history := v_history || jsonb_build_array(jsonb_build_object(
        'seasonNumber', v_season,
        'seasonName', 'Season ' || v_season,
        'points', round(v_total)::int,
        'date', to_char((v_end - interval '1 millisecond') AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      ));
    END IF;
  END LOOP;
  RETURN v_history;
END;
$function$;
