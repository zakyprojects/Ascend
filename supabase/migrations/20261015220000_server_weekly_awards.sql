-- Weekly goal and weekly reflection points from the server (knowledge/server-side-plan.md,
-- Part 2 #2, Option C module 9). The app used to write both to point_entries, so a console
-- write could claim any amount. Now the database writes them from the week's weekly_goals row:
--   * Goals: weekly_goal_<weekKey> = 5 points per achieved, non-archived goal, the first 3 by
--     completion time (calculateWeeklyGoalsPoints in src/lib/pointsConfig.ts), so at most 15.
--     Only the user's current and previous local week are (re)computed, as the app's sweep did
--     (reconcileWeeklyGoalsPointsForAllWeeks); weeks of a closed season and weeks starting
--     before 2026-10-01 (POINTS_V2_START_DATE_KEY) stay as they are. In the week a season
--     starts, the earlier season's row is frozen and the new season gets
--     weekly_goal_<weekKey>_s<N> = the week's total minus it (src/lib/weeklyGoalSeasons.ts).
--     A goal's achieved flag is the app's (a linked goal's progress is computed by the app;
--     manual goals are self-reported anyway); the cap bounds a false claim to 15 a week.
--   * Reflection Window (Zakria 2026-10-15): a week's reflection earns +5
--     (WEEKLY_REFLECTION_POINTS) once, when its row arrives between Friday 06:00 of that week and
--     the end of the following Monday, local time; removing the week's last reflection inside
--     the window takes it back (weekly_review_rev_<weekKey>). Outside the window nothing changes,
--     so a reflection added to an old week earns nothing. Old reflection rows (some 20) stay.
--   * The app can no longer write either (sources weekly_goal_achieved and weekly_review, ids
--     weekly_goal_ and weekly_review_).
-- Week keys are the app's own (weekKey / getWeekDates in src/lib/dates.ts), not ISO weeks.
-- src/lib/weeklyAwards.ts and the weekly goal code in src/lib/store.ts mirror this file.

BEGIN;

-- 1. The app's week key of a local day (weekKey in dates.ts; change both together).
CREATE OR REPLACE FUNCTION public.ascend_week_key(p_day date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  WITH m AS (SELECT p_day - (extract(isodow FROM p_day)::int - 1) AS monday),
       j AS (SELECT monday, make_date(extract(year FROM monday)::int, 1, 1) AS jan1 FROM m)
  SELECT extract(year FROM monday)::int || '-W' ||
         lpad(ceil(((monday - jan1) + extract(dow FROM jan1)::int + 1) / 7.0)::int::text, 2, '0')
  FROM j;
$function$;

-- 2. The Monday a week key starts on (getWeekDates in dates.ts), null for a malformed key.
CREATE OR REPLACE FUNCTION public.ascend_week_start(p_key text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_match text[] := regexp_match(coalesce(p_key, ''), '^(\d{4})-W(\d{2})$');
  v_jan1  date;
  v_dow   int;
  v_base  date;
BEGIN
  IF v_match IS NULL THEN
    RETURN NULL;
  END IF;
  v_jan1 := make_date(v_match[1]::int, 1, 1);
  v_dow := extract(dow FROM v_jan1)::int;
  v_base := v_jan1 + (CASE WHEN v_dow = 0 THEN 1 ELSE 1 - v_dow END) + (v_match[2]::int - 1) * 7;
  RETURN v_base - (extract(isodow FROM v_base)::int - 1);
END;
$function$;

-- 3. The start instant of the season containing p_at (getSeasonStart in leagueTime.ts).
CREATE OR REPLACE FUNCTION public.ascend_season_start(p_at timestamptz)
 RETURNS timestamptz
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT timestamptz '2026-08-01 00:00:00+00' + interval '90 days' *
         greatest(0, floor(extract(epoch FROM p_at - timestamptz '2026-08-01 00:00:00+00') / 7776000));
$function$;

-- 4. A goal's completion instant for ordering (getWeeklyGoalCompletionTime in pointsConfig.ts).
CREATE OR REPLACE FUNCTION public.ascend_goal_completion_time(p_goal jsonb)
 RETURNS timestamptz
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN coalesce(p_goal->>'completedAt', '') <> '' THEN public.ascend_instant(p_goal->>'completedAt')
    WHEN coalesce(p_goal->>'createdAt', '') <> '' THEN public.ascend_instant(p_goal->>'createdAt')
    ELSE timestamptz '1970-01-01 00:00:00+00'
  END;
$function$;

-- 5. One week's goal points row(s), recomputed from the week's goals.
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
    v_reason := 'Weekly goals achieved for ' || p_week || ', Season ' || v_season || ' (' || v_points || ' pts)';
    v_metadata := jsonb_build_object('weekKey', p_week, 'seasonNumber', v_season,
                                     'countedGoalsCount', v_counted, 'completedGoalsCount', v_completed);
  ELSE
    v_id := v_base_id;
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
    v_ts := coalesce(v_existing->>'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
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

-- 6. One week's reflection award, inside its Reflection Window only.
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
  ELSIF NOT v_has AND v_net > 0 THEN
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

-- 7. A week row change recomputes that week: goals when it is the current or previous local
--    week, the reflection when its window is open.
CREATE OR REPLACE FUNCTION public.weekly_goals_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz    text := public.ascend_user_timezone(NEW.user_id);
  v_today date := (now() AT TIME ZONE v_tz)::date;
BEGIN
  IF NEW.id IN (public.ascend_week_key(v_today), public.ascend_week_key(v_today - 7)) THEN
    PERFORM public.ascend_recompute_weekly_goal_awards(NEW.user_id, NEW.id, v_tz);
  END IF;
  PERFORM public.ascend_recompute_weekly_reflection_award(NEW.user_id, NEW.id, v_tz);
  RETURN NULL;
END;
$function$;

-- 8. Only the server writes habit awards, bad-habit points, workout points, skill points,
--    reading points, journal points, focus points, lesson points, weekly goal and reflection
--    points and missed-habit and missed-workout penalties (20261015210000 plus the weekly lines).
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
     OR NEW.id LIKE 'workout\_award\_%' OR NEW.id LIKE 'exercise\_missed\_%' OR NEW.id LIKE 'skill\_award\_%'
     OR NEW.id LIKE 'reading\_award\_%' OR NEW.id LIKE 'reading\_bonus\_%' OR NEW.id LIKE 'journal\_award\_%'
     OR NEW.id LIKE 'focus\_award\_%'
     OR NEW.id LIKE 'lesson\_award\_%'
     OR NEW.id LIKE 'weekly\_goal\_%' OR NEW.id LIKE 'weekly\_review\_%'
     OR NEW.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                'reading', 'reading_bonus', 'journal', 'focus', 'lesson',
                                'weekly_goal_achieved', 'weekly_review')
     OR (TG_OP = 'UPDATE' AND (
         OLD.id LIKE 'habit\_award\_%' OR OLD.id LIKE 'bad\_habit\_%' OR OLD.id LIKE 'habit\_missed\_%'
         OR OLD.id LIKE 'workout\_award\_%' OR OLD.id LIKE 'exercise\_missed\_%' OR OLD.id LIKE 'skill\_award\_%'
         OR OLD.id LIKE 'reading\_award\_%' OR OLD.id LIKE 'reading\_bonus\_%' OR OLD.id LIKE 'journal\_award\_%'
         OR OLD.id LIKE 'focus\_award\_%'
         OR OLD.id LIKE 'lesson\_award\_%'
         OR OLD.id LIKE 'weekly\_goal\_%' OR OLD.id LIKE 'weekly\_review\_%'
         OR OLD.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                    'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                    'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                    'reading', 'reading_bonus', 'journal', 'focus', 'lesson',
                                    'weekly_goal_achieved', 'weekly_review')))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_week_key(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_week_start(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_season_start(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_goal_completion_time(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_weekly_goal_awards(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_weekly_reflection_award(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.weekly_goals_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_entries_guard_server_owned() FROM PUBLIC, anon, authenticated;

-- 9. Goal rows of every user's current and previous week, as the app's sweep would leave them.
--    Reflections are not backfilled (Zakria 2026-10-15): they earn only inside their window.
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

CREATE TRIGGER weekly_goals_award_points AFTER INSERT OR UPDATE ON public.weekly_goals
  FOR EACH ROW EXECUTE FUNCTION public.weekly_goals_award_points();

COMMIT;
