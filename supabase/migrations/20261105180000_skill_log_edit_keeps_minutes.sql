-- Skill practice logs can be edited (Zakria's go 2026-11-05): minutes only on the log's own local
-- day, everything else (note, counts) any time. Points never change for an earlier day.
--
-- skill_logs_guard_today (as live after 20261105160000_reading_skill_late_day_logs.sql, re-read on
-- 2026-11-05 before this file) dropped every app UPDATE of a log not dated today, so a note or count
-- edit of an earlier day's log never reached the server. One branch is added; everything else is
-- the live body unchanged:
--   * an UPDATE of a live row that keeps its day (date), skill (skillId), minutes (durationMinutes)
--     and createdAt is accepted for any day. Minutes on an earlier day therefore stay locked on the
--     server too (a change of them is still dropped, as before), and so does moving a log to
--     another day or skill.
-- Points: skill points come from durationMinutes only (ascend_skill_session_points), which this
-- branch never lets change, so an earlier day's award cannot move. skill_logs_award_points still
-- recomputes today and (for a row dated yesterday) raises yesterday in floor mode only; with the
-- minutes unchanged that recompute gives the same amount. Counts never earn points.
-- Same-day edits (minutes included) pass the existing "today" branch, and today's award is
-- recomputed by the existing trigger exactly as for a new log.
-- Old app versions have no edit, so nothing changes for them.
--
-- Rollback: work/snapshots/skill-log-edit-2026-11-05/ROLLBACK.md (live body before this file).

BEGIN;

CREATE OR REPLACE FUNCTION public.skill_logs_guard_today()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_tz    text;
  v_day   date;
  v_today text;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- The writer's own timezone (profiles.timezone is no longer readable by the app's roles).
  v_tz := public.ascend_own_timezone(NEW.user_id);
  v_day := (now() AT TIME ZONE coalesce(v_tz, 'Asia/Karachi'))::date;
  v_today := to_char(v_day, 'YYYY-MM-DD');
  IF NEW.data->>'date' = v_today
     AND (TG_OP = 'INSERT' OR OLD.data->>'date' = v_today)
  THEN
    RETURN NEW;
  END IF;
  -- A new log of yesterday that reaches the server today (made offline before midnight). An upsert
  -- on an id that already exists runs the UPDATE check above next, so it stays refused.
  IF TG_OP = 'INSERT' AND NEW.data->>'date' = to_char(v_day - 1, 'YYYY-MM-DD') THEN
    RETURN NEW;
  END IF;
  -- An edit of an earlier day's log (note, counts): its day, skill, minutes and createdAt stay as
  -- they are, so its points cannot change (2026-11-05, skill log edit).
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL
     AND NEW.data->>'date' IS NOT DISTINCT FROM OLD.data->>'date'
     AND NEW.data->>'skillId' IS NOT DISTINCT FROM OLD.data->>'skillId'
     AND (NEW.data->'durationMinutes') IS NOT DISTINCT FROM (OLD.data->'durationMinutes')
     AND NEW.data->>'createdAt' IS NOT DISTINCT FROM OLD.data->>'createdAt'
  THEN
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.skill_logs_guard_today() FROM PUBLIC, anon, authenticated;

COMMIT;
