-- Consent record: which Terms version an account agreed to, and when.
--
-- Sign-up and "Continue as guest" send `terms_version` in the auth metadata (src/lib/auth.ts).
-- When the profile row is created, this trigger copies it from auth.users and stamps the time the
-- auth user was created (the moment of agreeing). The app never writes these columns: on INSERT
-- whatever it sends is replaced from auth.users, and on UPDATE they keep their old values, so a
-- client can neither set nor change them. Accounts from before the Terms keep NULL (not recorded).
--
-- Not enforced on purpose: an installed app on an older bundle signs up without the metadata and
-- must still work; its profile simply gets NULL.
--
-- Privacy: profiles has column-level SELECT grants only, so the new columns are readable by no
-- client role (anon/authenticated get no SELECT on them). The table-level INSERT/UPDATE grant of
-- authenticated covers them, which is why the trigger, not a grant, protects them.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

CREATE OR REPLACE FUNCTION public.profiles_terms_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.terms_version := NULL;
    NEW.terms_accepted_at := NULL;
    SELECT nullif(btrim(u.raw_user_meta_data->>'terms_version'), ''), u.created_at
      INTO NEW.terms_version, NEW.terms_accepted_at
      FROM auth.users u
     WHERE u.id = NEW.id;
    IF NEW.terms_version IS NULL THEN
      NEW.terms_accepted_at := NULL;
    END IF;
  ELSE
    NEW.terms_version := OLD.terms_version;
    NEW.terms_accepted_at := OLD.terms_accepted_at;
  END IF;
  RETURN NEW;
END;
$$;

-- A trigger function only; no client role may call it (new functions get EXECUTE by default).
REVOKE ALL ON FUNCTION public.profiles_terms_from_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_terms_from_auth ON public.profiles;
CREATE TRIGGER profiles_terms_from_auth
BEFORE INSERT OR UPDATE OF terms_version, terms_accepted_at ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_terms_from_auth();

COMMIT;
