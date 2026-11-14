-- profiles.email is a copy of auth.users.email, kept by the database. Whatever the app
-- writes to it is replaced, so a profile can never carry an address its account does not own.

BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email := (SELECT u.email FROM auth.users u WHERE u.id = NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_email_from_auth ON public.profiles;
CREATE TRIGGER profiles_email_from_auth
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_email_from_auth();

-- Email confirmed / changed on the auth side: refresh the copy (the trigger above reads it).
CREATE OR REPLACE FUNCTION public.auth_users_sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email
  WHERE id = NEW.id AND email IS DISTINCT FROM NEW.email;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_email_from_auth() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_users_sync_profile_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS auth_users_sync_profile_email ON auth.users;
CREATE TRIGGER auth_users_sync_profile_email
AFTER UPDATE OF email ON auth.users
FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION public.auth_users_sync_profile_email();

-- Backfill.
UPDATE public.profiles p SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND p.email IS DISTINCT FROM u.email;

COMMIT;
