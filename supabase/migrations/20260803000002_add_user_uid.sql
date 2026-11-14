-- =====================================================================
-- Migration: Add 6-digit numeric UID to public.profiles table
-- =====================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS uid VARCHAR(6) UNIQUE;

-- Backfill existing profiles without a UID using retry logic for zero collisions
DO $$
DECLARE
  r RECORD;
  new_uid VARCHAR(6);
  exists_uid BOOLEAN;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE uid IS NULL LOOP
    LOOP
      new_uid := lpad(floor(random() * 1000000)::text, 6, '0');
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE uid = new_uid) INTO exists_uid;
      EXIT WHEN NOT exists_uid;
    END LOOP;
    UPDATE public.profiles SET uid = new_uid WHERE id = r.id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
