-- Username cooldown on the server, part 2 of 2 (apply AFTER the app that renames through
-- ascend_change_username is in production; older apps rename with a direct update, which would
-- then keep the old name).
-- Direct writes by members can no longer change username or last_username_change_at:
--   * an update keeps both as they are (a stale device saving an old name is ignored too),
--     except that a guest (anonymous sign-in) still picks a username when creating an account;
--   * a new profile starts with no username change on record.
-- ascend_change_username runs as the function owner, so this guard lets it through.

BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_guard_username()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.last_username_change_at := NULL;
    RETURN NEW;
  END IF;
  NEW.last_username_change_at := OLD.last_username_change_at;
  IF NEW.username IS DISTINCT FROM OLD.username
     AND NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  THEN
    NEW.username := OLD.username;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_guard_username ON public.profiles;
CREATE TRIGGER profiles_guard_username
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_username();

COMMIT;
