-- Time Tracker grace window (backlog #25, mode-a-timetracker G6): until 02:00 local, yesterday's
-- last block can still be ticked or unticked, so yesterday's points are still recomputed.
-- Until now any day change recomputed only the owner's current local day, so ticking the late
-- "wind down" block a few minutes after midnight earned nothing.
--   * A change to yesterday's row (id = yesterday's date) before 02:00 in the owner's timezone
--     (profiles.timezone) also recomputes yesterday with the same rule as today
--     (ascend_recompute_time_tracker_award, unchanged). From 02:00 yesterday is frozen as before.
--   * Today is still recomputed on every change, as before.
-- The app allows only the last block of yesterday in that window (store toggleDailyTimeBlockCompleted,
-- timeTrackerGraceDay in src/lib/timeTrackerAwards.ts); the server, like for today, trusts the
-- day's blocks (the tiers bound a false claim to 5 points a day).
-- Same signature, so no old overload to drop. Run order: BEFORE the studio test (older app builds
-- can't change a past day, so nothing changes for them).

BEGIN;

CREATE OR REPLACE FUNCTION public.time_tracker_days_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_local timestamp := now() AT TIME ZONE public.ascend_user_timezone(NEW.user_id);
BEGIN
  PERFORM public.ascend_recompute_time_tracker_award(NEW.user_id, v_local::date);
  -- Grace window: yesterday's own row, changed before 02:00 local.
  IF v_local::time < time '02:00' AND NEW.id = to_char(v_local::date - 1, 'YYYY-MM-DD') THEN
    PERFORM public.ascend_recompute_time_tracker_award(NEW.user_id, v_local::date - 1);
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.time_tracker_days_award_points() FROM PUBLIC, anon, authenticated;

COMMIT;
