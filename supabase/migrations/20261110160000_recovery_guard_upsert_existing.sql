-- Sync upserts of a sobriety tracker older than 24 hours were refused (23514, Sentry JAVASCRIPT-REACT-8):
-- Postgres fires BEFORE INSERT triggers for every upserted row, so the new-tracker check also hit
-- existing trackers. The 24-hour check now applies only when no live row with that id exists.
-- Run any time (client unchanged). Rollback: re-run the function from 20261015240000_server_recovery_awards.sql.

CREATE OR REPLACE FUNCTION public.addiction_trackers_guard_start()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_start timestamptz;
  v_old   timestamptz;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_start := nullif(btrim(NEW.data->>'startDate'), '')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_start := NULL;
  END;
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'sobriety tracker % has no valid startDate', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  IF v_start > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'sobriety tracker % starts in the future (%)', NEW.id, v_start USING ERRCODE = 'check_violation';
  END IF;

  -- An upsert (INSERT ... ON CONFLICT DO UPDATE) runs this as INSERT even when the row exists; only
  -- a genuinely new tracker gets the 24-hour check. An existing one is checked by the UPDATE pass.
  IF TG_OP = 'INSERT' THEN
    IF v_start < now() - interval '24 hours' AND NOT EXISTS (
      SELECT 1 FROM public.addiction_trackers t
      WHERE t.user_id = NEW.user_id AND t.id = NEW.id AND t.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'sobriety tracker % starts too far back (%)', NEW.id, v_start USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    v_old := nullif(btrim(OLD.data->>'startDate'), '')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_old := NULL;
  END;
  IF v_old IS NOT NULL AND v_start < v_old THEN
    RAISE EXCEPTION 'sobriety tracker % start moved back (% before %)', NEW.id, v_start, v_old
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
