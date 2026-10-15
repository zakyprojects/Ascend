-- Skill practice points from the server (knowledge/server-side-plan.md, Part 2 #2, Option C module 4)
-- The app used to write its own skill points to point_entries, so a console write could claim
-- any amount. Now:
--   * The database writes one row per local day, id skill_award_<YYYY-MM-DD>: the day's
--     practice sessions' points (calculateSkillPoints in src/lib/pointsConfig.ts: 12 minutes =
--     1 point) up to the daily cap of 10. Only sessions whose skill still exists count. Only the
--     user's current local day is (re)computed, so deleting an earlier day's session or a skill
--     keeps the earlier days' points (Zakria 2026-10-15).
--   * The app writes practice sessions only for today; deleting a session of any day is still
--     allowed. Other app writes to skill_logs are skipped silently, so a queued write never
--     blocks the outbox. Skills themselves stay free to add, edit and delete.
--   * The app can no longer write skill points (source skill, skill_award_ ids).
-- Point values and the cap are unchanged. Older app-written rows stay as they are; the app's
-- "Skill practiced" rows from 2026-10-15 (SKILL_AWARDS_SERVER_SINCE in src/lib/skillAwards.ts)
-- are replaced by the server's row (live check 2026-10-15: there are none).
-- src/lib/skillAwards.ts must stay identical to ascend_recompute_skill_awards.

BEGIN;

-- 1. Raw points of one practice session (calculateSkillPoints; change both together).
CREATE OR REPLACE FUNCTION public.ascend_skill_session_points(p_log jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT floor(CASE WHEN jsonb_typeof(p_log->'durationMinutes') = 'number'
                    THEN greatest((p_log->>'durationMinutes')::numeric, 0) ELSE 0 END / 12); -- minutesPerPoint
$function$;

-- 2. The award row of one user's local day, recomputed from the day's sessions.
CREATE OR REPLACE FUNCTION public.ascend_recompute_skill_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_day_end   timestamptz := (p_day + 1)::timestamp AT TIME ZONE p_tz;
  v_cap       numeric     := 10; -- SKILLS_POINTS.dailyCap
  v_used      numeric     := 0;
  v_count     int         := 0;
  v_last      timestamptz;
  v_at        timestamptz;
  v_id        text        := 'skill_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_item      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('skill_awards:' || p_user::text || ':' || v_key));

  -- The day's sessions of existing skills share the cap in log order.
  FOR v_item IN
    SELECT public.ascend_skill_session_points(l.data) AS points,
           public.ascend_instant(l.data->>'createdAt') AS logged_at
    FROM public.skill_logs l
    WHERE l.user_id = p_user
      AND l.deleted_at IS NULL
      AND l.data->>'date' = v_key
      AND EXISTS (
        SELECT 1 FROM public.skills s
        WHERE s.user_id = p_user AND s.id = l.data->>'skillId' AND s.deleted_at IS NULL
      )
    ORDER BY 2 NULLS LAST, l.id COLLATE "C"
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
      'reason', 'Skill practice (' || v_count || ')',
      'source', 'skill',
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

  -- The app-written "Skill practiced" rows of the day (before this migration).
  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.id NOT LIKE 'skill\_award\_%'
    AND pe.data->>'source' = 'skill'
    AND jsonb_typeof(pe.data->'amount') = 'number'
    AND (pe.data->>'amount')::numeric > 0
    AND public.ascend_instant(pe.data->>'timestamp') >= v_day_start
    AND public.ascend_instant(pe.data->>'timestamp') < v_day_end;
END;
$function$;

-- 3. Any session or skill change recomputes the owner's current local day.
CREATE OR REPLACE FUNCTION public.skill_logs_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz text := public.ascend_user_timezone(NEW.user_id);
BEGIN
  PERFORM public.ascend_recompute_skill_awards(NEW.user_id, (now() AT TIME ZONE v_tz)::date, v_tz);
  RETURN NULL;
END;
$function$;

-- 4. The app writes sessions only for today, and may delete a session of any day.
CREATE OR REPLACE FUNCTION public.skill_logs_guard_today()
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

-- 5. Only the server writes habit awards, bad-habit points, workout points, skill points and
--    missed-habit and missed-workout penalties (20261015140000 plus the skill lines).
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
     OR NEW.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill')
     OR (TG_OP = 'UPDATE' AND (
         OLD.id LIKE 'habit\_award\_%' OR OLD.id LIKE 'bad\_habit\_%' OR OLD.id LIKE 'habit\_missed\_%'
         OR OLD.id LIKE 'workout\_award\_%' OR OLD.id LIKE 'exercise\_missed\_%' OR OLD.id LIKE 'skill\_award\_%'
         OR OLD.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                    'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                    'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill')))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_skill_session_points(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_skill_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.skill_logs_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.skill_logs_guard_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_entries_guard_server_owned() FROM PUBLIC, anon, authenticated;

-- Runs before skill_logs_keep_newer (name order).
CREATE TRIGGER skill_logs_guard_today BEFORE INSERT OR UPDATE ON public.skill_logs
  FOR EACH ROW EXECUTE FUNCTION public.skill_logs_guard_today();

-- 6. Server rows from 2026-10-15 up to each user's today; the app's own rows for those days
--    are retired.
DO $$
DECLARE
  v_row record;
  v_tz text;
  v_day date;
BEGIN
  FOR v_row IN SELECT DISTINCT l.user_id FROM public.skill_logs l LOOP
    v_tz := public.ascend_user_timezone(v_row.user_id);
    v_day := DATE '2026-10-15';
    WHILE v_day <= (now() AT TIME ZONE v_tz)::date LOOP
      PERFORM public.ascend_recompute_skill_awards(v_row.user_id, v_day, v_tz);
      v_day := v_day + 1;
    END LOOP;
  END LOOP;
END $$;

CREATE TRIGGER skill_logs_award_points AFTER INSERT OR UPDATE ON public.skill_logs
  FOR EACH ROW EXECUTE FUNCTION public.skill_logs_award_points();
CREATE TRIGGER skills_award_points AFTER INSERT OR UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.skill_logs_award_points();

COMMIT;
