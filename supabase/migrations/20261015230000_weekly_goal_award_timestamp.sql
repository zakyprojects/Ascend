-- Weekly goal points rows are stamped when they were earned (Zakria 2026-10-15). The season
-- total floors at 0 in time order (calculateSeasonalTotal in src/lib/leagues.ts), so a row that
-- kept its first timestamp sat before any later penalty that hit 0, and checking or unchecking a
-- goal no longer moved the total. The row's timestamp is now the completion time of the week's
-- last counted goal, kept between the week's start (the season start for a season's split row)
-- and now. Accepted trade-off: after the total hits 0, unchecking and re-checking a goal can bring
-- back at most that week's 15 points. Only ascend_recompute_weekly_goal_awards changes; its
-- signature is the same. src/lib/weeklyAwards.ts (weeklyGoalAwardTimestamp) mirrors it.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_recompute_weekly_goal_awards(p_user uuid, p_week text, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_start      date := public.ascend_week_start(p_week);
  v_start_at   timestamptz;
  v_end_at     timestamptz;
  v_boundary   timestamptz;
  v_floor      timestamptz;
  v_season     int;
  v_goals      jsonb;
  v_times      timestamptz[];
  v_completed  int := 0;
  v_counted    int := 0;
  v_points     int;
  v_earlier    int;
  v_base_id    text := 'weekly_goal_' || p_week;
  v_id         text;
  v_existing   jsonb;
  v_ts         text;
  v_reason     text;
  v_metadata   jsonb;
BEGIN
  IF v_start IS NULL OR v_start < DATE '2026-10-01' THEN
    RETURN; -- POINTS_V2_START_DATE_KEY: older weeks keep what they have
  END IF;
  v_start_at := v_start::timestamp AT TIME ZONE p_tz;
  v_end_at := (v_start + 7)::timestamp AT TIME ZONE p_tz - interval '1 millisecond';
  IF v_end_at < public.ascend_season_start(now()) THEN
    RETURN; -- a closed season's week is frozen
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('weekly_goal_awards:' || p_user::text || ':' || p_week));

  SELECT CASE WHEN wg.deleted_at IS NULL THEN coalesce(wg.data->'goals', '[]'::jsonb) ELSE '[]'::jsonb END
  INTO v_goals
  FROM public.weekly_goals wg
  WHERE wg.user_id = p_user AND wg.id = p_week;
  IF v_goals IS NULL OR jsonb_typeof(v_goals) <> 'array' THEN
    v_goals := '[]'::jsonb;
  END IF;

  -- Achieved goals in completion order (ties keep list order); the first 3 count.
  v_times := ARRAY(
    SELECT public.ascend_goal_completion_time(g.value)
    FROM jsonb_array_elements(v_goals) WITH ORDINALITY AS g(value, ord)
    WHERE jsonb_typeof(g.value) = 'object'
      AND (g.value->'completed' = 'true'::jsonb OR g.value->'done' = 'true'::jsonb)
      AND NOT (g.value ? 'archived' AND g.value->'archived' NOT IN ('false'::jsonb, 'null'::jsonb, '0'::jsonb, '""'::jsonb))
    ORDER BY public.ascend_goal_completion_time(g.value) NULLS FIRST, g.ord
  );
  v_completed := coalesce(array_length(v_times, 1), 0);
  v_counted := least(v_completed, 3); -- WEEKLY_GOALS_POINTS.maxGoalsCounted
  v_points := v_counted * 5;          -- WEEKLY_GOALS_POINTS.pointsPerGoal

  -- The week a season started in, once that season runs: the earlier part stays frozen.
  v_boundary := public.ascend_season_start(v_end_at);
  IF v_boundary > v_start_at AND now() >= v_boundary THEN
    v_season := public.ascend_lesson_season(v_boundary);
    v_id := v_base_id || '_s' || v_season;
    SELECT coalesce((pe.data->>'amount')::int, 0) INTO v_earlier
    FROM public.point_entries pe
    WHERE pe.user_id = p_user AND pe.id = v_base_id AND pe.deleted_at IS NULL;
    IF v_earlier IS NULL THEN
      SELECT count(*)::int * 5 INTO v_earlier
      FROM unnest(v_times[1:3]) AS c(at)
      WHERE c.at < v_boundary;
    END IF;
    v_points := greatest(0, v_points - v_earlier);
    v_floor := v_boundary;
    v_reason := 'Weekly goals achieved for ' || p_week || ', Season ' || v_season || ' (' || v_points || ' pts)';
    v_metadata := jsonb_build_object('weekKey', p_week, 'seasonNumber', v_season,
                                     'countedGoalsCount', v_counted, 'completedGoalsCount', v_completed);
  ELSE
    v_id := v_base_id;
    v_floor := v_start_at;
    v_reason := 'Weekly goals achieved for ' || p_week || ' (' || v_points || ' pts)';
    v_metadata := jsonb_build_object('weekKey', p_week,
                                     'countedGoalsCount', v_counted, 'completedGoalsCount', v_completed);
    -- Any other app-written goal row of the week (the app merged these into the canonical one).
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user
      AND pe.deleted_at IS NULL
      AND pe.data->>'source' = 'weekly_goal_achieved'
      AND pe.data->'metadata'->>'weekKey' = p_week
      AND pe.id <> v_base_id
      AND pe.id !~ '^weekly_goal_\d{4}-W\d{2}_s\d+$';
  END IF;

  SELECT pe.data INTO v_existing
  FROM public.point_entries pe
  WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;

  IF v_points > 0 THEN
    -- Stamped when earned: the last counted goal's completion, between v_floor and now
    -- (weeklyGoalAwardTimestamp in weeklyAwards.ts).
    v_ts := to_char(greatest(least(coalesce(v_times[v_counted], now()), now()), v_floor) AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_points,
      'reason', v_reason,
      'source', 'weekly_goal_achieved',
      'timestamp', v_ts,
      'metadata', v_metadata
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  ELSIF v_existing IS NOT NULL THEN
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_recompute_weekly_goal_awards(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Restamp every user's current and previous week, so the server rows match the app's copies.
DO $$
DECLARE
  v_row   record;
  v_tz    text;
  v_today date;
BEGIN
  FOR v_row IN SELECT DISTINCT wg.user_id FROM public.weekly_goals wg LOOP
    v_tz := public.ascend_user_timezone(v_row.user_id);
    v_today := (now() AT TIME ZONE v_tz)::date;
    PERFORM public.ascend_recompute_weekly_goal_awards(v_row.user_id, public.ascend_week_key(v_today), v_tz);
    PERFORM public.ascend_recompute_weekly_goal_awards(v_row.user_id, public.ascend_week_key(v_today - 7), v_tz);
  END LOOP;
END $$;

COMMIT;
