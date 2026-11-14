-- Sunday planning notice opens NEXT week (Zakria go 2026-11-07, D1).
--
-- *** RUN AFTER the production push of the client (studio commits "Sunday planning notice: new
-- words and opens the week it plans" and the ?week= / navigation commits). Deploy the send-push
-- Edge Function change at the same time. Best not during a Sunday 19:xx in any user's time zone
-- (Sun ~05:00 UTC to Mon ~07:00 UTC), so every user switches on the same Sunday. ***
--
-- Replaces public.ascend_run_local_reminders(), Sunday block only. Everything else (daily 20:00
-- reminder, loop, exception handler, SECURITY DEFINER, search_path) is byte-identical to the live
-- body read on 2026-11-07 (pg_get_functiondef). CREATE OR REPLACE keeps the ACL
-- (postgres + service_role EXECUTE), so no grants here.
--
-- Changes in the Sunday block:
--   * title 'Plan next week', message 'Set a few goals for next week, and look back at this one.'
--   * no actor arguments (create_notification_atomic stored NULL for them anyway when actor_id is
--     NULL; 'Ascend Executive System' / the emoji were never saved)
--   * payload.weekKey = public.ascend_week_key(Sunday) (the app's week numbering, was ISO
--     'IYYY-"W"IW'); payload.planWeekKey = public.ascend_week_key(Sunday + 1) = the week that
--     starts the next Monday. send-push opens /weekly-goals?week=<planWeekKey>; the app opens it.
--   * dedupKey stays 'sunday_planning_' || weekKey. For every remaining 2026 Sunday the app key
--     equals the ISO key (incl. 2026-12-27 = 2026-W52 and 2027-01-03 = 2026-W53), so the switch
--     can neither send twice nor skip a Sunday. From 2027-01-10 the keys follow the app numbering
--     (2027 has no W01 there), still one per week.
--
-- Rollback: the live body read 2026-11-07 is in work/snapshots/sunday-planning-2026-11-07/ascend_run_local_reminders.before.sql
-- (Hark workspace); snapshot it again to work/snapshots/ right before applying.

CREATE OR REPLACE FUNCTION public.ascend_run_local_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row   record;
  v_local timestamp;
  v_week  text;
BEGIN
  FOR v_row IN
    SELECT pr.id, pr.timezone
    FROM public.profiles pr
    JOIN public.ascend_timezones tz ON tz.name = pr.timezone
  LOOP
    v_local := now() AT TIME ZONE v_row.timezone;
    BEGIN
      IF extract(hour FROM v_local) = 20 THEN
        PERFORM public.ascend_send_daily_reminder(v_row.id, v_local::date);
      END IF;

      IF extract(isodow FROM v_local) = 7 AND extract(hour FROM v_local) = 19 THEN
        v_week := public.ascend_week_key(v_local::date);
        PERFORM public.create_notification_atomic(
          p_recipient_id => v_row.id,
          p_type => 'sunday_planning',
          p_title => 'Plan next week',
          p_message => 'Set a few goals for next week, and look back at this one.',
          p_payload => jsonb_build_object(
            'weekKey', v_week,
            'planWeekKey', public.ascend_week_key(v_local::date + 1),
            'dedupKey', 'sunday_planning_' || v_week
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- One user's failure never blocks the others.
      RAISE WARNING 'ascend_run_local_reminders: user % failed: %', v_row.id, SQLERRM;
    END;
  END LOOP;
END;
$function$;
