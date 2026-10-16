-- Timezone guard (knowledge/mode-a-deferred-batch-2026-10-16.md, item 1)
-- profiles.timezone decides the user's "today" for every server award, today-only guard and
-- penalty. The app writes the device timezone on every profile save, so a user could pick a
-- timezone far to the west, step back into yesterday and log it late for points.
--
-- Rule: the user's local date on the server never goes backwards.
--   * A change that keeps today's date or moves it forward (staying put, travelling east) is
--     taken at once.
--   * A change that would move today's date back (travelling west across a date) waits in
--     pending_timezone. The hourly job applies it once the new timezone reaches the same date,
--     so the traveller never lives the same date twice. Timezones 24h or more apart never share
--     a date; such a change is applied after 48 hours.
--   * A change that is taken replaces any pending one.
--   * An unknown name is ignored; a new profile without a valid one gets Asia/Karachi from the
--     hourly job (the existing default).
-- Only the app's roles (anon, authenticated) are guarded; the SQL editor and the server's own
-- jobs can set any timezone.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_timezone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_timezone_since timestamptz;

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

  IF TG_OP = 'INSERT' THEN
    -- NULL, not a default: an upsert that hits an existing row carries this value into its
    -- UPDATE, where NULL means "no change". The hourly job fills real new rows.
    IF NOT public.ascend_is_timezone(NEW.timezone) THEN
      NEW.timezone := NULL;
    END IF;
    NEW.pending_timezone := NULL;
    NEW.pending_timezone_since := NULL;
    RETURN NEW;
  END IF;

  -- The pending columns are the server's own.
  NEW.pending_timezone := OLD.pending_timezone;
  NEW.pending_timezone_since := OLD.pending_timezone_since;

  IF NOT public.ascend_is_timezone(NEW.timezone) THEN
    NEW.timezone := OLD.timezone;
    RETURN NEW;
  END IF;

  -- Unchanged (or a save that does not send it): a pending change stays. If the traveller came
  -- back before it applied, the next save sends home again and is taken at once (date forward).
  IF NEW.timezone IS NOT DISTINCT FROM OLD.timezone THEN
    RETURN NEW;
  END IF;

  IF NOT public.ascend_is_timezone(OLD.timezone)
     OR (now() AT TIME ZONE NEW.timezone)::date >= (now() AT TIME ZONE OLD.timezone)::date
  THEN
    NEW.pending_timezone := NULL;
    NEW.pending_timezone_since := NULL;
    RETURN NEW;
  END IF;

  IF NEW.timezone IS DISTINCT FROM OLD.pending_timezone THEN
    NEW.pending_timezone := NEW.timezone;
    NEW.pending_timezone_since := now();
  END IF;
  NEW.timezone := OLD.timezone;
  RETURN NEW;
END;
$function$;

-- Runs after profiles_derive_season_points, before trg_prevent_profile_uid_change (name order).
CREATE TRIGGER profiles_guard_timezone BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_timezone();

CREATE OR REPLACE FUNCTION public.ascend_apply_pending_timezones()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.profiles p
  SET timezone = 'Asia/Karachi'
  WHERE NOT public.ascend_is_timezone(p.timezone);

  UPDATE public.profiles p
  SET timezone = p.pending_timezone,
      pending_timezone = NULL,
      pending_timezone_since = NULL
  WHERE p.pending_timezone IS NOT NULL
    AND public.ascend_is_timezone(p.pending_timezone)
    AND ((now() AT TIME ZONE p.pending_timezone)::date >= (now() AT TIME ZONE p.timezone)::date
         OR p.pending_timezone_since < now() - interval '48 hours');

  UPDATE public.profiles p
  SET pending_timezone = NULL,
      pending_timezone_since = NULL
  WHERE p.pending_timezone IS NOT NULL
    AND NOT public.ascend_is_timezone(p.pending_timezone);
END;
$function$;

-- The guard runs as the app's role, so the app may call this read-only check.
REVOKE ALL ON FUNCTION public.ascend_is_timezone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ascend_is_timezone(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.profiles_guard_timezone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_apply_pending_timezones() FROM PUBLIC, anon, authenticated;

-- Minute 0, before the penalty job (minute 5) and recovery awards (minute 10).
SELECT cron.schedule('ascend-pending-timezones-hourly', '0 * * * *', 'SELECT public.ascend_apply_pending_timezones()');

COMMIT;
