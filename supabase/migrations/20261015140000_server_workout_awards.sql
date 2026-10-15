-- Workout points from the server (knowledge/server-side-plan.md, Part 2 #2, Option C module 3)
-- The app used to write its own workout points to point_entries, so a console write could
-- claim any amount. Now:
--   * The database writes one row per local day, id workout_award_<YYYY-MM-DD>: the day's
--     workouts' points (calculateWorkoutPoints in src/lib/pointsConfig.ts) up to the daily cap
--     of 10. Only the user's current local day is (re)computed, so deleting an earlier day's
--     workout keeps that day's points (Zakria 2026-10-15).
--   * The app writes workouts only for today; deleting a workout of any day is still allowed.
--     Other app writes to workouts are skipped silently, so a queued write never blocks the outbox.
--   * The app can no longer write workout points (source exercise, workout_award_ ids) or the
--     missed weekly-target penalties (source exercise_missed, exercise_missed_ ids).
-- Point values and the cap are unchanged. Older app-written rows stay as they are; the app's
-- "Workout logged" rows from 2026-10-15 (WORKOUT_AWARDS_SERVER_SINCE in src/lib/workoutAwards.ts)
-- are replaced by the server's row (live check 2026-10-15: there are none).
-- src/lib/workoutAwards.ts must stay identical to ascend_recompute_workout_awards.

BEGIN;

-- 1. Raw points of one workout (calculateWorkoutPoints; change both together).
CREATE OR REPLACE FUNCTION public.ascend_workout_points(p_workout jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_unit     text    := lower(btrim(coalesce(nullif(p_workout->>'unit', ''), 'mins'), E' \t\n\r'));
  v_amount   numeric := CASE WHEN jsonb_typeof(p_workout->'amount') = 'number'
                             THEN greatest((p_workout->>'amount')::numeric, 0) END;
  v_duration numeric := CASE WHEN jsonb_typeof(p_workout->'durationMinutes') = 'number'
                             THEN greatest((p_workout->>'durationMinutes')::numeric, 0) ELSE 0 END;
BEGIN
  RETURN CASE v_unit
    WHEN 'sets' THEN floor(coalesce(v_amount, v_duration) * 1)  -- pointsPerSet
    WHEN 'km'   THEN floor(coalesce(v_amount, v_duration) * 1)  -- pointsPerKm
    WHEN 'reps' THEN floor(coalesce(v_amount, 0) / 10)          -- repsPerPoint
    ELSE floor(CASE WHEN v_amount > 0 THEN v_amount ELSE v_duration END / 6)  -- minsPerPoint
  END;
END;
$function$;

-- 2. The award row of one user's local day, recomputed from the day's workouts.
CREATE OR REPLACE FUNCTION public.ascend_recompute_workout_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_day_end   timestamptz := (p_day + 1)::timestamp AT TIME ZONE p_tz;
  v_cap       numeric     := 10; -- WORKOUT_POINTS.dailyCap
  v_used      numeric     := 0;
  v_count     int         := 0;
  v_last      timestamptz;
  v_at        timestamptz;
  v_id        text        := 'workout_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_item      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('workout_awards:' || p_user::text || ':' || v_key));

  -- The day's workouts share the cap in log order.
  FOR v_item IN
    SELECT public.ascend_workout_points(w.data) AS points,
           public.ascend_instant(w.data->>'createdAt') AS logged_at
    FROM public.workouts w
    WHERE w.user_id = p_user
      AND w.deleted_at IS NULL
      AND w.data->>'date' = v_key
    ORDER BY 2 NULLS LAST, w.id COLLATE "C"
  LOOP
    v_count := v_count + 1;
    v_last := v_item.logged_at;
    v_used := v_used + least(v_item.points, greatest(v_cap - v_used, 0));
  END LOOP;

  IF v_used > 0 THEN
    v_at := least(greatest(coalesce(v_last, now()), v_day_start), now());
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_used::int,
      'reason', 'Workouts logged (' || v_count || ')',
      'source', 'exercise',
      'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', jsonb_build_object('date', v_key, 'workouts', v_count)
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  ELSE
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
  END IF;

  -- The app-written "Workout logged" rows of the day (before this migration).
  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.id NOT LIKE 'workout\_award\_%'
    AND pe.data->>'source' = 'exercise'
    AND jsonb_typeof(pe.data->'amount') = 'number'
    AND (pe.data->>'amount')::numeric > 0
    AND public.ascend_instant(pe.data->>'timestamp') >= v_day_start
    AND public.ascend_instant(pe.data->>'timestamp') < v_day_end;
END;
$function$;

-- 3. Any workout change recomputes the owner's current local day.
CREATE OR REPLACE FUNCTION public.workouts_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz text := public.ascend_user_timezone(NEW.user_id);
BEGIN
  PERFORM public.ascend_recompute_workout_awards(NEW.user_id, (now() AT TIME ZONE v_tz)::date, v_tz);
  RETURN NULL;
END;
$function$;

-- 4. The app writes workouts only for today, and may delete a workout of any day.
CREATE OR REPLACE FUNCTION public.workouts_guard_today()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_tz    text;
  v_today text;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Same lookup as ascend_user_timezone, which the app's roles cannot call.
  SELECT pr.timezone INTO v_tz
  FROM public.profiles pr
  JOIN pg_catalog.pg_timezone_names tz ON tz.name = pr.timezone
  WHERE pr.id = NEW.user_id;
  v_today := to_char((now() AT TIME ZONE coalesce(v_tz, 'Asia/Karachi'))::date, 'YYYY-MM-DD');
  IF NEW.data->>'date' IS DISTINCT FROM v_today
     OR (TG_OP = 'UPDATE' AND OLD.data->>'date' IS DISTINCT FROM v_today)
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- 5. Only the server writes habit awards, bad-habit points, workout points and missed-habit
--    and missed-workout penalties (20261015130000 plus the workout lines).
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
     OR NEW.id LIKE 'workout\_award\_%' OR NEW.id LIKE 'exercise\_missed\_%'
     OR NEW.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed')
     OR (TG_OP = 'UPDATE' AND (
         OLD.id LIKE 'habit\_award\_%' OR OLD.id LIKE 'bad\_habit\_%' OR OLD.id LIKE 'habit\_missed\_%'
         OR OLD.id LIKE 'workout\_award\_%' OR OLD.id LIKE 'exercise\_missed\_%'
         OR OLD.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                    'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                    'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed')))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_workout_points(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_workout_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workouts_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workouts_guard_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_entries_guard_server_owned() FROM PUBLIC, anon, authenticated;

-- Runs after workouts_guard_future, before workouts_keep_newer (name order).
CREATE TRIGGER workouts_guard_today BEFORE INSERT OR UPDATE ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.workouts_guard_today();

-- 6. Server rows from 2026-10-15 up to each user's today; the app's own rows for those days
--    are retired.
DO $$
DECLARE
  v_row record;
  v_tz text;
  v_day date;
BEGIN
  FOR v_row IN SELECT DISTINCT w.user_id FROM public.workouts w LOOP
    v_tz := public.ascend_user_timezone(v_row.user_id);
    v_day := DATE '2026-10-15';
    WHILE v_day <= (now() AT TIME ZONE v_tz)::date LOOP
      PERFORM public.ascend_recompute_workout_awards(v_row.user_id, v_day, v_tz);
      v_day := v_day + 1;
    END LOOP;
  END LOOP;
END $$;

CREATE TRIGGER workouts_award_points AFTER INSERT OR UPDATE ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.workouts_award_points();

COMMIT;
