-- Focus timer: a session that ended YESTERDAY (local) and reaches the server today still earns its
-- points on yesterday (Zakria 2026-11-04, knowledge/mode-b-focus-late-day-2026-11-04.md).
-- NOT APPLIED: needs Zakria's go. Can run before or after the studio test (no app change needs it).
--
-- Why: since c658132 a running session keeps running while the app is closed or the phone is
-- locked. A 90-minute session started at 21:00 (or one across midnight) that is first reopened the
-- next morning is logged on the day it ended, but the upload arrives the next day. Before this file
-- the trigger only scored today (plus yesterday for a row of today that started yesterday), so such
-- a session earned 0.
--
-- What changes (only focus_logs_award_points, the trigger function):
--   * Today is recomputed exactly as before.
--   * Yesterday is raised in floor mode (only up, never down, never removed; cap 10 a day across all
--     its rows) whenever the live row of today OR yesterday has a point that counts on yesterday
--     (ascend_focus_log_items). This covers the old case (a row of today that crossed midnight) and
--     the new one (a row dated yesterday that arrives today).
--   * Window: yesterday only. A row dated 2+ days ago, and any part of a session that counts on a
--     day before yesterday, still earns 0. Reason: an award row of yesterday is stamped inside
--     yesterday, so every league week/month/season it can land in ended less than 48 h ago and its
--     archive is still provisional (ascend_run_league_archives finalizes 48 h after the period end).
--     A day before yesterday could land in a period that is already final.
--   * Extra guard for days of 25 h (DST zones): yesterday is skipped once its start is 48 h or more
--     in the past, so a final (frozen) archive period is never changed. Never true in Asia/Karachi.
--   * Rows without planned_minutes (old rule) never reach the floor branch, as before.

BEGIN;

CREATE OR REPLACE FUNCTION public.focus_logs_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz    text := public.ascend_user_timezone(NEW.user_id);
  v_today date := (now() AT TIME ZONE v_tz)::date;
BEGIN
  PERFORM public.ascend_recompute_focus_awards_day(NEW.user_id, v_today, v_tz, false);
  IF NEW.deleted_at IS NULL
     AND NEW.planned_minutes IS NOT NULL
     AND NEW.log_date BETWEEN v_today - 1 AND v_today
     AND ((v_today - 1)::timestamp AT TIME ZONE v_tz) > now() - interval '48 hours'
     AND EXISTS (SELECT 1 FROM public.ascend_focus_log_items(v_tz, NEW) it WHERE it.item_day = v_today - 1) THEN
    PERFORM public.ascend_recompute_focus_awards_day(NEW.user_id, v_today - 1, v_tz, true);
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.focus_logs_award_points() FROM PUBLIC, anon, authenticated;

-- No recompute here: rows that already arrived late keep their 0 (see the dry run,
-- work/verify-focus-late-day-2026-11-04.sql).

COMMIT;
