-- Penalty-skip fix: the hourly penalty job skipped a preset habit period found in the habit's
-- missedPeriods, and a weekly exercise target whose exerciseGoal.lastEvaluatedWeek matched. Both
-- marks are written by the app, whose own penalty rows the point guard drops, so an app open at
-- midnight marked the period and no penalty was issued at all. The job now decides from the
-- ledger only (deleted rows included). It only walks days after each user's penalty_cursor, so
-- old marked periods are never re-penalized. Same body as the live function otherwise.

CREATE OR REPLACE FUNCTION public.ascend_process_penalties(p_user uuid, p_tz text, p_from date, p_to date, p_apply boolean)
 RETURNS TABLE(kind text, entity_id text, period text, amount integer, multiplier double precision)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_now_iso    text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_season     int  := public.ascend_season_points(p_user);
  v_username   text;
  v_partner    uuid;
  v_day        date;
  v_habit      record;
  v_bad        record;
  v_key        text;
  v_created    date;
  v_created_key text;
  v_cursor     text;
  v_cursor_day date;
  v_misses     int;
  v_mult       double precision;
  v_penalty    int;
  v_entry_id   text;
  v_done       boolean;
  v_eligible   text[];
  v_planned    text[] := '{}';
  v_status     text;
  v_occ        int;
  v_goal       jsonb;
  v_target     int;
  v_logged     int;
  v_avg        int;
  v_inserted   int;
  v_changed    boolean := false;
BEGIN
  SELECT pr.username INTO v_username FROM public.profiles pr WHERE pr.id = p_user;
  SELECT CASE WHEN ps.user1_id = p_user THEN ps.user2_id ELSE ps.user1_id END
    INTO v_partner
    FROM public.partnerships ps
    WHERE ps.user1_id = p_user OR ps.user2_id = p_user
    LIMIT 1;

  -- Bad habits holding the point-eligible slots (getPointEligibleHabitIds, 2 slots).
  SELECT coalesce(array_agg(b.id ORDER BY b.ord_valid, b.ord_time, b.id), '{}') INTO v_eligible
  FROM (
    SELECT bh.id,
      (public.ascend_instant(bh.data->>'createdAt') IS NULL) AS ord_valid,
      public.ascend_instant(bh.data->>'createdAt') AS ord_time
    FROM public.bad_habits bh
    WHERE bh.user_id = p_user AND bh.deleted_at IS NULL
      AND coalesce((bh.data->>'isCompleted')::boolean, false) = false
    ORDER BY 2, 3, 1
    LIMIT 2
  ) b;

  v_day := p_from;
  WHILE v_day <= p_to LOOP

    -- a) Preset habits (processHabitPenalties). Daily: every day. Weekly: on the week's last day.
    FOR v_habit IN
      SELECT h.id, h.data
      FROM public.habits h
      WHERE h.user_id = p_user AND h.deleted_at IS NULL
        AND coalesce((h.data->>'isPreset')::boolean, false)
        AND coalesce((h.data->>'points')::numeric, 0) > 0
      ORDER BY h.created_at, h.id
    LOOP
      v_created := public.ascend_local_date(v_habit.data->>'createdAt', p_tz);
      IF v_created IS NULL OR v_day < v_created THEN
        CONTINUE;
      END IF;

      IF v_habit.data->>'frequency' = 'daily' THEN
        v_key := to_char(v_day, 'YYYY-MM-DD');
        v_created_key := coalesce(v_habit.data->>'createdAtPeriod', to_char(v_created, 'YYYY-MM-DD'));
      ELSE
        IF extract(isodow FROM v_day) <> 7 THEN
          CONTINUE;
        END IF;
        v_key := public.ascend_week_key(v_day, p_tz);
        v_created_key := coalesce(v_habit.data->>'createdAtPeriod', public.ascend_week_key(v_created, p_tz));
      END IF;

      -- isHabitPeriodCompleted
      v_done := CASE jsonb_typeof(v_habit.data->'completions')
        WHEN 'object' THEN coalesce(v_habit.data->'completions'->v_key->>'done', '') = 'true'
        WHEN 'array'  THEN (v_habit.data->'completions') ? v_key
        ELSE false END;
      IF v_done THEN
        CONTINUE;
      END IF;

      -- Already missed: in the ledger (deleted rows included, so an excised penalty is never
      -- re-issued by the server). The habit's missedPeriods is not trusted: the app writes it.
      IF EXISTS (
        SELECT 1 FROM public.point_entries pe
        WHERE pe.user_id = p_user
          AND (pe.id = 'habit_missed_' || v_habit.id || '_' || v_key
               OR (pe.data->>'source' = 'habit_missed'
                   AND pe.data->'metadata'->>'habitId' = v_habit.id
                   AND pe.data->'metadata'->>'period' = v_key))
      ) THEN
        CONTINUE;
      END IF;

      -- getHabitConsecutiveMissesUpToPeriod
      v_misses := 0;
      v_cursor := v_key;
      FOR i IN 1..(CASE WHEN v_habit.data->>'frequency' = 'daily' THEN 90 ELSE 52 END) LOOP
        EXIT WHEN v_cursor < v_created_key;
        EXIT WHEN CASE jsonb_typeof(v_habit.data->'completions')
          WHEN 'object' THEN coalesce(v_habit.data->'completions'->v_cursor->>'done', '') = 'true'
          WHEN 'array'  THEN (v_habit.data->'completions') ? v_cursor
          ELSE false END;
        v_misses := v_misses + 1;
        IF v_habit.data->>'frequency' = 'daily' THEN
          v_cursor := to_char(v_cursor::date - 1, 'YYYY-MM-DD');
        ELSE
          v_cursor := public.ascend_add_weeks(v_cursor, -1, p_tz);
        END IF;
      END LOOP;

      v_mult := public.ascend_miss_multiplier(v_misses, v_season);
      v_penalty := round((v_habit.data->>'points')::numeric * v_mult::numeric)::int;
      v_entry_id := 'habit_missed_' || v_habit.id || '_' || v_key;

      IF p_apply THEN
        INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
        VALUES (p_user, v_entry_id, jsonb_build_object(
          'id', v_entry_id,
          'amount', -v_penalty,
          'reason', 'Missed habit (' || v_mult || 'x penalty): ' || (v_habit.data->>'name'),
          'source', 'habit_missed',
          'timestamp', v_now_iso,
          'metadata', jsonb_build_object('habitId', v_habit.id, 'habitName', v_habit.data->>'name', 'period', v_key, 'multiplier', v_mult)
        ), now(), now())
        ON CONFLICT (user_id, id) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        IF v_inserted = 0 THEN
          CONTINUE;
        END IF;

        PERFORM public.create_notification_atomic(
          p_recipient_id => p_user,
          p_type => 'missed_habit',
          p_title => 'Habit Missed Penalty',
          p_message => 'You missed your habit "' || (v_habit.data->>'name') || '" for period ' || v_key || '. '
                       || CASE WHEN v_penalty > 0 THEN v_penalty || ' points deducted.' ELSE '' END,
          p_payload => jsonb_build_object('habitId', v_habit.id, 'habitName', v_habit.data->>'name', 'period', v_key,
                                          'dedupKey', 'missed_habit_' || v_habit.id || '_' || v_key)
        );
        IF v_partner IS NOT NULL THEN
          PERFORM public.create_notification_atomic(
            p_recipient_id => v_partner,
            p_actor_id => p_user,
            p_type => 'partner_missed_habit',
            p_title => 'Streak Risk Warning',
            p_message => 'Your partner ' || coalesce(v_username, 'User') || ' missed their habit "' || (v_habit.data->>'name')
                         || '". Reach out to encourage them!',
            p_payload => jsonb_build_object('habitId', v_habit.id, 'habitName', v_habit.data->>'name', 'period', v_key,
                                            'dedupKey', 'partner_missed_habit_' || v_habit.id || '_' || v_key)
          );
        END IF;
        v_changed := true;
      END IF;

      v_season := greatest(v_season - v_penalty, 0);
      kind := 'habit_missed'; entity_id := v_habit.id; period := v_key; amount := -v_penalty; multiplier := v_mult;
      RETURN NEXT;
    END LOOP;

    -- b) Bad-habit no-reports (processBadHabitNoReports), oldest habit first.
    FOR v_bad IN
      SELECT bh.id, bh.data
      FROM public.bad_habits bh
      WHERE bh.user_id = p_user AND bh.deleted_at IS NULL
        AND coalesce((bh.data->>'isCompleted')::boolean, false) = false
      ORDER BY public.ascend_instant(bh.data->>'createdAt') NULLS LAST, bh.id
    LOOP
      v_created := public.ascend_local_date(v_bad.data->>'createdAt', p_tz);
      IF v_created IS NULL OR v_day < v_created THEN
        CONTINUE;
      END IF;
      v_key := to_char(v_day, 'YYYY-MM-DD');

      -- Any live log for the day, or this day's no-report row in any state (a deleted one
      -- was removed by the user and stays removed).
      IF EXISTS (
        SELECT 1 FROM public.bad_habit_logs l
        WHERE l.user_id = p_user
          AND ((l.deleted_at IS NULL AND l.data->>'badHabitId' = v_bad.id AND l.data->>'date' = v_key)
               OR l.id = 'no_report_' || v_bad.id || '_' || v_key)
      ) OR (v_bad.id || '|' || v_key) = ANY (v_planned) THEN
        CONTINUE;
      END IF;

      -- consecutiveOccurrences: 1 + the unbroken run of occurred/no_report logs before the day.
      v_occ := 1;
      FOR v_status IN
        SELECT s.status FROM (
          SELECT l.data->>'date' AS d, l.data->>'status' AS status
          FROM public.bad_habit_logs l
          WHERE l.user_id = p_user AND l.deleted_at IS NULL
            AND l.data->>'badHabitId' = v_bad.id AND l.data->>'date' < v_key
          UNION ALL
          SELECT split_part(p, '|', 2), 'no_report'
          FROM unnest(v_planned) p
          WHERE split_part(p, '|', 1) = v_bad.id AND split_part(p, '|', 2) < v_key
        ) s
        ORDER BY s.d DESC
      LOOP
        EXIT WHEN v_status NOT IN ('occurred', 'no_report');
        v_occ := v_occ + 1;
      END LOOP;

      IF v_bad.id = ANY (v_eligible) THEN
        v_mult := public.ascend_miss_multiplier(v_occ, v_season);
        v_penalty := round(3 * v_mult::numeric)::int;
      ELSE
        v_mult := 1;
        v_penalty := 0;
      END IF;

      -- A preview writes nothing, so it remembers its own no-report days for the run.
      IF NOT p_apply THEN
        v_planned := v_planned || (v_bad.id || '|' || v_key);
      END IF;

      IF p_apply THEN
        INSERT INTO public.bad_habit_logs (user_id, id, data, created_at, updated_at)
        VALUES (p_user, 'no_report_' || v_bad.id || '_' || v_key, jsonb_build_object(
          'id', 'no_report_' || v_bad.id || '_' || v_key,
          'badHabitId', v_bad.id,
          'date', v_key,
          'status', 'no_report',
          'consecutiveOccurrences', v_occ,
          'pointsAwardedOrDeducted', -v_penalty,
          'createdAt', v_now_iso
        ), now(), now())
        ON CONFLICT (user_id, id) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        IF v_inserted = 0 THEN
          CONTINUE;
        END IF;
        v_changed := true;

        IF v_penalty > 0 THEN
          v_entry_id := 'bad_habit_no_report_' || v_bad.id || '_' || v_key;
          INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
          VALUES (p_user, v_entry_id, jsonb_build_object(
            'id', v_entry_id,
            'amount', -v_penalty,
            'reason', 'No-report bad habit penalty (' || v_mult || 'x penalty): ' || (v_bad.data->>'name'),
            'source', 'bad_habit_no_report',
            'timestamp', v_now_iso,
            'metadata', jsonb_build_object('badHabitId', v_bad.id, 'badHabitName', v_bad.data->>'name', 'date', v_key, 'multiplier', v_mult)
          ), now(), now())
          ON CONFLICT (user_id, id) DO NOTHING;

          PERFORM public.create_notification_atomic(
            p_recipient_id => p_user,
            p_type => 'bad_habit_no_report',
            p_title => 'Bad Habit No-Report Penalty',
            p_message => 'No status reported for "' || (v_bad.data->>'name') || '" on ' || v_key || '. '
                         || v_penalty || ' points deducted.',
            p_payload => jsonb_build_object('badHabitId', v_bad.id, 'badHabitName', v_bad.data->>'name', 'date', v_key,
                                            'dedupKey', 'bad_habit_' || v_bad.id || '_' || v_key)
          );
        END IF;
      END IF;

      v_season := greatest(v_season - v_penalty, 0);
      kind := 'bad_habit_no_report'; entity_id := v_bad.id; period := v_key; amount := -v_penalty; multiplier := v_mult;
      RETURN NEXT;
    END LOOP;

    -- c) Weekly exercise target (processExerciseTargetPenalties), on the week's last day.
    IF extract(isodow FROM v_day) = 7 THEN
      SELECT ud.state->'exerciseGoal' INTO v_goal FROM public.user_data ud WHERE ud.user_id = p_user;
      v_target := CASE WHEN v_goal->>'targetWeeklySessions' ~ '^\d+(\.\d+)?$' THEN (v_goal->>'targetWeeklySessions')::numeric::int ELSE 0 END;
      v_key := public.ascend_week_key(v_day, p_tz);

      IF v_target > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.point_entries pe
          WHERE pe.user_id = p_user
            AND (pe.id = 'exercise_missed_' || v_key
                 OR (pe.data->>'source' = 'exercise_missed' AND pe.data->'metadata'->>'weekKey' = v_key))
        )
      THEN
        SELECT count(*) INTO v_logged
        FROM public.workouts w
        WHERE w.user_id = p_user AND w.deleted_at IS NULL
          AND public.ascend_week_key(public.ascend_local_date(w.data->>'date', p_tz), p_tz) = v_key;

        IF v_logged < v_target THEN
          -- getExerciseGoalConsecutiveMisses, counted from the Monday after the week.
          v_created_key := public.ascend_week_key(public.ascend_local_date(v_goal->>'createdAt', p_tz), p_tz);
          v_misses := 0;
          FOR i IN 1..52 LOOP
            v_cursor := public.ascend_week_key(v_day + 1 - 7 * i, p_tz);
            EXIT WHEN v_created_key IS NOT NULL AND v_cursor < v_created_key;
            EXIT WHEN (
              SELECT count(*) FROM public.workouts w
              WHERE w.user_id = p_user AND w.deleted_at IS NULL
                AND public.ascend_week_key(public.ascend_local_date(w.data->>'date', p_tz), p_tz) = v_cursor
            ) >= v_target;
            v_misses := v_misses + 1;
          END LOOP;

          SELECT coalesce(round(avg(coalesce((w.data->>'durationMinutes')::numeric, 0))), 30)::int INTO v_avg
          FROM public.workouts w
          WHERE w.user_id = p_user AND w.deleted_at IS NULL;

          v_mult := public.ascend_miss_multiplier(v_misses, v_season);
          v_penalty := round(v_avg * v_mult::numeric)::int;
          v_entry_id := 'exercise_missed_' || v_key;

          IF p_apply THEN
            INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
            VALUES (p_user, v_entry_id, jsonb_build_object(
              'id', v_entry_id,
              'amount', -v_penalty,
              'reason', 'Missed weekly workout goal (' || v_logged || '/' || v_target || ' sessions, ' || v_mult || 'x penalty)',
              'source', 'exercise_missed',
              'timestamp', v_now_iso,
              'metadata', jsonb_build_object('weekKey', v_key, 'logged', v_logged, 'target', v_target, 'multiplier', v_mult)
            ), now(), now())
            ON CONFLICT (user_id, id) DO NOTHING;
            GET DIAGNOSTICS v_inserted = ROW_COUNT;
            IF v_inserted > 0 THEN
              PERFORM public.create_notification_atomic(
                p_recipient_id => p_user,
                p_type => 'missed_exercise_target',
                p_title => 'Exercise Goal Missed',
                p_message => 'You logged ' || v_logged || '/' || v_target || ' workout sessions for week ' || v_key || '. '
                             || CASE WHEN v_penalty > 0 THEN v_penalty || ' points deducted.' ELSE '' END,
                p_payload => jsonb_build_object('weekKey', v_key, 'logged', v_logged, 'target', v_target,
                                                'dedupKey', 'missed_exercise_' || v_key)
              );
              v_changed := true;
            END IF;
          END IF;

          IF NOT p_apply OR v_inserted > 0 THEN
            v_season := greatest(v_season - v_penalty, 0);
            kind := 'exercise_missed'; entity_id := v_key; period := v_key; amount := -v_penalty; multiplier := v_mult;
            RETURN NEXT;
          END IF;
        END IF;
      END IF;
    END IF;

    v_day := v_day + 1;
  END LOOP;

  -- The leaderboard reads profiles.season_points; the app writes the same value on its next save.
  IF p_apply AND v_changed THEN
    v_season := public.ascend_season_points(p_user);
    UPDATE public.profiles SET season_points = v_season, total_points = v_season WHERE id = p_user;
  END IF;
END;
$function$;
