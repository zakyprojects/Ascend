-- AUTH-M1 (audit 2026-11-10): a profile whose Terms stamp is empty takes it from the auth user on
-- its next update.
--
-- Why: profiles_terms_from_auth copied terms_version only when the profile row was INSERTED and
-- froze both columns on every UPDATE. "Continue with Google" writes terms_version into the auth
-- metadata from the app (recordGoogleTermsConsent) just before the profile insert; when the insert
-- landed first (two loads of the same sign-in at once, unverified), the profile kept NULL for good.
-- Live 2026-11-10: 1 of 9 Google profiles had NULL while its auth metadata held '2026-10-20'.
--
-- Change: on UPDATE, a stamp that is still NULL is filled from auth.users exactly as the INSERT
-- does (version from raw_user_meta_data, time = auth user created_at, the moment of agreeing).
-- A stamp that is set never changes, and the app's own values are still ignored on both paths.
-- The trigger now fires on every UPDATE (not only of the two columns), so any later profile write
-- (points, avatar, settings) heals an empty stamp. The cost: one assignment per update, and one
-- auth.users lookup only while the stamp is NULL (1 profile today).
--
-- Same as before: the metadata is what the client sent at sign-up (the INSERT path trusts it the
-- same way); accounts with no terms_version in metadata keep NULL.
--
-- Order: any time (independent of the app build). Then run
-- 20261110130100_repair_google_terms_stamp.sql for the one existing profile.

BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_terms_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.terms_version IS NOT NULL THEN
    NEW.terms_version := OLD.terms_version;
    NEW.terms_accepted_at := OLD.terms_accepted_at;
    RETURN NEW;
  END IF;

  -- INSERT, or an UPDATE of a profile still without a stamp: from the auth user only.
  NEW.terms_version := NULL;
  NEW.terms_accepted_at := NULL;
  SELECT nullif(btrim(u.raw_user_meta_data->>'terms_version'), ''), u.created_at
    INTO NEW.terms_version, NEW.terms_accepted_at
    FROM auth.users u
   WHERE u.id = NEW.id;
  IF NEW.terms_version IS NULL THEN
    NEW.terms_accepted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_terms_from_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_terms_from_auth ON public.profiles;
CREATE TRIGGER profiles_terms_from_auth
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_terms_from_auth();

COMMIT;

-- Verify (read-only):
--   SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'profiles_terms_from_auth';
--   -> BEFORE INSERT OR UPDATE ON public.profiles ...
