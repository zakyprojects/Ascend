-- Reading and skill logs made YESTERDAY (local) that first reach the server today are kept and earn
-- on yesterday (fix 8 / sim l1 of knowledge/mode-a-sync-remaining-2026-11-05.md; Zakria's go
-- 2026-11-05: option A incl. SQL and points, "kisi ki mehnat kharab ni jaani chahiye").
-- Same rule as the focus late-day rule (20261104160000_focus_late_day_points.sql).
--
-- Why: reading_logs_guard_today / skill_logs_guard_today dropped (RETURN NULL, silently) every app
-- write whose data.date was not today in the writer's timezone. A log made at 23:50 on a phone that
-- was offline (or asleep) until after midnight never reached the server: the book's progress row
-- was accepted, the log and that day's points were not, and the log stayed on one device only.
--
-- What changes:
--   * Guards (app roles only, as before): a NEW row (INSERT with no existing row) dated exactly
--     yesterday is accepted. Everything else is exactly as before: today's rows as before; an
--     update of an existing row (including the UPDATE step of an upsert on an existing id) still
--     needs both the old and the new date to be today, so a yesterday row already on the server
--     cannot be edited; rows dated two or more days ago, or in the future, are still dropped.
--     Deletes (deleted_at set) pass as before.
--   * Awards: ascend_recompute_reading_awards / ascend_recompute_skill_awards get a p_floor variant
--     (4 args). The 3-arg functions keep their name and behaviour (they call the 4-arg one with
--     false). In floor mode the day only goes up: when the recomputed amount is not above the live
--     award row's amount nothing changes, and app-written legacy rows of that day are not retired.
--     The daily cap (10 for each module) is the same, computed across all the day's logs.
--   * reading_award_points / skill_logs_award_points (AFTER triggers) still recompute today exactly
--     as before, and then raise yesterday in floor mode when
--       - the row is a live reading/skill log dated yesterday (a late log), or
--       - the row is a NEW book/skill (INSERT) that has live logs dated yesterday (a book or skill
--         created offline yesterday whose logs reached the server before it).
--     Window and archive safety exactly as focus: yesterday only, and skipped once yesterday's start
--     is 48 h or more in the past (DST days; never in Asia/Karachi), so a final league archive period
--     never changes.
--   * A new award row of yesterday is stamped at the day's first earning log, clamped inside that day
--     (never after its last millisecond); an existing row keeps its time.
-- Other modules with a "guard today" trigger (workouts_guard_today, bad_habit_logs_guard_today) have
-- their own functions and are not touched. Old app versions: they upload the same rows; they now get
-- the late log stored too. No grants are added: EXECUTE is revoked from PUBLIC/anon/authenticated on
-- every function here.
--
-- Rollback: work/snapshots/fix8-late-day-2026-11-05/ROLLBACK.md.

BEGIN;

CREATE OR REPLACE FUNCTION public.reading_logs_guard_today()
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
  RETURN NULL;
END;
$function$;

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
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ascend_recompute_reading_awards(p_user uuid, p_day date, p_tz text, p_floor boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_day_end   timestamptz := (p_day + 1)::timestamp AT TIME ZONE p_tz;
  v_pages     numeric     := 0;
  v_count     int         := 0;
  v_used      int;
  v_first     timestamptz;
  v_kept      text;
  v_kept_amt  numeric;
  v_at        timestamptz;
  v_id        text        := 'reading_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_item      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('reading_awards:' || p_user::text || ':' || v_key));

  FOR v_item IN
    SELECT public.ascend_reading_log_pages(l.data)
             * CASE WHEN lower(b.data->>'unit') = 'chapters' THEN 20 ELSE 1 END AS pages,
           public.ascend_instant(l.data->>'createdAt') AS logged_at
    FROM public.reading_logs l
    JOIN public.reading_books b
      ON b.user_id = l.user_id AND b.id = l.data->>'bookId' AND b.deleted_at IS NULL
    WHERE l.user_id = p_user
      AND l.deleted_at IS NULL
      AND l.data->>'date' = v_key
      AND (l.data->>'finish') IS DISTINCT FROM 'true'
    ORDER BY 2 NULLS LAST, l.id COLLATE "C"
  LOOP
    v_count := v_count + 1;
    v_pages := v_pages + v_item.pages;
    IF v_first IS NULL AND least(floor(v_pages / 2), 10) > 0 THEN
      v_first := coalesce(v_item.logged_at, now());
    END IF;
  END LOOP;

  v_used := least(floor(v_pages / 2), 10)::int;

  SELECT pe.data->>'timestamp',
         CASE WHEN jsonb_typeof(pe.data->'amount') = 'number' THEN (pe.data->>'amount')::numeric END
  INTO v_kept, v_kept_amt
  FROM public.point_entries pe
  WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;

  IF p_floor AND v_used <= coalesce(v_kept_amt, 0) THEN
    RETURN; -- an earlier day never drops
  END IF;

  IF v_used > 0 THEN
    v_at := least(greatest(v_first, v_day_start), now(), v_day_end - interval '1 millisecond');
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_used,
      'reason', 'Pages logged (' || v_count || ')',
      'source', 'reading',
      'timestamp', coalesce(v_kept, to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      'metadata', jsonb_build_object('date', v_key, 'logs', v_count)
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  ELSE
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
  END IF;

  IF p_floor THEN
    RETURN; -- never takes anything away from an earlier day
  END IF;

  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.id NOT LIKE 'reading\_award\_%'
    AND pe.id NOT LIKE 'reading\_bonus\_%'
    AND pe.data->>'source' IN ('reading', 'reading_bonus')
    AND jsonb_typeof(pe.data->'amount') = 'number'
    AND (pe.data->>'amount')::numeric > 0
    AND public.ascend_instant(pe.data->>'timestamp') >= v_day_start
    AND public.ascend_instant(pe.data->>'timestamp') < v_day_end;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ascend_recompute_reading_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.ascend_recompute_reading_awards(p_user, p_day, p_tz, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ascend_recompute_skill_awards(p_user uuid, p_day date, p_tz text, p_floor boolean)
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
  v_first     timestamptz;
  v_kept      text;
  v_kept_amt  numeric;
  v_at        timestamptz;
  v_id        text        := 'skill_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_item      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('skill_awards:' || p_user::text || ':' || v_key));

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
    v_used := v_used + least(v_item.points, greatest(v_cap - v_used, 0));
    IF v_first IS NULL AND v_used > 0 THEN
      v_first := coalesce(v_item.logged_at, now());
    END IF;
  END LOOP;

  SELECT pe.data->>'timestamp',
         CASE WHEN jsonb_typeof(pe.data->'amount') = 'number' THEN (pe.data->>'amount')::numeric END
  INTO v_kept, v_kept_amt
  FROM public.point_entries pe
  WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;

  IF p_floor AND v_used <= coalesce(v_kept_amt, 0) THEN
    RETURN; -- an earlier day never drops
  END IF;

  IF v_used > 0 THEN
    v_at := least(greatest(v_first, v_day_start), now(), v_day_end - interval '1 millisecond');
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_used::int,
      'reason', 'Skill practice (' || v_count || ')',
      'source', 'skill',
      'timestamp', coalesce(v_kept, to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
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

  IF p_floor THEN
    RETURN; -- never takes anything away from an earlier day
  END IF;

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

CREATE OR REPLACE FUNCTION public.ascend_recompute_skill_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.ascend_recompute_skill_awards(p_user, p_day, p_tz, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reading_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz    text := public.ascend_user_timezone(NEW.user_id);
  v_today date := (now() AT TIME ZONE v_tz)::date;
  v_yday  text := to_char(v_today - 1, 'YYYY-MM-DD');
BEGIN
  PERFORM public.ascend_recompute_reading_awards(NEW.user_id, v_today, v_tz);
  -- Yesterday only goes up: a late log of yesterday, or a new book whose yesterday logs came first.
  IF NEW.deleted_at IS NULL
     AND ((v_today - 1)::timestamp AT TIME ZONE v_tz) > now() - interval '48 hours'
     AND ((TG_TABLE_NAME = 'reading_logs' AND NEW.data->>'date' = v_yday)
          OR (TG_TABLE_NAME = 'reading_books' AND TG_OP = 'INSERT'
              AND EXISTS (SELECT 1 FROM public.reading_logs l
                          WHERE l.user_id = NEW.user_id AND l.deleted_at IS NULL
                            AND l.data->>'bookId' = NEW.id AND l.data->>'date' = v_yday)))
  THEN
    PERFORM public.ascend_recompute_reading_awards(NEW.user_id, v_today - 1, v_tz, true);
  END IF;
  PERFORM public.ascend_recompute_reading_bonus(
    NEW.user_id,
    CASE WHEN TG_TABLE_NAME = 'reading_books' THEN NEW.id ELSE NEW.data->>'bookId' END,
    v_today
  );
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.skill_logs_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz    text := public.ascend_user_timezone(NEW.user_id);
  v_today date := (now() AT TIME ZONE v_tz)::date;
  v_yday  text := to_char(v_today - 1, 'YYYY-MM-DD');
BEGIN
  PERFORM public.ascend_recompute_skill_awards(NEW.user_id, v_today, v_tz);
  -- Yesterday only goes up: a late session of yesterday, or a new skill whose yesterday sessions came first.
  IF NEW.deleted_at IS NULL
     AND ((v_today - 1)::timestamp AT TIME ZONE v_tz) > now() - interval '48 hours'
     AND ((TG_TABLE_NAME = 'skill_logs' AND NEW.data->>'date' = v_yday)
          OR (TG_TABLE_NAME = 'skills' AND TG_OP = 'INSERT'
              AND EXISTS (SELECT 1 FROM public.skill_logs l
                          WHERE l.user_id = NEW.user_id AND l.deleted_at IS NULL
                            AND l.data->>'skillId' = NEW.id AND l.data->>'date' = v_yday)))
  THEN
    PERFORM public.ascend_recompute_skill_awards(NEW.user_id, v_today - 1, v_tz, true);
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.reading_logs_guard_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.skill_logs_guard_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_reading_awards(uuid, date, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_reading_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_skill_awards(uuid, date, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_skill_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reading_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.skill_logs_award_points() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_recompute_reading_awards(uuid, date, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.ascend_recompute_skill_awards(uuid, date, text, boolean) TO service_role;

-- No backfill: logs that were dropped before this file are not on the server (only on the device
-- that made them) and keep their old outcome.

COMMIT;
