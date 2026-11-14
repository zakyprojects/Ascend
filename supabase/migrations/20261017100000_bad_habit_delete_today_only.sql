-- Deleting a bad habit removes only today's points from it, like a normal habit (2026-10-17).
-- Before: the delete also took back the habit's resist points of every earlier day, and the
-- resist points the app wrote before 2026-10-15 (the bad_habit_delete refund row).
-- Now: the habit's logs are soft-deleted and today is recomputed without the habit, which
-- drops today's resist/occurred rows (ascend_recompute_bad_habit_awards, step c). Earlier
-- resist, occurred and no-report rows stay. Mirror: deleteBadHabit in src/lib/store.ts.
-- Run order: AFTER the app with the same rule is in production (an older app still shows the
-- old refund until its next pull; the server's rows then win).

BEGIN;

CREATE OR REPLACE FUNCTION public.bad_habits_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_tz  text := public.ascend_user_timezone(NEW.user_id);
  v_day date := (now() AT TIME ZONE v_tz)::date;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.bad_habit_logs l
    SET deleted_at = now(), updated_at = greatest(now(), l.updated_at)
    WHERE l.user_id = NEW.user_id AND l.deleted_at IS NULL AND l.data->>'badHabitId' = NEW.id;
  END IF;

  PERFORM public.ascend_recompute_bad_habit_awards(NEW.user_id, v_day, v_tz);
  RETURN NULL;
END;
$function$;

COMMIT;
