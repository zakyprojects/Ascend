-- Trusted clock (knowledge/trusted-clock-plan.md)
-- 1. server_now(): the app reads the time from here instead of the device clock.
-- 2. Guards: rows dated in the future are refused, so a device clock moved forward (or a
--    console write) cannot award points or pre-fill days ahead. A refusal raises
--    check_violation (23514), which the app's sync outbox treats as permanent and drops.
--    Point values and every existing row are unchanged; only new writes are checked.

BEGIN;

CREATE OR REPLACE FUNCTION public.server_now()
 RETURNS timestamptz
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT now();
$function$;

REVOKE ALL ON FUNCTION public.server_now() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.server_now() TO anon, authenticated, service_role;

-- point_entries: a live entry's timestamp may not be more than 10 minutes ahead of the server.
CREATE OR REPLACE FUNCTION public.guard_point_entry_future()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_at timestamptz;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_at := nullif(btrim(NEW.data->>'timestamp'), '')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_at := NULL;
  END;
  IF v_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'point entry % is dated in the future (%)', NEW.id, v_at
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- Day-keyed rows: a date may not be later than today anywhere on Earth (UTC+14), so no
-- legitimate local day is ever refused, whatever the user's timezone.
--   bad_habit_logs.data.date, workouts.data.date: the row's own day
--   habits.data.completions: newly added daily keys (YYYY-MM-DD); weekly keys are not checked
CREATE OR REPLACE FUNCTION public.guard_day_future()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_latest text := to_char((now() AT TIME ZONE 'Etc/GMT-14')::date, 'YYYY-MM-DD');
  v_key    text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
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

-- Named *_guard_future so they fire before *_keep_newer and *_stamp (triggers run in name order).
CREATE TRIGGER point_entries_guard_future BEFORE INSERT OR UPDATE ON public.point_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_point_entry_future();
CREATE TRIGGER bad_habit_logs_guard_future BEFORE INSERT OR UPDATE ON public.bad_habit_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_day_future();
CREATE TRIGGER workouts_guard_future BEFORE INSERT OR UPDATE ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.guard_day_future();
CREATE TRIGGER habits_guard_future BEFORE INSERT OR UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.guard_day_future();

COMMIT;
