-- Season master + server-side rollover (knowledge/mode-a-season-server-2026-10-16.md, S1)
--
-- One master for the season calendar: ascend_season_epoch() (Season 1 starts) and
-- ascend_season_length() (90 days). Every season number, start and end on the server comes
-- from them, and the app reads the same two values through ascend_season_config(), so the
-- season changes at one UTC instant for everyone and nothing else carries its own copy.
-- Changing the epoch or the length moves every past season too: only the number is meant to
-- move on its own.
--
-- Rollover: profiles.season_points / season_history are derived by the profiles trigger, which
-- only fires when a row changes. At a season boundary nothing changes, so a member who does not
-- open the app kept last season's total on the leaderboard. The hourly job below refreshes every
-- profile once when a new season begins. A season reset touches points only; no user data.
--
-- Bodies of ascend_season_points / ascend_season_history are unchanged apart from reading the
-- master (the old literal interval '90 days' equals 7,776,000 seconds in the UTC session).

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_season_epoch()
 RETURNS timestamptz
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT timestamptz '2026-08-01 00:00:00+00';
$function$;

CREATE OR REPLACE FUNCTION public.ascend_season_length()
 RETURNS interval
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- 90 days in seconds: an exact length whatever the session timezone.
  SELECT interval '7776000 seconds';
$function$;

-- Season containing p_at (1-based; before the epoch is Season 1).
CREATE OR REPLACE FUNCTION public.ascend_season_number(p_at timestamptz)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT 1 + greatest(0, floor(extract(epoch FROM p_at - public.ascend_season_epoch())
                               / extract(epoch FROM public.ascend_season_length())))::int;
$function$;

-- First instant of season p_season.
CREATE OR REPLACE FUNCTION public.ascend_season_begin(p_season integer)
 RETURNS timestamptz
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT public.ascend_season_epoch() + public.ascend_season_length() * (greatest(p_season, 1) - 1);
$function$;

-- Start of the season containing p_at (same signature and result as before).
CREATE OR REPLACE FUNCTION public.ascend_season_start(p_at timestamptz)
 RETURNS timestamptz
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT public.ascend_season_begin(public.ascend_season_number(p_at));
$function$;

-- Lesson reads: same as the season number (kept for its callers).
CREATE OR REPLACE FUNCTION public.ascend_lesson_season(p_at timestamptz)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT public.ascend_season_number(p_at);
$function$;

CREATE OR REPLACE FUNCTION public.ascend_season_points(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_start  timestamptz := public.ascend_season_start(now());
  v_total  numeric := 0;
  v_amount numeric;
BEGIN
  FOR v_amount IN
    SELECT coalesce((pe.data->>'amount')::numeric, 0)
    FROM public.point_entries pe
    WHERE pe.user_id = p_user
      AND pe.deleted_at IS NULL
      AND coalesce(pe.data->>'source', '') <> 'system'
      AND coalesce(pe.data->>'reason', '') <> 'System: Debt Forgiveness'
      AND public.ascend_instant(pe.data->>'timestamp') >= v_start
    ORDER BY public.ascend_instant(pe.data->>'timestamp')
  LOOP
    v_total := greatest(v_total + v_amount, 0);
  END LOOP;
  RETURN round(v_total)::int;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ascend_season_history(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_current int := public.ascend_season_number(now());
  v_start   timestamptz;
  v_end     timestamptz;
  v_total   numeric;
  v_amount  numeric;
  v_history jsonb := '[]'::jsonb;
BEGIN
  FOR v_season IN REVERSE (v_current - 1)..1 LOOP
    v_start := public.ascend_season_begin(v_season);
    v_end   := v_start + public.ascend_season_length();
    v_total := 0;
    FOR v_amount IN
      SELECT coalesce((pe.data->>'amount')::numeric, 0)
      FROM public.point_entries pe
      WHERE pe.user_id = p_user
        AND pe.deleted_at IS NULL
        AND coalesce(pe.data->>'source', '') <> 'system'
        AND coalesce(pe.data->>'reason', '') <> 'System: Debt Forgiveness'
        AND public.ascend_instant(pe.data->>'timestamp') >= v_start
        AND public.ascend_instant(pe.data->>'timestamp') < v_end
      ORDER BY public.ascend_instant(pe.data->>'timestamp')
    LOOP
      v_total := greatest(v_total + v_amount, 0);
    END LOOP;
    IF round(v_total) > 0 THEN
      v_history := v_history || jsonb_build_array(jsonb_build_object(
        'seasonNumber', v_season,
        'seasonName', 'Season ' || v_season,
        'points', round(v_total)::int,
        -- Last day of the season (UTC).
        'date', to_char((v_end - interval '1 millisecond') AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      ));
    END IF;
  END LOOP;
  RETURN v_history;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_season_epoch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_season_length() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_season_number(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_season_begin(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_season_start(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_lesson_season(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_season_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_season_history(uuid) FROM PUBLIC, anon, authenticated;

-- What the app reads: the master values (the app works out number/start/end the same way,
-- also offline from its last copy).
CREATE OR REPLACE FUNCTION public.ascend_season_config()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT jsonb_build_object(
    'epochMs', (extract(epoch FROM public.ascend_season_epoch()) * 1000)::bigint,
    'lengthMs', (extract(epoch FROM public.ascend_season_length()) * 1000)::bigint
  );
$function$;

REVOKE ALL ON FUNCTION public.ascend_season_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ascend_season_config() TO anon, authenticated;

-- Last season the rollover job handled (one row).
CREATE TABLE IF NOT EXISTS public.ascend_season_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  current_season integer NOT NULL,
  rolled_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ascend_season_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ascend_season_state FROM anon, authenticated;

INSERT INTO public.ascend_season_state (id, current_season)
VALUES (true, public.ascend_season_number(now()))
ON CONFLICT (id) DO NOTHING;

-- Hourly: when a new season has begun, re-derive every profile's season points and season
-- history once (the profiles trigger does the maths). Safe to run again.
CREATE OR REPLACE FUNCTION public.ascend_run_season_rollover()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_season int := public.ascend_season_number(now());
  v_stored int;
  v_count  int := 0;
BEGIN
  SELECT current_season INTO v_stored FROM public.ascend_season_state WHERE id FOR UPDATE;
  IF v_stored IS NOT NULL AND v_stored >= v_season THEN
    RETURN 0;
  END IF;

  UPDATE public.profiles SET season_points = season_points;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.ascend_season_state (id, current_season, rolled_at)
  VALUES (true, v_season, now())
  ON CONFLICT (id) DO UPDATE SET current_season = EXCLUDED.current_season, rolled_at = EXCLUDED.rolled_at;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_run_season_rollover() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ascend-season-rollover-hourly';
SELECT cron.schedule('ascend-season-rollover-hourly', '0 * * * *', 'SELECT public.ascend_run_season_rollover()');

COMMIT;
