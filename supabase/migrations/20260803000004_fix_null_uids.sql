-- =====================================================================
-- Migration: Backfill any profiles rows where uid IS NULL
-- =====================================================================

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

-- Update RLS to explicitly allow public lookup of (id, username, avatar, uid, is_profile_public)
DROP POLICY IF EXISTS "Public profile fields are viewable by signed-in users" ON public.profiles;

CREATE POLICY "Public profile fields are viewable by signed-in users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
