-- Profile privacy, part 1 of 2 (knowledge/ASCEND_STATE.md, audit #3)
--
-- profiles is readable by everyone (policy "Profiles viewable by all users", every column granted),
-- so any visitor with the public anon key can read every member's email, notification settings,
-- timezones and username-change time. Part 2 (20261016190000, applied after the app below is in
-- production) limits what anon/authenticated can SELECT to the public columns. This part prepares
-- for it without changing what anyone can read today:
--   * ascend_my_profile(): the signed-in member's own private columns (the app reads them here).
--   * ascend_own_timezone(user): the caller's own validated timezone, for the four "today" guards,
--     which run as the writing member and so lose direct access to profiles.timezone in part 2.
--     Same lookup as before (unknown zone -> NULL -> Asia/Karachi); another member's id -> NULL.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_my_profile()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'email', pr.email,
    'notif_daily_reminder', pr.notif_daily_reminder,
    'notif_partner_activity', pr.notif_partner_activity,
    'notif_league_updates', pr.notif_league_updates,
    'notif_sunday_planning', pr.notif_sunday_planning,
    'last_username_change_at', pr.last_username_change_at,
    'timezone', pr.timezone,
    'timezone_waiting_since', pr.timezone_waiting_since
  )
  FROM public.profiles pr
  WHERE pr.id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.ascend_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ascend_my_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.ascend_own_timezone(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT pr.timezone
  FROM public.profiles pr
  JOIN pg_catalog.pg_timezone_names tz ON tz.name = pr.timezone
  WHERE pr.id = p_user AND p_user = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.ascend_own_timezone(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ascend_own_timezone(uuid) TO anon, authenticated;

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
  -- The writer's own timezone (profiles.timezone is no longer readable by the app's roles).
  v_tz := public.ascend_own_timezone(NEW.user_id);
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

CREATE OR REPLACE FUNCTION public.reading_logs_guard_today()
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
  -- The writer's own timezone (profiles.timezone is no longer readable by the app's roles).
  v_tz := public.ascend_own_timezone(NEW.user_id);
  v_today := to_char((now() AT TIME ZONE coalesce(v_tz, 'Asia/Karachi'))::date, 'YYYY-MM-DD');
  IF NEW.data->>'date' IS DISTINCT FROM v_today
     OR (TG_OP = 'UPDATE' AND OLD.data->>'date' IS DISTINCT FROM v_today)
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

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
  -- The writer's own timezone (profiles.timezone is no longer readable by the app's roles).
  v_tz := public.ascend_own_timezone(NEW.user_id);
  v_today := to_char((now() AT TIME ZONE coalesce(v_tz, 'Asia/Karachi'))::date, 'YYYY-MM-DD');
  IF NEW.data->>'date' IS DISTINCT FROM v_today
     OR (TG_OP = 'UPDATE' AND OLD.data->>'date' IS DISTINCT FROM v_today)
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

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
  -- The writer's own timezone (profiles.timezone is no longer readable by the app's roles).
  v_tz := public.ascend_own_timezone(NEW.user_id);
  v_today := to_char((now() AT TIME ZONE coalesce(v_tz, 'Asia/Karachi'))::date, 'YYYY-MM-DD');
  IF NEW.data->>'date' IS DISTINCT FROM v_today
     OR (TG_OP = 'UPDATE' AND OLD.data->>'date' IS DISTINCT FROM v_today)
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
