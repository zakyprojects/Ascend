-- Profile, habit/journal/focus/workout writes and the timezone crons stop scanning the tz database
-- (scaling A1-A3, knowledge/mode-a-profile-tz-blob-2026-10-20.md).
--
-- A1. pg_catalog.pg_timezone_names is a set-returning function that reads the whole tz directory
--     from disk on every call (measured live: ~75 ms warm, ~750 ms cold, 1,196 rows); no index can
--     serve it. App SQL called it 1-3 times per row write. public.ascend_timezones holds the same
--     names, filled once from pg_timezone_names, and every app function that read the view now reads
--     the table: ascend_is_timezone (used by profiles_guard_timezone and
--     ascend_apply_waiting_timezones), ascend_user_timezone (used by guard_day_future,
--     ascend_partner_timezones and the award functions), ascend_own_timezone, guard_day_future,
--     ascend_run_due_penalties, ascend_run_local_reminders. Only the source of the lookup changes:
--     exact, case-sensitive name equality against the same 1,196 names, so the same names are
--     accepted and rejected. No function read utc_offset; local times are still computed with
--     now() AT TIME ZONE name, never a stored offset.
--     The table must track tzdata: after a Postgres upgrade re-run
--       INSERT INTO public.ascend_timezones (name) SELECT name FROM pg_catalog.pg_timezone_names
--       ON CONFLICT DO NOTHING;
--     (work/verify-a-tz-profile.sql V1 shows any drift).
--     Read access: ascend_is_timezone is SECURITY INVOKER and runs as anon/authenticated inside
--     profiles_guard_timezone, so those roles get SELECT (RLS on, one read-all policy; the names are
--     public tzdata). No write grants.
--
-- A2. profiles_derive_season_points recomputed season_points and the whole season_history from
--     point_entries on every profile write, including the app's every-save writes of stats and
--     settings that cannot move the score. Now a direct client UPDATE (auth.role() anon/authenticated,
--     pg_trigger_depth() = 1, season_id unchanged) keeps the stored values (OLD), which also still
--     overrides any client-sent season_points/total_points/season_history. Everything that can change
--     the score still recomputes:
--       - point_entries INSERT/UPDATE: the statement trigger point_entries_refresh_season_points
--         touches the profile, which fires this trigger at depth >= 2;
--       - season rollover (hourly cron, no JWT role) and the penalty cron;
--       - a client save carrying a new season_id (the app moves season_id at the season boundary),
--         so the boundary is not left waiting for the rollover cron;
--       - INSERT (sign-up), service_role and postgres writes.
--
-- A3. profiles_guard_timezone validated NEW.device_timezone on every client write even when it was
--     unchanged. The check now runs only on INSERT or when the value changed. Same result: for an
--     unchanged value the old code's fallback was OLD.device_timezone, i.e. the same value.
--
-- Same signatures, volatility, SECURITY DEFINER/INVOKER and pinned search_path ('') as live; CREATE
-- OR REPLACE keeps every grant. Shared database: the production and studio apps both keep working
-- unchanged (no client change is needed for this file).
--
-- Locks: CREATE TABLE plus CREATE OR REPLACE FUNCTION only; no table rewrite, no lock on profiles,
-- habits or point_entries beyond the catalog rows. Replacing a trigger function takes effect for the
-- next statement. lock_timeout stops it queueing behind a long catalog lock.
--
-- Rollback: re-run the nine live definitions saved before this file
-- (work/snapshots/tz-profile-functions-before-2026-10-20.sql, outside the repo; the same bodies are in
-- 20261016120000_timezone_guard.sql, 20261019220300_revoke_excess_grants.sql,
-- 20261015130000_server_bad_habit_awards.sql, 20261015000000_server_side_penalties.sql,
-- 20261017080000_web_push.sql, 20261019180000_time_audit_fixes.sql,
-- 20261016170000_stop_publishing_points_history.sql), then DROP TABLE public.ascend_timezones;
-- (the functions must be restored first: they reference the table).

BEGIN;

SET LOCAL lock_timeout = '5s';

-- A1 ------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ascend_timezones (
  name text PRIMARY KEY
);

INSERT INTO public.ascend_timezones (name)
SELECT name FROM pg_catalog.pg_timezone_names
ON CONFLICT DO NOTHING;

ALTER TABLE public.ascend_timezones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ascend_timezones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ascend_timezones TO anon, authenticated;

DROP POLICY IF EXISTS ascend_timezones_read ON public.ascend_timezones;
CREATE POLICY ascend_timezones_read ON public.ascend_timezones
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.ascend_is_timezone(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT p_name IS NOT NULL AND EXISTS (SELECT 1 FROM public.ascend_timezones tz WHERE tz.name = p_name);
$function$;

CREATE OR REPLACE FUNCTION public.ascend_user_timezone(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(
    (SELECT pr.timezone FROM public.profiles pr
     JOIN public.ascend_timezones tz ON tz.name = pr.timezone
     WHERE pr.id = p_user),
    'Asia/Karachi');
$function$;

CREATE OR REPLACE FUNCTION public.ascend_own_timezone(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT pr.timezone
  FROM public.profiles pr
  JOIN public.ascend_timezones tz ON tz.name = pr.timezone
  WHERE pr.id = p_user AND p_user = auth.uid();
$function$;

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

  SELECT tz.name INTO v_device
  FROM public.profiles pr
  JOIN public.ascend_timezones tz ON tz.name = pr.device_timezone
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
    JOIN public.ascend_timezones tz ON tz.name = pr.timezone
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

CREATE OR REPLACE FUNCTION public.ascend_run_local_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row   record;
  v_local timestamp;
  v_week  text;
BEGIN
  FOR v_row IN
    SELECT pr.id, pr.timezone
    FROM public.profiles pr
    JOIN public.ascend_timezones tz ON tz.name = pr.timezone
  LOOP
    v_local := now() AT TIME ZONE v_row.timezone;
    BEGIN
      IF extract(hour FROM v_local) = 20 THEN
        PERFORM public.ascend_send_daily_reminder(v_row.id, v_local::date);
      END IF;

      IF extract(isodow FROM v_local) = 7 AND extract(hour FROM v_local) = 19 THEN
        v_week := to_char(v_local::date, 'IYYY-"W"IW');
        PERFORM public.create_notification_atomic(
          p_recipient_id => v_row.id,
          p_actor_id => NULL,
          p_actor_username => 'Ascend Executive System',
          p_actor_avatar => '🎯',
          p_type => 'sunday_planning',
          p_title => 'Sunday Evening Goal Planning',
          p_message => 'Take 5 minutes to set your top 3 measurable goals and review last week''s velocity.',
          p_payload => jsonb_build_object('weekKey', v_week, 'dedupKey', 'sunday_planning_' || v_week)
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- One user's failure never blocks the others.
      RAISE WARNING 'ascend_run_local_reminders: user % failed: %', v_row.id, SQLERRM;
    END;
  END LOOP;
END;
$function$;

-- A2 ------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profiles_derive_season_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- A direct app edit (stats, settings, timezone) cannot move the score: keep the stored,
  -- ledger-derived values. Ledger changes reach this trigger nested (depth >= 2), crons carry no
  -- JWT role, and a new season_id marks the season boundary; all of those recompute below.
  IF TG_OP = 'UPDATE'
     AND pg_trigger_depth() = 1
     AND coalesce(auth.role(), '') IN ('anon', 'authenticated')
     AND NEW.season_id IS NOT DISTINCT FROM OLD.season_id
  THEN
    NEW.season_points := OLD.season_points;
    NEW.total_points := OLD.season_points;
    NEW.season_history := OLD.season_history;
    NEW.points_history := '[]'::jsonb;
    RETURN NEW;
  END IF;

  NEW.season_points := public.ascend_season_points(NEW.id);
  NEW.total_points := NEW.season_points;
  NEW.season_history := public.ascend_season_history(NEW.id);
  NEW.points_history := '[]'::jsonb;
  RETURN NEW;
END;
$function$;

-- A3 ------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profiles_guard_timezone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- An unchanged device_timezone needs no check: its fallback would be the same OLD value.
  IF TG_OP = 'INSERT' THEN
    IF NOT public.ascend_is_timezone(NEW.device_timezone) THEN
      NEW.device_timezone := NULL;
    END IF;
  ELSIF NEW.device_timezone IS DISTINCT FROM OLD.device_timezone THEN
    IF NOT public.ascend_is_timezone(NEW.device_timezone) THEN
      NEW.device_timezone := OLD.device_timezone;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.timezone := coalesce(NEW.device_timezone, 'Asia/Karachi');
    NEW.timezone_waiting_since := NULL;
    RETURN NEW;
  END IF;

  NEW.timezone := OLD.timezone;
  NEW.timezone_waiting_since := OLD.timezone_waiting_since;

  IF NEW.device_timezone IS NULL OR NEW.device_timezone = NEW.timezone THEN
    NEW.timezone_waiting_since := NULL;
  ELSIF NOT public.ascend_is_timezone(NEW.timezone)
     OR (now() AT TIME ZONE NEW.device_timezone)::date >= (now() AT TIME ZONE NEW.timezone)::date
  THEN
    NEW.timezone := NEW.device_timezone;
    NEW.timezone_waiting_since := NULL;
  ELSIF NEW.device_timezone IS DISTINCT FROM OLD.device_timezone OR NEW.timezone_waiting_since IS NULL THEN
    NEW.timezone_waiting_since := now();
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
