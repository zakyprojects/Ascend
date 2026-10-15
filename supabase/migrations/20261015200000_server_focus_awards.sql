-- Focus points from the server (knowledge/server-side-plan.md, Part 2 #2, Option C module 7)
-- The app used to write its own focus points to point_entries, so a console write could claim
-- any amount. Now:
--   * The database writes one row per local day, id focus_award_<YYYY-MM-DD>: the day's focus
--     sessions' tiered points (calculateFocusPoints in src/lib/pointsConfig.ts: 25 minutes = 2,
--     50 = 5, 90 = 10) up to the daily cap of 10, in log order. Only the user's current local day
--     is (re)computed, so deleting an earlier day's session keeps that day's points (Zakria
--     2026-10-15, as for the journal).
--   * Sessions of any day may still be written, so a session saved late from offline keeps its
--     reflection; it just earns nothing.
--   * The app can no longer write focus points (source focus, focus_award_ ids).
-- Known limit: the session length comes from the app's timer; the cap bounds a false claim to
-- 10 points a day.
-- Point values and the cap are unchanged. Older app-written rows stay as they are; the app's
-- own focus rows of a day the server recomputes (from 2026-10-15, FOCUS_AWARDS_SERVER_SINCE in
-- src/lib/focusAwards.ts) are replaced by the server's row (live check 2026-10-15 19:40: 3 rows).
-- src/lib/focusAwards.ts must stay identical to ascend_recompute_focus_awards.

BEGIN;

-- 1. Raw points of one focus session (calculateFocusPoints; change both together).
CREATE OR REPLACE FUNCTION public.ascend_focus_session_points(p_minutes integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN p_minutes >= 90 THEN 10
              WHEN p_minutes >= 50 THEN 5
              WHEN p_minutes >= 25 THEN 2
              ELSE 0 END; -- PFC_POINTS.focus.tiers
$function$;

-- 2. The award row of one user's local day, recomputed from the day's sessions.
CREATE OR REPLACE FUNCTION public.ascend_recompute_focus_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_day_end   timestamptz := (p_day + 1)::timestamp AT TIME ZONE p_tz;
  v_cap       integer     := 10; -- PFC_POINTS.focus.dailyCap
  v_used      integer     := 0;
  v_count     int         := 0;
  v_last      timestamptz;
  v_at        timestamptz;
  v_id        text        := 'focus_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_item      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('focus_awards:' || p_user::text || ':' || v_key));

  -- The day's sessions share the cap in log order.
  FOR v_item IN
    SELECT public.ascend_focus_session_points(f.duration_minutes) AS points, f.created_at
    FROM public.focus_logs f
    WHERE f.user_id = p_user
      AND f.deleted_at IS NULL
      AND f.log_date = p_day
    ORDER BY f.created_at, f.id COLLATE "C"
  LOOP
    v_count := v_count + 1;
    v_last := v_item.created_at;
    v_used := v_used + least(v_item.points, greatest(v_cap - v_used, 0));
  END LOOP;

  IF v_used > 0 THEN
    v_at := least(greatest(coalesce(v_last, now()), v_day_start), now());
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_used,
      'reason', 'Focus sessions (' || v_count || ')',
      'source', 'focus',
      'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', jsonb_build_object('date', v_key, 'sessions', v_count)
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  ELSE
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
  END IF;

  -- The app-written focus rows (awards and delete deltas) of the day, from before this migration.
  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.id NOT LIKE 'focus\_award\_%'
    AND pe.data->>'source' = 'focus'
    AND public.ascend_instant(pe.data->>'timestamp') >= v_day_start
    AND public.ascend_instant(pe.data->>'timestamp') < v_day_end;
END;
$function$;

-- 3. Any session change recomputes the owner's current local day.
CREATE OR REPLACE FUNCTION public.focus_logs_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz text := public.ascend_user_timezone(NEW.user_id);
BEGIN
  PERFORM public.ascend_recompute_focus_awards(NEW.user_id, (now() AT TIME ZONE v_tz)::date, v_tz);
  RETURN NULL;
END;
$function$;

-- 4. Only the server writes habit awards, bad-habit points, workout points, skill points,
--    reading points, journal points, focus points and missed-habit and missed-workout penalties
--    (20261015190000 plus the focus lines).
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
     OR NEW.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                'reading', 'reading_bonus', 'journal', 'focus')
     OR (TG_OP = 'UPDATE' AND (
         OLD.id LIKE 'habit\_award\_%' OR OLD.id LIKE 'bad\_habit\_%' OR OLD.id LIKE 'habit\_missed\_%'
         OR OLD.id LIKE 'workout\_award\_%' OR OLD.id LIKE 'exercise\_missed\_%' OR OLD.id LIKE 'skill\_award\_%'
         OR OLD.id LIKE 'reading\_award\_%' OR OLD.id LIKE 'reading\_bonus\_%' OR OLD.id LIKE 'journal\_award\_%'
         OR OLD.id LIKE 'focus\_award\_%'
         OR OLD.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                    'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                    'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                    'reading', 'reading_bonus', 'journal', 'focus')))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_focus_session_points(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_focus_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.focus_logs_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_entries_guard_server_owned() FROM PUBLIC, anon, authenticated;

-- 5. Server rows from 2026-10-15 up to each user's today; the app's own rows for those days
--    are retired.
DO $$
DECLARE
  v_row record;
  v_tz text;
  v_day date;
BEGIN
  FOR v_row IN
    SELECT DISTINCT f.user_id FROM public.focus_logs f
    UNION
    SELECT DISTINCT pe.user_id FROM public.point_entries pe WHERE pe.data->>'source' = 'focus'
  LOOP
    v_tz := public.ascend_user_timezone(v_row.user_id);
    v_day := DATE '2026-10-15';
    WHILE v_day <= (now() AT TIME ZONE v_tz)::date LOOP
      PERFORM public.ascend_recompute_focus_awards(v_row.user_id, v_day, v_tz);
      v_day := v_day + 1;
    END LOOP;
  END LOOP;
END $$;

CREATE TRIGGER focus_logs_award_points AFTER INSERT OR UPDATE ON public.focus_logs
  FOR EACH ROW EXECUTE FUNCTION public.focus_logs_award_points();

COMMIT;
