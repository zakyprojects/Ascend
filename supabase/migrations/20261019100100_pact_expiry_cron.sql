-- Partners: a shared challenge's stored status follows its length even when nobody writes.
-- Status was derived only on write (shared_challenges_guard, writer's timezone); the app derives
-- it on every read (src/lib/pactLifecycle.ts), so the row could stay 'active' after the end.
-- Hourly, an 'active' row whose last day has ended for BOTH members (each member's own timezone,
-- the guard's day math: elapsed = today - created day + 1 > length) becomes 'completed' (joint
-- days >= length, as the guard decides) or 'expired'. While one member is still on the last day
-- the row waits; a member's write re-derives the status through the guard as before.
-- The guard and notify triggers skip writes without auth.uid(), so this sends no notices.
-- Server-only, no app dependency: safe to run BEFORE the studio test.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_run_pact_expiry()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  UPDATE public.shared_challenges sc
  SET status = CASE
    WHEN coalesce(sc.total_joint_days_completed, 0) >= coalesce(sc.duration_days, 7) THEN 'completed'
    ELSE 'expired'
  END
  FROM public.partnerships p,
       LATERAL (SELECT public.ascend_user_timezone(p.user1_id) AS tz1,
                       public.ascend_user_timezone(p.user2_id) AS tz2) z
  WHERE p.id = sc.partnership_id
    AND sc.status = 'active'
    AND (now() AT TIME ZONE z.tz1)::date - (sc.created_at AT TIME ZONE z.tz1)::date + 1 > coalesce(sc.duration_days, 7)
    AND (now() AT TIME ZONE z.tz2)::date - (sc.created_at AT TIME ZONE z.tz2)::date + 1 > coalesce(sc.duration_days, 7);
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_run_pact_expiry() FROM PUBLIC, anon, authenticated;

-- Hourly at :20, clear of the :00 / :02 / :05 / :10 / :15 jobs.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ascend-pact-expiry-hourly';
SELECT cron.schedule('ascend-pact-expiry-hourly', '20 * * * *', 'SELECT public.ascend_run_pact_expiry()');

COMMIT;

-- Verify (read-only; the read-only role cannot call ascend_user_timezone, so the zone is inlined):
-- SELECT jobname, schedule FROM cron.job WHERE jobname = 'ascend-pact-expiry-hourly';
-- WITH z AS (
--   SELECT sc.id, sc.status, sc.created_at, sc.duration_days,
--     coalesce((SELECT pr.timezone FROM public.profiles pr JOIN pg_timezone_names t ON t.name = pr.timezone WHERE pr.id = p.user1_id), 'Asia/Karachi') AS tz1,
--     coalesce((SELECT pr.timezone FROM public.profiles pr JOIN pg_timezone_names t ON t.name = pr.timezone WHERE pr.id = p.user2_id), 'Asia/Karachi') AS tz2
--   FROM public.shared_challenges sc JOIN public.partnerships p ON p.id = sc.partnership_id)
-- SELECT count(*) FROM z WHERE status = 'active'
--   AND (now() AT TIME ZONE tz1)::date - (created_at AT TIME ZONE tz1)::date + 1 > duration_days
--   AND (now() AT TIME ZONE tz2)::date - (created_at AT TIME ZONE tz2)::date + 1 > duration_days;  -- 0 after the :20 run
