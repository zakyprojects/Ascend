-- Time audit fixes (knowledge/mode-a-time-audit-sql-2026-10-19.md T1-T5, T7; Hark's picks, Zakria approved).
-- Every function below is CREATE OR REPLACE from its LIVE definition (read 2026-10-19), changed only
-- where a T-number comment says so. Signatures are unchanged, so no old overload to drop; ACLs stay.
--   T1  ascend_recompute_{workout,skill,reading,focus,journal}_awards, ascend_recompute_time_tracker_award:
--       a day's award row keeps its first stamp; only the amount changes. A new (or re-created after
--       it was revoked) row is stamped at the day's FIRST earning log (journal: first entry with
--       content; time tracker: now(), the moment the score first earns), clamped to [day start, now()]
--       as before. Rows already written keep their current stamp. Mirrors: src/lib/*Awards.ts.
--   T2  guard_day_future: "future" = after the writer's own local today = the later of the local date
--       in profiles.timezone (fallback Asia/Karachi) and in a valid profiles.device_timezone (was UTC+14).
--       Now SECURITY DEFINER (it reads the writer's private profile columns); EXECUTE revoked from
--       the API roles (a trigger function needs no grant to fire).
--   T3  ascend_league_periods / ascend_league_points: weekly and monthly periods are half-open
--       [start, end) like seasons, so a row stamped exactly on a boundary counts in one period only.
--       Mirror: calculatePeriodPoints in src/lib/leagues.ts. Already-final archives are not rewritten.
--   T4  focus_logs.log_date / journal_entries.entry_date: the same future guard (guard_day_future) on
--       INSERT and on UPDATE when the date changes. Past dates stay allowed.
--   T5  shared_challenges_guard: status becomes 'expired' only when the last day has ended for BOTH
--       partners (the ascend_run_pact_expiry rule), so it no longer flips with the writer's zone.
--   T7  habits_award_points: an invalid profiles.timezone falls back to Asia/Karachi
--       (ascend_user_timezone) like every other award trigger.
-- Earlier days' points never drop: every recompute still runs for the local today only (plus the
-- time tracker's 02:00 grace day), and no existing row is re-stamped.
-- Run order: BEFORE the studio test (older app builds only see slightly different preview stamps).

BEGIN;

-- T1
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
  v_first     timestamptz;
  v_kept      text;
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
    v_used := v_used + least(v_item.points, greatest(v_cap - v_used, 0));
    IF v_first IS NULL AND v_used > 0 THEN
      v_first := coalesce(v_item.logged_at, now());
    END IF;
  END LOOP;

  IF v_used > 0 THEN
    -- T1: the day's row keeps the time it was first stamped (only the amount changes), so its points
    -- never move into a later league week, month or season; a new row is stamped at the first earning log.
    SELECT pe.data->>'timestamp' INTO v_kept
    FROM public.point_entries pe
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
    v_at := least(greatest(v_first, v_day_start), now());
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_used::int,
      'reason', 'Workouts logged (' || v_count || ')',
      'source', 'exercise',
      'timestamp', coalesce(v_kept, to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
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
  v_first     timestamptz;
  v_kept      text;
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
    v_used := v_used + least(v_item.points, greatest(v_cap - v_used, 0));
    IF v_first IS NULL AND v_used > 0 THEN
      v_first := coalesce(v_item.logged_at, now());
    END IF;
  END LOOP;

  IF v_used > 0 THEN
    -- T1: the day's row keeps the time it was first stamped (only the amount changes), so its points
    -- never move into a later league week, month or season; a new row is stamped at the first earning log.
    SELECT pe.data->>'timestamp' INTO v_kept
    FROM public.point_entries pe
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
    v_at := least(greatest(v_first, v_day_start), now());
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
  v_first     timestamptz;
  v_kept      text;
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
    v_used := v_used + least(v_item.points, greatest(v_cap - v_used, 0));
    IF v_first IS NULL AND v_used > 0 THEN
      v_first := coalesce(v_item.created_at, now());
    END IF;
  END LOOP;

  IF v_used > 0 THEN
    -- T1: the day's row keeps the time it was first stamped (only the amount changes), so its points
    -- never move into a later league week, month or season; a new row is stamped at the first earning log.
    SELECT pe.data->>'timestamp' INTO v_kept
    FROM public.point_entries pe
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
    v_at := least(greatest(v_first, v_day_start), now());
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_used,
      'reason', 'Focus sessions (' || v_count || ')',
      'source', 'focus',
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

CREATE OR REPLACE FUNCTION public.ascend_recompute_reading_awards(p_user uuid, p_day date, p_tz text)
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

  IF v_used > 0 THEN
    -- T1: the day's row keeps the time it was first stamped (only the amount changes), so its points
    -- never move into a later league week, month or season; a new row is stamped at the first earning log.
    SELECT pe.data->>'timestamp' INTO v_kept
    FROM public.point_entries pe
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
    v_at := least(greatest(v_first, v_day_start), now());
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

CREATE OR REPLACE FUNCTION public.ascend_recompute_journal_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_day_end   timestamptz := (p_day + 1)::timestamp AT TIME ZONE p_tz;
  v_points    int         := 2; -- JOURNAL_POINTS.entryCompleted
  v_id        text        := 'journal_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_written   timestamptz;
  v_at        timestamptz;
  v_kept      text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('journal_awards:' || p_user::text || ':' || v_key));

  -- The day's first live entry with content.
  SELECT min(j.created_at) INTO v_written
  FROM public.journal_entries j
  WHERE j.user_id = p_user
    AND j.deleted_at IS NULL
    AND j.entry_date = p_day
    -- Same whitespace as JavaScript's String.prototype.trim (journalEntryEarns).
    AND btrim(j.content, E' \t\n\r\u000B\f\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF') <> '';

  IF v_written IS NOT NULL THEN
    -- T1: the day's row keeps the time it was first stamped (only the amount changes), so its points
    -- never move into a later league week, month or season; a new row is stamped at the first entry with content.
    SELECT pe.data->>'timestamp' INTO v_kept
    FROM public.point_entries pe
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
    v_at := least(greatest(v_written, v_day_start), now());
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_points,
      'reason', 'Journal entry completed',
      'source', 'journal',
      'timestamp', coalesce(v_kept, to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      'metadata', jsonb_build_object('date', v_key)
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  ELSE
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
  END IF;

  -- The app-written journal rows (awards and deductions) of the day, from before this migration.
  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.id NOT LIKE 'journal\_award\_%'
    AND pe.data->>'source' = 'journal'
    AND public.ascend_instant(pe.data->>'timestamp') >= v_day_start
    AND public.ascend_instant(pe.data->>'timestamp') < v_day_end;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ascend_recompute_time_tracker_award(p_user uuid, p_day date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text := to_char(p_day, 'YYYY-MM-DD');
  v_id        text := 'time_tracker_' || to_char(p_day, 'YYYY-MM-DD');
  v_blocks    jsonb;
  v_total     integer := 0;
  v_skipped   integer := 0;
  v_completed integer := 0;
  v_excluded  integer := 0;
  v_denom     integer;
  v_points    integer := 0;
  v_percent   integer := 0;
  v_metadata  jsonb;
  v_current   jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('time_tracker_awards:' || p_user::text || ':' || v_key));

  SELECT d.data->'blocks' INTO v_blocks
  FROM public.time_tracker_days d
  WHERE d.user_id = p_user AND d.id = v_key AND d.deleted_at IS NULL;

  IF jsonb_typeof(v_blocks) = 'array' THEN
    SELECT count(*),
           count(*) FILTER (WHERE b->'skipped' = 'true'::jsonb),
           count(*) FILTER (WHERE b->'completed' = 'true'::jsonb)
    INTO v_total, v_skipped, v_completed
    FROM jsonb_array_elements(v_blocks) AS b;
  END IF;

  -- TIME_TRACKER_POINTS: up to 30% of skipped blocks (at most 3) leave the count on routines
  -- of more than 3 blocks; 80% done = 5 points, 50% = 3.
  IF v_total > 0 THEN
    IF v_total > 3 THEN
      v_excluded := least(v_skipped, least((3 * v_total) / 10, 3));
    END IF;
    v_denom := v_total - v_excluded;
    IF v_denom > 0 THEN
      v_points := CASE WHEN v_completed * 100 >= 80 * v_denom THEN 5
                       WHEN v_completed * 100 >= 50 * v_denom THEN 3
                       ELSE 0 END;
      v_percent := (200 * v_completed + v_denom) / (2 * v_denom);
    END IF;
  END IF;

  IF v_points > 0 THEN
    v_metadata := jsonb_build_object('date', v_key, 'percentage', v_percent, 'pointsAwarded', v_points);
    SELECT pe.data INTO v_current
    FROM public.point_entries pe
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
    -- The same score keeps its row as it is. T1: a changed score keeps the row's time too, so its
    -- points never move into a later league week, month or season; a new row is stamped now.
    IF v_current IS NOT NULL
       AND v_current->'amount' = to_jsonb(v_points)
       AND v_current->'metadata' = v_metadata THEN
      RETURN;
    END IF;
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_points,
      'reason', 'Time Tracker daily routine completed (' || v_percent || '%): ' || v_points || ' pts',
      'source', 'time_tracker',
      'timestamp', coalesce(v_current->>'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      'metadata', v_metadata
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at);
  ELSE
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
  END IF;
END;
$function$;

-- T3
CREATE OR REPLACE FUNCTION public.ascend_league_periods(p_now timestamp with time zone)
 RETURNS TABLE(period_id text, period_type text, score_start timestamp with time zone, period_end timestamp with time zone, inclusive_end boolean, period_label text, season_number integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  -- Calendar maths on UTC wall-clock timestamps, so the session time zone never matters.
  WITH weeks AS (
    SELECT s AT TIME ZONE 'UTC' AS s, (s + interval '7 days') AT TIME ZONE 'UTC' AS e
    FROM generate_series(
      date_trunc('week', public.ascend_season_epoch() AT TIME ZONE 'UTC'),
      p_now AT TIME ZONE 'UTC',
      interval '7 days') s
  ), months AS (
    SELECT s AT TIME ZONE 'UTC' AS s, (s + interval '1 month') AT TIME ZONE 'UTC' AS e
    FROM generate_series(
      date_trunc('month', public.ascend_season_epoch() AT TIME ZONE 'UTC'),
      p_now AT TIME ZONE 'UTC',
      interval '1 month') s
  ), seasons AS (
    SELECT n, public.ascend_season_begin(n) AS s, public.ascend_season_begin(n + 1) AS e
    FROM generate_series(1, least(
      (SELECT st.current_season FROM public.ascend_season_state st WHERE st.id),
      public.ascend_season_number(p_now)) - 1) n
  )
  SELECT 'W:' || to_char(s AT TIME ZONE 'UTC', 'IYYY') || '-W' || to_char(s AT TIME ZONE 'UTC', 'IW'),
         'weekly',
         greatest(s, public.ascend_season_start(e - interval '1 millisecond')),
         e, false,
         to_char(s AT TIME ZONE 'UTC', 'Mon FMDD') || ' – ' || to_char(e AT TIME ZONE 'UTC', 'Mon FMDD'),
         NULL::int
  FROM weeks WHERE e <= p_now
  UNION ALL
  SELECT 'M:' || to_char(s AT TIME ZONE 'UTC', 'YYYY-MM'),
         'monthly',
         greatest(s, public.ascend_season_start(e - interval '1 millisecond')),
         e, false,
         to_char(s AT TIME ZONE 'UTC', 'FMMonth YYYY'),
         NULL::int
  FROM months WHERE e <= p_now
  UNION ALL
  SELECT 'S:' || n,
         'ninetyDay',
         s, e, false,
         'Season ' || n || ' (' || to_char(s AT TIME ZONE 'UTC', 'Mon FMDD, YYYY') || ' – '
           || to_char(e AT TIME ZONE 'UTC', 'Mon FMDD, YYYY') || ')',
         n
  FROM seasons WHERE e <= p_now;
$function$;

CREATE OR REPLACE FUNCTION public.ascend_league_points(p_starts timestamp with time zone[], p_ends timestamp with time zone[])
 RETURNS TABLE(period integer, user_id uuid, points integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := coalesce(array_length(p_starts, 1), 0);
BEGIN
  IF v_count <> coalesce(array_length(p_ends, 1), 0) OR v_count > 40 THEN
    RAISE EXCEPTION 'ascend_league_points: give up to 40 matching start/end pairs';
  END IF;

  FOR i IN 1..v_count LOOP
    RETURN QUERY
    SELECT i, pp.user_id, pp.points
    FROM public.ascend_period_points(p_starts[i], p_ends[i], false) pp;
  END LOOP;
END;
$function$;

-- T5
CREATE OR REPLACE FUNCTION public.shared_challenges_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_user1 boolean;
  v_today    text;
  v_tz       text;
  v_own      text[];
  v_new_own  text[];
  v_u1       text[];
  v_u2       text[];
  v_total    integer;
  v_duration integer;
  v_user1    uuid;
  v_user2    uuid;
  v_tz1      text;
  v_tz2      text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.shared_challenges sc WHERE sc.id = NEW.id) THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.partnerships p
      WHERE p.id = NEW.partnership_id AND (p.user1_id = v_uid OR p.user2_id = v_uid)
    ) THEN
      RAISE EXCEPTION 'Unauthorized: You are not a member of this partnership.';
    END IF;
    NEW.created_at := now();
    NEW.user1_done_dates := '[]'::jsonb;
    NEW.user2_done_dates := '[]'::jsonb;
    NEW.user1_done_date := NULL;
    NEW.user2_done_date := NULL;
    NEW.joint_streak := 0;
    NEW.total_joint_days_completed := 0;
    NEW.status := 'active';
    RETURN NEW;
  END IF;

  SELECT (p.user1_id = v_uid), p.user1_id, p.user2_id INTO v_is_user1, v_user1, v_user2
  FROM public.partnerships p
  WHERE p.id = OLD.partnership_id AND (p.user1_id = v_uid OR p.user2_id = v_uid);
  IF v_is_user1 IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: You are not a member of this partnership.';
  END IF;

  NEW.id := OLD.id;
  NEW.partnership_id := OLD.partnership_id;
  NEW.created_at := OLD.created_at;
  NEW.title := OLD.title;
  NEW.target_habit_name := OLD.target_habit_name;
  NEW.duration_days := OLD.duration_days;
  NEW.user1_category := OLD.user1_category;
  NEW.user1_target := OLD.user1_target;
  NEW.user2_category := OLD.user2_category;
  NEW.user2_target := OLD.user2_target;

  v_tz := coalesce(public.ascend_own_timezone(v_uid), 'Asia/Karachi');
  v_today := to_char((now() AT TIME ZONE v_tz)::date, 'YYYY-MM-DD');

  IF v_is_user1 THEN
    v_own := public.ascend_pact_dates(OLD.user1_done_dates, OLD.user1_done_date);
    v_new_own := public.ascend_pact_dates(NEW.user1_done_dates, NULL);
  ELSE
    v_own := public.ascend_pact_dates(OLD.user2_done_dates, OLD.user2_done_date);
    v_new_own := public.ascend_pact_dates(NEW.user2_done_dates, NULL);
  END IF;
  v_own := array_remove(v_own, v_today);
  IF v_today = ANY (v_new_own) THEN
    v_own := v_own || v_today;
  END IF;
  SELECT coalesce(array_agg(d ORDER BY d), '{}'::text[]) INTO v_own FROM unnest(v_own) AS u(d);

  IF v_is_user1 THEN
    NEW.user1_done_dates := to_jsonb(v_own);
    NEW.user1_done_date := v_own[array_upper(v_own, 1)]::date;
    NEW.user2_done_dates := OLD.user2_done_dates;
    NEW.user2_done_date := OLD.user2_done_date;
  ELSE
    NEW.user2_done_dates := to_jsonb(v_own);
    NEW.user2_done_date := v_own[array_upper(v_own, 1)]::date;
    NEW.user1_done_dates := OLD.user1_done_dates;
    NEW.user1_done_date := OLD.user1_done_date;
  END IF;

  v_u1 := public.ascend_pact_dates(NEW.user1_done_dates, NEW.user1_done_date);
  v_u2 := public.ascend_pact_dates(NEW.user2_done_dates, NEW.user2_done_date);
  SELECT count(*) INTO v_total FROM (SELECT unnest(v_u1) INTERSECT SELECT unnest(v_u2)) j;
  v_duration := coalesce(NEW.duration_days, 7);
  -- Expired only once the last day has ended for BOTH partners, each in their own zone
  -- (the same rule as ascend_run_pact_expiry), never from the writer's zone alone.
  v_tz1 := public.ascend_user_timezone(v_user1);
  v_tz2 := public.ascend_user_timezone(v_user2);

  NEW.total_joint_days_completed := v_total;
  NEW.status := CASE
    WHEN v_total >= v_duration THEN 'completed'
    WHEN (now() AT TIME ZONE v_tz1)::date - (NEW.created_at AT TIME ZONE v_tz1)::date + 1 > v_duration
     AND (now() AT TIME ZONE v_tz2)::date - (NEW.created_at AT TIME ZONE v_tz2)::date + 1 > v_duration THEN 'expired'
    ELSE 'active'
  END;
  NEW.joint_streak := least(greatest(coalesce(NEW.joint_streak, 0), 0), v_total);
  RETURN NEW;
END;
$function$;

-- T2 + T4: future = after the writer's own local today.
CREATE OR REPLACE FUNCTION public.guard_day_future()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_device text;
  v_today  date;
  v_latest text;
  v_key    text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- The writer's own local today: the later of the profile day and the device day, so a user who
  -- just flew east is not refused while the timezone change is on its way. Later than that = future.
  SELECT tz.name INTO v_device
  FROM public.profiles pr
  JOIN pg_catalog.pg_timezone_names tz ON tz.name = pr.device_timezone
  WHERE pr.id = NEW.user_id;
  v_today := greatest((now() AT TIME ZONE public.ascend_user_timezone(NEW.user_id))::date,
                      (now() AT TIME ZONE v_device)::date);
  v_latest := to_char(v_today, 'YYYY-MM-DD');

  IF TG_TABLE_NAME = 'focus_logs' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.log_date IS NOT DISTINCT FROM OLD.log_date THEN
        RETURN NEW;
      END IF;
    END IF;
    IF NEW.log_date > v_today THEN
      RAISE EXCEPTION 'focus_logs row % is dated in the future (%)', NEW.id, NEW.log_date
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'journal_entries' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.entry_date IS NOT DISTINCT FROM OLD.entry_date THEN
        RETURN NEW;
      END IF;
    END IF;
    IF NEW.entry_date > v_today THEN
      RAISE EXCEPTION 'journal_entries row % is dated in the future (%)', NEW.id, NEW.entry_date
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'habits' THEN
    IF jsonb_typeof(NEW.data->'completions') = 'object' THEN
      FOR v_key IN SELECT jsonb_object_keys(NEW.data->'completions') LOOP
        IF v_key ~ '^\d{4}-\d{2}-\d{2}$' AND v_key > v_latest
          AND NOT (TG_OP = 'UPDATE' AND jsonb_typeof(OLD.data->'completions') = 'object' AND (OLD.data->'completions') ? v_key)
        THEN
          RAISE EXCEPTION 'habit % completion % is in the future', NEW.id, v_key
            USING ERRCODE = 'check_violation';
        END IF;
      END LOOP;
    ELSIF jsonb_typeof(NEW.data->'completions') = 'array' THEN
      FOR v_key IN SELECT jsonb_array_elements_text(NEW.data->'completions') LOOP
        IF v_key ~ '^\d{4}-\d{2}-\d{2}$' AND v_key > v_latest
          AND NOT (TG_OP = 'UPDATE' AND jsonb_typeof(OLD.data->'completions') = 'array' AND (OLD.data->'completions') ? v_key)
        THEN
          RAISE EXCEPTION 'habit % completion % is in the future', NEW.id, v_key
            USING ERRCODE = 'check_violation';
        END IF;
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  v_key := NEW.data->>'date';
  IF v_key ~ '^\d{4}-\d{2}-\d{2}' AND left(v_key, 10) > v_latest THEN
    RAISE EXCEPTION '% row % is dated in the future (%)', TG_TABLE_NAME, NEW.id, v_key
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_day_future() FROM PUBLIC, anon, authenticated;

-- T4: named so it fires after focus_logs_guard_date (which keeps an app's log_date change out) and
-- before *_keep_newer / *_stamp, like habits_guard_future.
DROP TRIGGER IF EXISTS focus_logs_guard_future ON public.focus_logs;
CREATE TRIGGER focus_logs_guard_future
  BEFORE INSERT OR UPDATE ON public.focus_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_day_future();

DROP TRIGGER IF EXISTS journal_entries_guard_future ON public.journal_entries;
CREATE TRIGGER journal_entries_guard_future
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_day_future();

-- T7: fall back to Asia/Karachi like the other award triggers.
CREATE OR REPLACE FUNCTION public.habits_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz text := public.ascend_user_timezone(NEW.user_id);
BEGIN
  PERFORM public.ascend_recompute_habit_awards(NEW.user_id, (now() AT TIME ZONE v_tz)::date, v_tz);
  RETURN NULL;
END;
$function$;

COMMIT;
