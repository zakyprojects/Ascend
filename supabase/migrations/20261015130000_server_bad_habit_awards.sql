-- Bad-habit points from the server (knowledge/trusted-clock-plan.md, Part 2 #2, Option C module 2)
-- The app used to write its own bad-habit points to point_entries. Now:
--   * Resist awards: one row per (bad habit, local day), id bad_habit_resist_<id>_<YYYY-MM-DD>,
--     +3 each, at most 2 a day and 6 points (allocateEligibleResistPoints). Only the 2 oldest
--     active bad habits earn; a log that already earned keeps its place first.
--   * Occurred penalties: bad_habit_occurred_<id>_<YYYY-MM-DD>, 5 x the miss multiplier,
--     point-eligible habits only. The amount is fixed when the row is first written; undoing
--     today's log removes it.
--   * Only the user's current local day is (re)computed. The app may write only today's
--     resisted/occurred logs; past days and no-report logs are the server's.
--   * Deleting an active bad habit reverses its resist points (server rows, plus one
--     bad_habit_delete_<id> row for the app-written points before 2026-10-15) and today's
--     occurred penalty; past penalties stay. Its logs are deleted with it.
--   * The app can no longer write bad_habit_* or habit_missed point rows (skipped silently).
--   * No-report penalty base 5 -> 3 (Zakria 2026-10-15); occurred base 10 -> 5. Old rows keep
--     their amounts. Duplicate no-report penalties written by old app builds are removed.
-- Change together with src/lib/badHabitAwards.ts and BAD_HABIT_POINTS (src/lib/pointsConfig.ts).

BEGIN;

-- 1. Duplicate no-report penalties (one per bad habit and day; the server's own id first).
UPDATE public.point_entries pe
SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
FROM (
  SELECT p.user_id, p.id,
         row_number() OVER (
           PARTITION BY p.user_id, p.data->'metadata'->>'badHabitId', p.data->'metadata'->>'date'
           ORDER BY (p.id LIKE 'bad\_habit\_no\_report\_%') DESC,
                    public.ascend_instant(p.data->>'timestamp') NULLS LAST, p.id COLLATE "C"
         ) AS rn
  FROM public.point_entries p
  WHERE p.deleted_at IS NULL
    AND p.data->>'source' = 'bad_habit_no_report'
    AND p.data->'metadata'->>'badHabitId' IS NOT NULL
    AND p.data->'metadata'->>'date' IS NOT NULL
) d
WHERE pe.user_id = d.user_id AND pe.id = d.id AND d.rn > 1;

-- 2. No-report base 3 (the one changed line of the live function: round(3 * v_mult)).
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

      -- Already missed: in the habit's missedPeriods or the ledger (deleted rows included,
      -- so an excised penalty is never re-issued by the server).
      IF coalesce(v_habit.data->'missedPeriods', '[]'::jsonb) ? v_key OR EXISTS (
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
        AND coalesce(v_goal->>'lastEvaluatedWeek', '') <> v_key
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


-- 3. Bad habits holding the point-eligible slots (getPointEligibleHabitIds, 2 slots).
CREATE OR REPLACE FUNCTION public.ascend_bad_habit_eligible(p_user uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT coalesce(array_agg(b.id ORDER BY b.ord_valid, b.ord_time, b.id COLLATE "C"), '{}')
  FROM (
    SELECT bh.id,
      (public.ascend_instant(bh.data->>'createdAt') IS NULL) AS ord_valid,
      public.ascend_instant(bh.data->>'createdAt') AS ord_time
    FROM public.bad_habits bh
    WHERE bh.user_id = p_user AND bh.deleted_at IS NULL
      AND coalesce(bh.data->>'isCompleted', '') <> 'true'
    ORDER BY 2, 3, bh.id COLLATE "C"
    LIMIT 2
  ) b;
$function$;

-- 4. The bad-habit point rows of one user's local day, recomputed from the day's logs.
CREATE OR REPLACE FUNCTION public.ascend_recompute_bad_habit_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_eligible  text[]      := public.ascend_bad_habit_eligible(p_user);
  v_used      int         := 0;
  v_count     int         := 0;
  v_kept      text[]      := '{}';
  v_id        text;
  v_at        timestamptz;
  v_occ       int;
  v_mult      double precision;
  v_penalty   int;
  v_status    text;
  v_item      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bad_habit_awards:' || p_user::text || ':' || v_key));

  -- a) Resists: one log per habit (the earliest); logs that already earned go first.
  FOR v_item IN
    SELECT * FROM (
      SELECT DISTINCT ON (l.data->>'badHabitId')
        l.data->>'badHabitId' AS bh_id,
        bh.data->>'name' AS name,
        coalesce(public.ascend_instant(l.data->>'createdAt'), 'epoch'::timestamptz) AS logged_at,
        l.id,
        EXISTS (
          SELECT 1 FROM public.point_entries pe
          WHERE pe.user_id = p_user AND pe.deleted_at IS NULL
            AND pe.id = 'bad_habit_resist_' || (l.data->>'badHabitId') || '_' || v_key
            AND coalesce((pe.data->>'amount')::numeric, 0) > 0
        ) AS earned
      FROM public.bad_habit_logs l
      JOIN public.bad_habits bh
        ON bh.user_id = l.user_id AND bh.id = l.data->>'badHabitId' AND bh.deleted_at IS NULL
      WHERE l.user_id = p_user AND l.deleted_at IS NULL
        AND l.data->>'date' = v_key AND l.data->>'status' = 'resisted'
      ORDER BY l.data->>'badHabitId', 3, l.id COLLATE "C"
    ) r
    WHERE r.earned OR r.bh_id = ANY (v_eligible)
    ORDER BY r.earned DESC, r.logged_at, r.id COLLATE "C"
  LOOP
    CONTINUE WHEN v_count >= 2 OR v_used + 3 > 6; -- maxDailyResists, resistBase, dailyCap
    v_count := v_count + 1;
    v_used := v_used + 3;

    v_id := 'bad_habit_resist_' || v_item.bh_id || '_' || v_key;
    v_kept := array_append(v_kept, v_id);
    v_at := least(greatest(v_item.logged_at, v_day_start), now());

    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', 3,
      'reason', 'Bad habit resisted: ' || coalesce(v_item.name, ''),
      'source', 'bad_habit_resisted',
      'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', jsonb_build_object('badHabitId', v_item.bh_id, 'date', v_key, 'status', 'resisted')
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  END LOOP;

  -- b) Occurred: a live penalty keeps its amount; a new one uses today's streak and season.
  FOR v_item IN
    SELECT DISTINCT ON (l.data->>'badHabitId')
      l.data->>'badHabitId' AS bh_id,
      bh.data->>'name' AS name,
      coalesce(public.ascend_instant(l.data->>'createdAt'), 'epoch'::timestamptz) AS logged_at
    FROM public.bad_habit_logs l
    JOIN public.bad_habits bh
      ON bh.user_id = l.user_id AND bh.id = l.data->>'badHabitId' AND bh.deleted_at IS NULL
    WHERE l.user_id = p_user AND l.deleted_at IS NULL
      AND l.data->>'date' = v_key AND l.data->>'status' = 'occurred'
    ORDER BY l.data->>'badHabitId', 3, l.id COLLATE "C"
  LOOP
    v_id := 'bad_habit_occurred_' || v_item.bh_id || '_' || v_key;
    IF EXISTS (SELECT 1 FROM public.point_entries pe
               WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL) THEN
      v_kept := array_append(v_kept, v_id);
      CONTINUE;
    END IF;
    CONTINUE WHEN NOT (v_item.bh_id = ANY (v_eligible));

    -- consecutiveOccurrences: 1 + the unbroken run of occurred/no_report logs before the day.
    v_occ := 1;
    FOR v_status IN
      SELECT l.data->>'status'
      FROM public.bad_habit_logs l
      WHERE l.user_id = p_user AND l.deleted_at IS NULL
        AND l.data->>'badHabitId' = v_item.bh_id AND l.data->>'date' < v_key
      ORDER BY l.data->>'date' DESC
    LOOP
      EXIT WHEN v_status IS NULL OR v_status NOT IN ('occurred', 'no_report');
      v_occ := v_occ + 1;
    END LOOP;

    v_mult := public.ascend_miss_multiplier(v_occ, public.ascend_season_points(p_user));
    v_penalty := round(5 * v_mult::numeric)::int; -- occurBase
    CONTINUE WHEN v_penalty <= 0;

    v_kept := array_append(v_kept, v_id);
    v_at := least(greatest(v_item.logged_at, v_day_start), now());
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', -v_penalty,
      'reason', 'Bad habit occurred (' || v_mult || 'x penalty): ' || coalesce(v_item.name, ''),
      'source', 'bad_habit_occurred',
      'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', jsonb_build_object('badHabitId', v_item.bh_id, 'date', v_key, 'status', 'occurred')
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at);
  END LOOP;

  -- c) Rows that no longer hold, and the app-written resist/occurred rows of the day.
  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.data->'metadata'->>'date' = v_key
    AND (
      ((pe.id LIKE 'bad\_habit\_resist\_%' OR pe.id LIKE 'bad\_habit\_occurred\_%') AND NOT pe.id = ANY (v_kept))
      OR (pe.id NOT LIKE 'bad\_habit\_%'
          AND pe.data->>'source' IN ('bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_undo'))
    );
END;
$function$;

-- 5. The owner's timezone (every profile has one since 20261015120000).
CREATE OR REPLACE FUNCTION public.ascend_user_timezone(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(
    (SELECT pr.timezone FROM public.profiles pr
     JOIN pg_catalog.pg_timezone_names tz ON tz.name = pr.timezone
     WHERE pr.id = p_user),
    'Asia/Karachi');
$function$;

-- 6. A log change recomputes the owner's current local day (a habit delete recomputes once).
CREATE OR REPLACE FUNCTION public.bad_habit_logs_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  v_tz := public.ascend_user_timezone(NEW.user_id);
  PERFORM public.ascend_recompute_bad_habit_awards(NEW.user_id, (now() AT TIME ZONE v_tz)::date, v_tz);
  RETURN NULL;
END;
$function$;

-- 7. A bad-habit change (add, complete, delete) recomputes the day; a delete also reverses.
CREATE OR REPLACE FUNCTION public.bad_habits_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz     text := public.ascend_user_timezone(NEW.user_id);
  v_day    date := (now() AT TIME ZONE v_tz)::date;
  v_refund numeric;
  v_id     text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF coalesce(OLD.data->>'isCompleted', '') <> 'true' THEN
      -- App-written resist points before the server owned them (the deleteBadHabit refund).
      SELECT coalesce(sum((l.data->>'pointsAwardedOrDeducted')::numeric), 0) INTO v_refund
      FROM public.bad_habit_logs l
      WHERE l.user_id = NEW.user_id AND l.deleted_at IS NULL
        AND l.data->>'badHabitId' = NEW.id
        AND l.data->>'status' = 'resisted'
        AND l.data->>'date' < '2026-10-15' -- BAD_HABIT_AWARDS_SERVER_SINCE
        AND (l.data->>'pointsAwardedOrDeducted') ~ '^\d+(\.\d+)?$';
      IF v_refund > 0 THEN
        v_id := 'bad_habit_delete_' || NEW.id;
        INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
        VALUES (NEW.user_id, v_id, jsonb_build_object(
          'id', v_id,
          'amount', -round(v_refund)::int,
          'reason', 'Bad habit deleted: ' || coalesce(OLD.data->>'name', ''),
          'source', 'bad_habit_delete',
          'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'metadata', jsonb_build_object('badHabitId', NEW.id)
        ), now(), now())
        ON CONFLICT (user_id, id) DO NOTHING;
      END IF;

      -- The server's resist points (every day) and today's occurred penalty.
      UPDATE public.point_entries pe
      SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
      WHERE pe.user_id = NEW.user_id AND pe.deleted_at IS NULL
        AND pe.data->'metadata'->>'badHabitId' = NEW.id
        AND (pe.id LIKE 'bad\_habit\_resist\_%'
             OR pe.id = 'bad_habit_occurred_' || NEW.id || '_' || to_char(v_day, 'YYYY-MM-DD'));
    END IF;

    UPDATE public.bad_habit_logs l
    SET deleted_at = now(), updated_at = greatest(now(), l.updated_at)
    WHERE l.user_id = NEW.user_id AND l.deleted_at IS NULL AND l.data->>'badHabitId' = NEW.id;
  END IF;

  PERFORM public.ascend_recompute_bad_habit_awards(NEW.user_id, v_day, v_tz);
  RETURN NULL;
END;
$function$;

-- 8. The app writes only today's resisted/occurred logs. Other writes by anon/authenticated
--    (past days, no-report logs) are skipped, not refused, so the outbox settles them.
CREATE OR REPLACE FUNCTION public.bad_habit_logs_guard_today()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_tz    text;
  v_today text;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  SELECT pr.timezone INTO v_tz
  FROM public.profiles pr
  JOIN pg_catalog.pg_timezone_names tz ON tz.name = pr.timezone
  WHERE pr.id = NEW.user_id;
  v_today := to_char((now() AT TIME ZONE coalesce(v_tz, 'Asia/Karachi'))::date, 'YYYY-MM-DD');

  IF NEW.id LIKE 'no\_report\_%'
     OR coalesce(NEW.data->>'status', '') NOT IN ('resisted', 'occurred')
     OR NEW.data->>'date' IS DISTINCT FROM v_today
     OR (TG_OP = 'UPDATE' AND (coalesce(OLD.data->>'status', '') NOT IN ('resisted', 'occurred')
                               OR OLD.data->>'date' IS DISTINCT FROM v_today))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- 9. Only the server writes habit awards, bad-habit points and missed-habit penalties.
CREATE OR REPLACE FUNCTION public.point_entries_guard_server_owned()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.id LIKE 'habit\_award\_%' OR NEW.id LIKE 'bad\_habit\_%' OR NEW.id LIKE 'habit\_missed\_%'
     OR NEW.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                'bad_habit_undo', 'bad_habit_delete')
     OR (TG_OP = 'UPDATE' AND (
         OLD.id LIKE 'habit\_award\_%' OR OLD.id LIKE 'bad\_habit\_%' OR OLD.id LIKE 'habit\_missed\_%'
         OR OLD.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                    'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                    'bad_habit_undo', 'bad_habit_delete')))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_bad_habit_eligible(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_bad_habit_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_user_timezone(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bad_habit_logs_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bad_habits_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bad_habit_logs_guard_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_entries_guard_server_owned() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_process_penalties(uuid, text, date, date, boolean) FROM PUBLIC, anon, authenticated;

-- Runs after bad_habit_logs_guard_future, before bad_habit_logs_keep_newer (name order).
CREATE TRIGGER bad_habit_logs_guard_today BEFORE INSERT OR UPDATE ON public.bad_habit_logs
  FOR EACH ROW EXECUTE FUNCTION public.bad_habit_logs_guard_today();

-- 10. Server rows for today (BAD_HABIT_AWARDS_SERVER_SINCE = 2026-10-15); the app's own
--     resist/occurred rows for today are retired.
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN SELECT DISTINCT bh.user_id FROM public.bad_habits bh LOOP
    PERFORM public.ascend_recompute_bad_habit_awards(
      v_row.user_id,
      (now() AT TIME ZONE public.ascend_user_timezone(v_row.user_id))::date,
      public.ascend_user_timezone(v_row.user_id));
  END LOOP;
END $$;

CREATE TRIGGER bad_habit_logs_award_points AFTER INSERT OR UPDATE ON public.bad_habit_logs
  FOR EACH ROW EXECUTE FUNCTION public.bad_habit_logs_award_points();
CREATE TRIGGER bad_habits_award_points AFTER INSERT OR UPDATE ON public.bad_habits
  FOR EACH ROW EXECUTE FUNCTION public.bad_habits_award_points();

COMMIT;
