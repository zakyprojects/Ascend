-- =====================================================================
-- Migration: Enforce immutability of public.profiles.uid column via DB trigger
-- =====================================================================

CREATE OR REPLACE FUNCTION public.prevent_profile_uid_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.uid IS NOT NULL AND NEW.uid IS DISTINCT FROM OLD.uid THEN
    RAISE EXCEPTION 'The uid column is permanent and cannot be changed once set.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_profile_uid_change ON public.profiles;

CREATE TRIGGER trg_prevent_profile_uid_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_uid_change();

NOTIFY pgrst, 'reload schema';
