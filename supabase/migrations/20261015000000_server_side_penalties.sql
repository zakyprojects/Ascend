-- Server-side penalties, step 1 (knowledge/server-side-plan.md)
-- Missed preset habits, bad-habit no-reports and missed weekly exercise targets are
-- now issued by the server after each user's local midnight, even when the app is
-- never opened. The rules mirror src/lib/habitPenalties.ts exactly; both sides write
-- the same deterministic ids, so whichever runs first wins and the other is a no-op:
--   point_entries   habit_missed_<habitId>_<period>
--                   bad_habit_no_report_<badHabitId>_<date>
--                   exercise_missed_<weekKey>
--   bad_habit_logs  no_report_<badHabitId>_<date>
-- The server never writes habit documents or the user_data blob (missedPeriods,
-- exerciseGoal.lastEvaluatedWeek stay client-owned); the client dedupes on the ledger.
-- Each user starts at the local day the job first sees them (no backfill), and a
-- user without a valid saved timezone is skipped until the app saves one.

BEGIN;

-- 1. The user's IANA timezone, written by the app on every profile save.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text;

-- 2. Last local day the job finished for each user. Server-only.
CREATE TABLE public.penalty_cursor (
  user_id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_local_date date        NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.penalty_cursor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.penalty_cursor FROM PUBLIC, anon, authenticated;

-- 3. Helpers (ports of src/lib/dates.ts and src/lib/leagues.ts)

-- parseDate + local day: 'YYYY-MM-DD' is already a local day; anything else is an instant.
CREATE OR REPLACE FUNCTION public.ascend_local_date(p_value text, p_tz text)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  IF btrim(p_value) ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN btrim(p_value)::date;
  END IF;
  RETURN (btrim(p_value)::timestamptz AT TIME ZONE p_tz)::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

-- Date.parse(): an instant, or NULL when the value is not one.
CREATE OR REPLACE FUNCTION public.ascend_instant(p_value text)
 RETURNS timestamptz
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN nullif(btrim(p_value), '')::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

-- weekKey(): Monday-start week, numbered with the app's own (non-ISO) formula, which
-- measures Jan 1 -> Monday in local milliseconds (DST included).
CREATE OR REPLACE FUNCTION public.ascend_week_key(p_day date, p_tz text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_monday date := p_day - (extract(isodow FROM p_day)::int - 1);
  v_year   int  := extract(year FROM v_monday)::int;
  v_jan1   date := make_date(v_year, 1, 1);
  v_days   numeric;
  v_week   int;
BEGIN
  v_days := extract(epoch FROM (v_monday::timestamp AT TIME ZONE p_tz) - (v_jan1::timestamp AT TIME ZONE p_tz)) / 86400.0;
  v_week := ceil((v_days + extract(dow FROM v_jan1) + 1) / 7.0)::int;
  RETURN v_year || '-W' || lpad(v_week::text, 2, '0');
END;
$function$;

-- addWeeks(key, n)
CREATE OR REPLACE FUNCTION public.ascend_add_weeks(p_key text, p_weeks int, p_tz text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_match  text[] := regexp_match(p_key, '^(\d{4})-W(\d{2})$');
  v_year   int;
  v_week   int;
  v_dow    int;
  v_offset int;
BEGIN
  IF v_match IS NULL THEN
    RETURN p_key;
  END IF;
  v_year := v_match[1]::int;
  v_week := v_match[2]::int;
  v_dow := extract(dow FROM make_date(v_year, 1, 1))::int;
  v_offset := CASE WHEN v_dow = 0 THEN 1 ELSE 1 - v_dow END;
  RETURN public.ascend_week_key(make_date(v_year, 1, 1) + v_offset + (v_week - 1) * 7 + p_weeks * 7, p_tz);
END;
$function$;

-- getMissPenaltyMultiplier()
CREATE OR REPLACE FUNCTION public.ascend_miss_multiplier(p_misses int, p_season_points int)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_misses <= 1 THEN 1.0
    WHEN p_season_points < 2000 THEN 1.5
    WHEN p_misses = 2 THEN 2.0
    ELSE 2.5
  END::double precision;
$function$;

-- calculateSeasonalTotal() over the live ledger: chronological, floored at zero.
CREATE OR REPLACE FUNCTION public.ascend_season_points(p_user uuid)
 RETURNS int
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_epoch  timestamptz := '2026-08-01 00:00:00+00';
  v_length interval    := interval '90 days';
  v_start  timestamptz;
  v_total  numeric := 0;
  v_amount numeric;
BEGIN
  v_start := v_epoch + v_length * greatest(0, floor(extract(epoch FROM now() - v_epoch) / extract(epoch FROM v_length)));
  FOR v_amount IN
    SELECT coalesce((pe.data->>'amount')::numeric, 0)
    FROM public.point_entries pe
    WHERE pe.user_id = p_user
      AND pe.deleted_at IS NULL
      AND coalesce(pe.data->>'source', '') <> 'system'
      AND coalesce(pe.data->>'reason', '') <> 'System: Debt Forgiveness'
      AND public.ascend_instant(pe.data->>'timestamp') >= v_start
    ORDER BY public.ascend_instant(pe.data->>'timestamp')
  LOOP
    v_total := greatest(v_total + v_amount, 0);
  END LOOP;
  RETURN round(v_total)::int;
END;
$function$;

-- 4. The rules: evaluates local days p_from..p_to for one user. With p_apply false it
-- only reports what it would do (preview); with p_apply true it writes and notifies.
CREATE OR REPLACE FUNCTION public.ascend_process_penalties(p_user uuid, p_tz text, p_from date, p_to date, p_apply boolean)
 RETURNS TABLE(kind text, entity_id text, period text, amount int, multiplier double precision)
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
        v_penalty := round(5 * v_mult::numeric)::int;
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

-- 5. Hourly runner: every user whose local day has moved on since the last run.
CREATE OR REPLACE FUNCTION public.ascend_run_due_penalties()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_row       record;
  v_yesterday date;
BEGIN
  FOR v_row IN
    SELECT pr.id, pr.timezone, pc.last_local_date
    FROM public.profiles pr
    JOIN pg_catalog.pg_timezone_names tz ON tz.name = pr.timezone
    LEFT JOIN public.penalty_cursor pc ON pc.user_id = pr.id
  LOOP
    v_yesterday := (now() AT TIME ZONE v_row.timezone)::date - 1;

    IF v_row.last_local_date IS NULL THEN
      -- First sight: start from today, nothing older is backfilled.
      INSERT INTO public.penalty_cursor (user_id, last_local_date) VALUES (v_row.id, v_yesterday)
      ON CONFLICT (user_id) DO NOTHING;
      CONTINUE;
    END IF;

    IF v_row.last_local_date >= v_yesterday THEN
      CONTINUE;
    END IF;

    BEGIN
      -- At most the last 7 days (a paused project catches up a week; the app covers more).
      PERFORM public.ascend_process_penalties(
        v_row.id, v_row.timezone, greatest(v_row.last_local_date + 1, v_yesterday - 6), v_yesterday, true
      );
      UPDATE public.penalty_cursor SET last_local_date = v_yesterday, updated_at = now() WHERE user_id = v_row.id;
    EXCEPTION WHEN OTHERS THEN
      -- One user's failure never blocks the others; the cursor stays, so the next run retries.
      RAISE WARNING 'ascend_run_due_penalties: user % failed: %', v_row.id, SQLERRM;
    END;
  END LOOP;
END;
$function$;

-- 6. Read-only preview for verification: what the rules would issue, writing nothing.
CREATE OR REPLACE FUNCTION public.ascend_preview_penalties(p_user uuid, p_from date, p_to date)
 RETURNS TABLE(kind text, entity_id text, period text, amount int, multiplier double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT * FROM public.ascend_process_penalties(
    p_user,
    (SELECT pr.timezone FROM public.profiles pr WHERE pr.id = p_user),
    p_from, p_to, false
  );
$function$;

REVOKE ALL ON FUNCTION public.ascend_instant(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_local_date(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_week_key(date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_add_weeks(text, int, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_miss_multiplier(int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_season_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_process_penalties(uuid, text, date, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_run_due_penalties() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_preview_penalties(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_preview_penalties(uuid, date, date) TO supabase_read_only_user;

-- 7. create_notification_atomic: also accept the server's own penalty notifications.
-- Unchanged for clients (auth.uid() set). With no auth.uid() (cron / service role only:
-- anon has no EXECUTE), self penalty types are allowed for any recipient, and partner
-- types take p_actor_id as the actor when an active partnership links actor and recipient.
-- Same signature, so no overload to drop.
CREATE OR REPLACE FUNCTION public.create_notification_atomic(p_recipient_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_actor_username text DEFAULT NULL::text, p_actor_avatar text DEFAULT NULL::text, p_type character varying DEFAULT 'system'::character varying, p_title text DEFAULT NULL::text, p_message text DEFAULT ''::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id UUID;
  v_actor_username TEXT;
  v_actor_avatar TEXT;
  v_notif_id UUID;
  v_dedup_key TEXT;
  v_notif_partner_activity BOOLEAN := TRUE;
  v_notif_league_updates BOOLEAN := TRUE;
  v_notif_daily_reminder BOOLEAN := TRUE;
  v_notif_sunday_planning BOOLEAN := TRUE;
BEGIN
  -- 1. Force actor_id to auth.uid() internally (caller cannot spoof actor identity)
  -- If auth.uid() is NULL, only allowed for service_role / cron / system processes,
  -- which name the actor themselves for partner activity.
  IF auth.uid() IS NOT NULL THEN
    v_actor_id := auth.uid();
  ELSIF p_type IN ('partner_pledge_done', 'challenge_completed', 'partner_missed_habit', 'partner_nudge') THEN
    v_actor_id := p_actor_id;
  ELSE
    v_actor_id := NULL;
  END IF;

  -- 2. Derive actor_username and actor_avatar from public.profiles using the enforced actor
  IF v_actor_id IS NOT NULL THEN
    SELECT username, avatar INTO v_actor_username, v_actor_avatar
    FROM public.profiles
    WHERE id = v_actor_id;

    IF v_actor_username IS NULL THEN
      v_actor_username := COALESCE(p_actor_username, 'User');
    END IF;
    IF v_actor_avatar IS NULL THEN
      v_actor_avatar := COALESCE(p_actor_avatar, '🧑');
    END IF;
  ELSE
    v_actor_username := NULL;
    v_actor_avatar := NULL;
  END IF;

  -- 3. Enforce recipient rules per notification type
  -- SELF types: recipient must equal auth.uid(); the server (no auth.uid()) may send them to anyone
  IF p_type IN ('addiction_milestone', 'missed_habit', 'bad_habit_no_report', 'missed_exercise_target') THEN
    IF auth.uid() IS NOT NULL AND p_recipient_id != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: recipient must equal authenticated user for self notifications';
    END IF;

  -- ACTIVE PARTNER types: active partnership row must exist between the actor and recipient
  ELSIF p_type IN ('partner_pledge_done', 'challenge_completed', 'partner_missed_habit', 'partner_nudge') THEN
    IF v_actor_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: authenticated session required for partner activity notifications';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.partnerships
      WHERE (user1_id = v_actor_id AND user2_id = p_recipient_id)
         OR (user2_id = v_actor_id AND user1_id = p_recipient_id)
    ) THEN
      RAISE EXCEPTION 'Unauthorized: active partnership required between sender and recipient';
    END IF;

  -- INVITE PARTY types: caller must be one of the two parties on the relevant invite or partnership
  ELSIF p_type IN ('partner_invite', 'partner_invite_declined', 'partner_invite_accepted') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: authenticated session required for invite notifications';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.partner_invites
      WHERE (from_user_id = auth.uid() AND to_user_id = p_recipient_id)
         OR (to_user_id = auth.uid() AND from_user_id = p_recipient_id)
    ) AND NOT EXISTS (
      SELECT 1 FROM public.partnerships
      WHERE (user1_id = auth.uid() AND user2_id = p_recipient_id)
         OR (user2_id = auth.uid() AND user1_id = p_recipient_id)
    ) THEN
      RAISE EXCEPTION 'Unauthorized: caller must be a party to the invite or partnership';
    END IF;

  -- SYSTEM types: only allowed when auth.uid() IS NULL (cron / service_role context)
  ELSIF p_type IN ('daily_reminder', 'sunday_planning') OR p_type LIKE 'league_%' THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Unauthorized: system notifications cannot be triggered by authenticated clients';
    END IF;

  ELSE
    RAISE EXCEPTION 'Unauthorized or invalid notification type: %', p_type;
  END IF;

  -- 4. Preference gating logic (query recipient preferences from public.profiles)
  SELECT 
    COALESCE(notif_partner_activity, TRUE),
    COALESCE(notif_league_updates, TRUE),
    COALESCE(notif_daily_reminder, TRUE),
    COALESCE(notif_sunday_planning, TRUE)
  INTO 
    v_notif_partner_activity,
    v_notif_league_updates,
    v_notif_daily_reminder,
    v_notif_sunday_planning
  FROM public.profiles
  WHERE id = p_recipient_id;

  -- Enforce preference suppression according to notification type
  IF p_type IN ('partner_nudge', 'challenge_completed', 'partner_pledge_done', 'partner_missed_habit') AND v_notif_partner_activity IS FALSE THEN
    RETURN NULL;
  END IF;

  IF (p_type LIKE 'league_%' OR p_type IN ('league_reset', 'league_promotion', 'league_demotion', 'league_update')) AND v_notif_league_updates IS FALSE THEN
    RETURN NULL;
  END IF;

  IF p_type IN ('daily_reminder') AND v_notif_daily_reminder IS FALSE THEN
    RETURN NULL;
  END IF;

  IF p_type IN ('sunday_planning') AND v_notif_sunday_planning IS FALSE THEN
    RETURN NULL;
  END IF;

  -- 5. Dedup-on-conflict logic & insertion (return only the row ID)
  v_dedup_key := p_payload->>'dedupKey';

  IF v_dedup_key IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
    )
    VALUES (
      p_recipient_id, v_actor_id, v_actor_username, v_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
    )
    ON CONFLICT (recipient_id, ((payload->>'dedupKey'))) WHERE (payload->>'dedupKey') IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_notif_id;

    IF v_notif_id IS NULL THEN
      SELECT id INTO v_notif_id
      FROM public.notifications
      WHERE recipient_id = p_recipient_id AND payload->>'dedupKey' = v_dedup_key
      LIMIT 1;
    END IF;
  ELSE
    INSERT INTO public.notifications (
      recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
    )
    VALUES (
      p_recipient_id, v_actor_id, v_actor_username, v_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
    )
    RETURNING id INTO v_notif_id;
  END IF;

  RETURN v_notif_id;
END;
$function$;

-- 8. Every hour, five minutes past.
SELECT cron.schedule('ascend-penalties-hourly', '5 * * * *', 'SELECT public.ascend_run_due_penalties();');

COMMIT;
