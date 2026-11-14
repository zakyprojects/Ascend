-- League archives written by the server, part 2 of 2 (apply AFTER the app that no longer writes
-- archives is in production; part 1 is 20261017060000_league_archives_server.sql).
-- From here only ascend_run_league_archives writes league_archives. An older app still open
-- somewhere gets a permission error on its archive writes, which its outbox treats as permanent
-- and drops (its other data keeps syncing); the guard trigger also drops any app write that a
-- later grant would let through (as point_entries). Members keep reading their own archives
-- (select policy and realtime unchanged).

BEGIN;

CREATE OR REPLACE FUNCTION public.league_archives_guard_server_owned()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.league_archives_guard_server_owned() FROM PUBLIC, anon, authenticated;

-- Runs first (triggers fire in name order: guard < keep_newer < stamp).
DROP TRIGGER IF EXISTS league_archives_guard_server_owned ON public.league_archives;
CREATE TRIGGER league_archives_guard_server_owned BEFORE INSERT OR UPDATE ON public.league_archives
  FOR EACH ROW EXECUTE FUNCTION public.league_archives_guard_server_owned();

DROP POLICY IF EXISTS "Owner can insert" ON public.league_archives;
DROP POLICY IF EXISTS "Owner can update" ON public.league_archives;
REVOKE INSERT, UPDATE, DELETE ON public.league_archives FROM anon, authenticated;

-- Hourly, after the season rollover (:00), penalties (:05) and recovery awards (:10).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ascend-league-archives-hourly';
SELECT cron.schedule('ascend-league-archives-hourly', '15 * * * *', 'SELECT public.ascend_run_league_archives()');

COMMIT;
