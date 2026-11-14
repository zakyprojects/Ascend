-- Deep Focus: a logged session keeps its day.
-- The focus award counts the sessions whose log_date is the user's local today. focus_logs had no
-- date guard (unlike workouts, skill and reading logs), so an UPDATE that moved an earlier
-- session's log_date to today (a direct API write; the app never changes a session's date) made
-- that session earn today's points again.
-- Now an app write can never change an existing session's log_date: the old date is kept and the
-- rest of the write (reflection, delete) still lands. New sessions are unchanged: any day may
-- still be inserted (a session saved late from offline keeps its reflection and earns nothing).
-- No client mirror change: the app never edits log_date (logFocusSession dates a session on the
-- local day it ended; updateFocusLogReflection and deleteFocusLog keep the date).

BEGIN;

CREATE OR REPLACE FUNCTION public.focus_logs_guard_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.log_date := OLD.log_date;
  END IF;
  RETURN NEW;
END;
$function$;

-- Named *_guard_date so it fires before *_keep_newer and *_stamp (triggers run in name order).
CREATE TRIGGER focus_logs_guard_date BEFORE UPDATE ON public.focus_logs
  FOR EACH ROW WHEN (NEW.log_date IS DISTINCT FROM OLD.log_date)
  EXECUTE FUNCTION public.focus_logs_guard_date();

REVOKE ALL ON FUNCTION public.focus_logs_guard_date() FROM PUBLIC, anon, authenticated;

COMMIT;
