-- Earlier days' points never drop (Zakria 2026-10-18: deleting, clearing, editing or unticking
-- never lowers points earned on an earlier local day; only today's points can change).
-- Exception (Zakria 2026-10-18, Mode B): removing a book DOES take back its finish bonus, whenever
-- it was earned, and a bonus the app gave before server bonuses comes back as a minus row. So
-- ascend_recompute_reading_bonus is NOT in this file; the live function stays as it is
-- (last defined in 20261015170000_reading_legacy_bonus_revoke.sql). Mirror: deleteBook in src/lib/store.ts.
--
-- Two server paths still took back points earned on an earlier day:
--   1. Deleting the week's last reflection took back its +5 even when it was earned on an earlier
--      day of the Reflection Window. Now: only a reflection award earned today is taken back.
--   2. The week's goal points (weekly_goal_<week>, stamped at the last counted goal's completion)
--      dropped when a goal achieved on an earlier day was unticked, deleted, lost its linked log or
--      its linked habit/skill/book. Now: a goal counted on an earlier day stays counted for the
--      week (the row's metadata.counted lists each counted goal and when it was achieved); goals
--      achieved today still follow their ticks. Mirror: src/lib/weeklyAwards.ts
--      (weeklyScoringGoals / countedGoalRefs) used by recomputeWeeklyGoalsPointsForState.
--
-- Point values, caps and windows are unchanged. Apply BEFORE testing the studio build that has
-- the matching client (commit "Earlier days' points never drop").

-- 1. Weekly reflection ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ascend_recompute_weekly_reflection_award(p_user uuid, p_week text, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_start   date := public.ascend_week_start(p_week);
  v_award   text := 'weekly_review_' || p_week;
  v_rev     text := 'weekly_review_rev_' || p_week;
  v_has     boolean;
  v_net     int;
  v_today_start timestamptz := ((now() AT TIME ZONE p_tz)::date)::timestamp AT TIME ZONE p_tz;
  v_now_iso text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  -- Friday 06:00 of the week until the end of the following Monday (reflectionWindow in weeklyAwards.ts).
  IF v_start IS NULL
     OR now() < ((v_start + 4)::timestamp + interval '6 hours') AT TIME ZONE p_tz
     OR now() >= (v_start + 8)::timestamp AT TIME ZONE p_tz THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('weekly_reflection_award:' || p_user::text || ':' || p_week));

  SELECT coalesce(wg.deleted_at IS NULL
                  AND jsonb_typeof(wg.data->'reflections') = 'array'
                  AND jsonb_array_length(wg.data->'reflections') > 0, false)
  INTO v_has
  FROM public.weekly_goals wg
  WHERE wg.user_id = p_user AND wg.id = p_week;
  v_has := coalesce(v_has, false);

  SELECT coalesce(sum(coalesce((pe.data->>'amount')::int, 0)), 0) INTO v_net
  FROM public.point_entries pe
  WHERE pe.user_id = p_user AND pe.id IN (v_award, v_rev) AND pe.deleted_at IS NULL;

  IF v_has AND v_net <= 0 THEN
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_rev AND pe.deleted_at IS NULL;
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_award, jsonb_build_object(
      'id', v_award,
      'amount', 5, -- WEEKLY_REFLECTION_POINTS.awarded
      'reason', 'Weekly reflection completed for ' || p_week,
      'source', 'weekly_review',
      'timestamp', v_now_iso,
      'metadata', jsonb_build_object('weekKey', p_week)
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at);
  ELSIF NOT v_has AND v_net > 0
    -- Only an award earned today is taken back; one earned on an earlier day stays.
    AND EXISTS (
      SELECT 1 FROM public.point_entries pe
      WHERE pe.user_id = p_user AND pe.id = v_award AND pe.deleted_at IS NULL
        AND coalesce(public.ascend_instant(pe.data->>'timestamp') >= v_today_start, false)
    )
  THEN
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_rev, jsonb_build_object(
      'id', v_rev,
      'amount', -v_net,
      'reason', 'Weekly reflection deleted for ' || p_week,
      'source', 'weekly_review',
      'timestamp', v_now_iso,
      'metadata', jsonb_build_object('weekKey', p_week)
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at);
  END IF;
END;
$function$;

-- 2. Weekly goals --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ascend_recompute_weekly_goal_awards(p_user uuid, p_week text, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_start       date := public.ascend_week_start(p_week);
  v_start_at    timestamptz;
  v_end_at      timestamptz;
  v_boundary    timestamptz;
  v_floor       timestamptz;
  v_today_start timestamptz := ((now() AT TIME ZONE p_tz)::date)::timestamp AT TIME ZONE p_tz;
  v_season      int;
  v_split       boolean := false;
  v_goals       jsonb;
  v_times       timestamptz[];
  v_counted_js  jsonb;
  v_completed   int := 0;
  v_counted     int := 0;
  v_points      int;
  v_earlier     int;
  v_legacy_hold int := 0;
  v_base_id     text := 'weekly_goal_' || p_week;
  v_id          text;
  v_existing    jsonb;
  v_ts          text;
  v_reason      text;
  v_metadata    jsonb;
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

  -- The week a season started in, once that season runs: the earlier part stays frozen.
  v_boundary := public.ascend_season_start(v_end_at);
  IF v_boundary > v_start_at AND now() >= v_boundary THEN
    v_split := true;
    v_season := public.ascend_lesson_season(v_boundary);
    v_id := v_base_id || '_s' || v_season;
  ELSE
    v_id := v_base_id;
  END IF;

  SELECT pe.data INTO v_existing
  FROM public.point_entries pe
  WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;

  SELECT CASE WHEN wg.deleted_at IS NULL THEN coalesce(wg.data->'goals', '[]'::jsonb) ELSE '[]'::jsonb END
  INTO v_goals
  FROM public.weekly_goals wg
  WHERE wg.user_id = p_user AND wg.id = p_week;
  IF v_goals IS NULL OR jsonb_typeof(v_goals) <> 'array' THEN
    v_goals := '[]'::jsonb;
  END IF;

  -- Achieved goals in completion order (ties keep list order), plus every goal this row counted
  -- on an earlier day (metadata.counted, achieved before today): those stay counted even when
  -- unticked, deleted or no longer linked. The first 3 count.
  WITH achieved AS (
    SELECT coalesce(g.value->>'id', '#' || g.ord) AS id,
           public.ascend_goal_completion_time(g.value) AS at,
           g.ord AS ord
    FROM jsonb_array_elements(v_goals) WITH ORDINALITY AS g(value, ord)
    WHERE jsonb_typeof(g.value) = 'object'
      AND (g.value->'completed' = 'true'::jsonb OR g.value->'done' = 'true'::jsonb)
      AND NOT (g.value ? 'archived' AND g.value->'archived' NOT IN ('false'::jsonb, 'null'::jsonb, '0'::jsonb, '""'::jsonb))
  ), held AS (
    SELECT c.value->>'id' AS id, public.ascend_instant(c.value->>'at') AS at
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_existing->'metadata'->'counted') = 'array'
           THEN v_existing->'metadata'->'counted' ELSE '[]'::jsonb END) AS c(value)
    WHERE jsonb_typeof(c.value) = 'object'
      AND coalesce(c.value->>'id', '') <> ''
      AND public.ascend_instant(c.value->>'at') < v_today_start
  ), scoring AS (
    SELECT coalesce(a.id, h.id) AS id,
           CASE WHEN h.at IS NOT NULL AND (a.at IS NULL OR h.at < a.at) THEN h.at ELSE a.at END AS at,
           coalesce(a.ord, 1000000) AS ord
    FROM achieved a FULL JOIN held h ON h.id = a.id
  ), ordered AS (
    SELECT s.id, s.at, row_number() OVER (ORDER BY s.at NULLS FIRST, s.ord, s.id COLLATE "C") AS rn
    FROM scoring s
  )
  SELECT array_agg(o.at ORDER BY o.rn),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id,
           'at', to_char(o.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY o.rn)
           FILTER (WHERE o.rn <= 3), '[]'::jsonb),
         count(*)::int
  INTO v_times, v_counted_js, v_completed
  FROM ordered o;
  v_times := coalesce(v_times, '{}'::timestamptz[]);
  v_counted := least(v_completed, 3); -- WEEKLY_GOALS_POINTS.maxGoalsCounted
  v_points := v_counted * 5;          -- WEEKLY_GOALS_POINTS.pointsPerGoal

  -- A row written before metadata.counted existed: what it held before today stays (all of it
  -- when it was stamped before today, else all but the goal stamped today).
  IF v_existing IS NOT NULL AND jsonb_typeof(v_existing->'metadata'->'counted') IS DISTINCT FROM 'array'
     AND jsonb_typeof(v_existing->'amount') = 'number' THEN
    v_legacy_hold := CASE
      WHEN coalesce(public.ascend_instant(v_existing->>'timestamp') < v_today_start, false)
        THEN (v_existing->>'amount')::int
      ELSE greatest((v_existing->>'amount')::int - 5, 0) END;
  END IF;

  IF v_split THEN
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
    v_metadata := jsonb_build_object('weekKey', p_week, 'seasonNumber', v_season,
                                     'countedGoalsCount', v_counted, 'completedGoalsCount', v_completed,
                                     'counted', v_counted_js);
  ELSE
    v_floor := v_start_at;
    v_metadata := jsonb_build_object('weekKey', p_week,
                                     'countedGoalsCount', v_counted, 'completedGoalsCount', v_completed,
                                     'counted', v_counted_js);
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

  IF v_legacy_hold > v_points THEN
    -- The old row holds more, earned before today: it keeps that part (and nothing else changes).
    IF v_legacy_hold < (v_existing->>'amount')::int THEN
      UPDATE public.point_entries pe
      SET data = jsonb_set(pe.data, '{amount}', to_jsonb(v_legacy_hold)),
          updated_at = greatest(now(), pe.updated_at)
      WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
    END IF;
    RETURN;
  END IF;

  IF v_split THEN
    v_reason := 'Weekly goals achieved for ' || p_week || ', Season ' || v_season || ' (' || v_points || ' pts)';
  ELSE
    v_reason := 'Weekly goals achieved for ' || p_week || ' (' || v_points || ' pts)';
  END IF;

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
