-- Timezone guard (knowledge/mode-a-deferred-batch-2026-10-16.md, item 1)
-- profiles.timezone decides the user's "today" for every server award, today-only guard and
-- penalty. The app used to write it on every profile save, so a user could pick a timezone far
-- to the west, step back into yesterday and log it late for points.
--
-- Now:
--   * profiles.device_timezone = what the device last reported (the app writes this).
--   * profiles.timezone = the effective timezone; only the server sets it. It follows
--     device_timezone under one rule: the user's local date on the server never goes backwards.
--       - Same date or a later one (staying put, travelling east): taken at once.
--       - An earlier date (travelling west across a date): waits; the hourly job takes it once
--         the new timezone reaches the same date, so no date is lived twice. Timezones 24h or
--         more apart never share a date; such a change is taken after 48 hours.
--       - Coming back before it was taken: the device reports the effective timezone again,
--         so nothing is waiting any more.
--   * An unknown name is ignored; a profile without a valid timezone gets the device's, or
--     Asia/Karachi (the existing default).
-- Only the app's roles (anon, authenticated) are guarded; the SQL editor and the server's own
-- jobs can set any value.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS device_timezone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone_waiting_since timestamptz;

UPDATE public.profiles p SET device_timezone = p.timezone WHERE p.device_timezone IS NULL;

CREATE OR REPLACE FUNCTION public.ascend_is_timezone(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT p_name IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p_name);
$function$;

CREATE OR REPLACE FUNCTION public.profiles_guard_timezone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NOT public.ascend_is_timezone(NEW.device_timezone) THEN
    NEW.device_timezone := CASE WHEN TG_OP = 'UPDATE' THEN OLD.device_timezone END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.timezone := coalesce(NEW.device_timezone, 'Asia/Karachi');
    NEW.timezone_waiting_since := NULL;
    RETURN NEW;
  END IF;

  -- The effective timezone and its waiting stamp are the server's own.
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

-- Runs after profiles_derive_season_points, before trg_prevent_profile_uid_change (name order).
CREATE TRIGGER profiles_guard_timezone BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_timezone();

CREATE OR REPLACE FUNCTION public.ascend_apply_waiting_timezones()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.profiles p
  SET timezone = CASE WHEN public.ascend_is_timezone(p.device_timezone) THEN p.device_timezone ELSE 'Asia/Karachi' END,
      timezone_waiting_since = NULL
  WHERE NOT public.ascend_is_timezone(p.timezone);

  UPDATE public.profiles p
  SET timezone = p.device_timezone,
      timezone_waiting_since = NULL
  WHERE p.device_timezone IS DISTINCT FROM p.timezone
    AND public.ascend_is_timezone(p.device_timezone)
    AND ((now() AT TIME ZONE p.device_timezone)::date >= (now() AT TIME ZONE p.timezone)::date
         OR p.timezone_waiting_since < now() - interval '48 hours');
END;
$function$;

-- The guard runs as the app's role, so the app may call this read-only check.
REVOKE ALL ON FUNCTION public.ascend_is_timezone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ascend_is_timezone(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.profiles_guard_timezone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_apply_waiting_timezones() FROM PUBLIC, anon, authenticated;

-- Minute 0, before the penalty job (minute 5) and recovery awards (minute 10).
SELECT cron.schedule('ascend-waiting-timezones-hourly', '0 * * * *', 'SELECT public.ascend_apply_waiting_timezones()');

COMMIT;
