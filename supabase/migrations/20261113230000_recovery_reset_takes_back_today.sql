-- Recovery: a reset (Reset streak, or the new Slipped button) takes back TODAY's check-in and its point.
--
-- Before: "Clean today" and then a reset on the same day kept the check-in and its 1 point, and the card
-- still said "Checked in today", although How it works says a day you reset the streak earns nothing.
-- (A reset BEFORE the check-in was already right: ascend_award_recovery_checkin gives 0 for a day the
-- streak (re)started in.)
--
-- Rule (one place, on the server, so every app version and every device gets it):
--   When a live tracker's startDate moves forward to an instant inside the user's CURRENT local day
--   (ascend_user_timezone), today's live recovery_checkins row is soft-deleted. The existing trigger
--   recovery_checkins_award_points then calls ascend_revoke_recovery_checkin, which soft-deletes today's
--   point (recovery_day_<today>, source recovery_checkin) only while that day is still today.
--   * Earlier days never change: only today's row is touched, and the revoke itself is today-only.
--   * A reset that reaches the server after midnight (start on an earlier day) changes nothing.
--   * Renames, milestone labels, stale re-uploads (startDate unchanged or older) change nothing.
--   * A check-in that arrives after the reset already earns 0 (start inside the day), unchanged.
-- New app: resetAddictionStreak removes today's check-in and preview point itself, at once (mirror:
-- src/lib/points/recoveryAwards.ts recoveryResetTakesBackDay). Its own soft delete and this trigger
-- end in the same single state; whichever reaches the server second changes nothing.
-- Old prod app: unchanged writes (it only moves startDate); after a same-day Clean + Reset it pulls the
-- deleted check-in and point and shows "Your streak restarted today".
--
-- Rollback: DROP TRIGGER addiction_trackers_reset_checkin ON public.addiction_trackers;
--           DROP FUNCTION public.addiction_trackers_reset_checkin();
-- (Points it already took back stay taken back; nothing else is changed by this file.)

BEGIN;

CREATE OR REPLACE FUNCTION public.addiction_trackers_reset_checkin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_start timestamptz;
  v_old   timestamptz;
  v_tz    text;
  v_today date;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR OLD.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  v_start := public.ascend_instant(NEW.data->>'startDate');
  v_old := public.ascend_instant(OLD.data->>'startDate');
  IF v_start IS NULL OR (v_old IS NOT NULL AND v_start <= v_old) THEN
    RETURN NULL; -- not a reset: no start, or the start did not move forward
  END IF;
  v_tz := public.ascend_user_timezone(NEW.user_id);
  v_today := (now() AT TIME ZONE v_tz)::date;
  IF (v_start AT TIME ZONE v_tz)::date <> v_today THEN
    RETURN NULL; -- the streak restarted on another day: today's check-in stays
  END IF;
  UPDATE public.recovery_checkins c
  SET deleted_at = now(), updated_at = greatest(now(), c.updated_at)
  WHERE c.user_id = NEW.user_id
    AND c.id = to_char(v_today, 'YYYY-MM-DD')
    AND c.deleted_at IS NULL;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.addiction_trackers_reset_checkin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.addiction_trackers_reset_checkin() TO service_role;

DROP TRIGGER IF EXISTS addiction_trackers_reset_checkin ON public.addiction_trackers;
CREATE TRIGGER addiction_trackers_reset_checkin
  AFTER UPDATE ON public.addiction_trackers
  FOR EACH ROW
  WHEN (OLD.data->>'startDate' IS DISTINCT FROM NEW.data->>'startDate')
  EXECUTE FUNCTION public.addiction_trackers_reset_checkin();

COMMIT;
