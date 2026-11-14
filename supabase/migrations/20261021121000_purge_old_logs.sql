-- Batch #8: 30-day retention for the log tables that only grew (Zakria 2026-10-20: 30 days everywhere,
-- except points/history). Runs daily after ascend-purge-soft-deleted-daily (21:40 UTC).
--   notifications            the app already shows only the last 30 days (NOTIFICATION_MAX_AGE_DAYS)
--                            and every dedupKey is day/week keyed, so nothing is sent again
--   cron.job_run_details     pg_cron run history (~160 rows a day)
--   ascend_guest_cleanup_log guest-cleanup audit rows
--   sign_in_failures         rate-limit rows (normally pruned to 1 h on the next sign-in attempt)
-- Not touched: point_entries, league_archives (points/history), state tables, user content.
CREATE OR REPLACE FUNCTION public.ascend_purge_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cutoff timestamptz := now() - interval '30 days';
BEGIN
  DELETE FROM public.notifications WHERE created_at < v_cutoff;
  DELETE FROM public.ascend_guest_cleanup_log WHERE run_at < v_cutoff;
  DELETE FROM public.sign_in_failures WHERE failed_at < v_cutoff;
  DELETE FROM cron.job_run_details WHERE end_time < v_cutoff;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_purge_old_logs() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ascend-purge-old-logs-daily';
SELECT cron.schedule('ascend-purge-old-logs-daily', '50 21 * * *', 'SELECT public.ascend_purge_old_logs()');

-- Verify (read-only):
--   SELECT count(*) FROM public.notifications WHERE created_at < now() - interval '31 days';  -- 0 after a run
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'ascend-purge-old-logs-daily';
