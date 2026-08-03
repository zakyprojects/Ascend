-- =====================================================================
-- Migration: Global UID Backfill & RPC Lookup Function
-- =====================================================================

-- 1. Backfill EVERY profile row where uid IS NULL or empty right now
DO $$
DECLARE
  r RECORD;
  new_uid VARCHAR(6);
  exists_uid BOOLEAN;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE uid IS NULL OR length(uid) = 0 LOOP
    LOOP
      new_uid := lpad(floor(random() * 1000000)::text, 6, '0');
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE uid = new_uid) INTO exists_uid;
      EXIT WHEN NOT exists_uid;
    END LOOP;
    UPDATE public.profiles SET uid = new_uid WHERE id = r.id;
  END LOOP;
END $$;

-- 2. Create SECURITY DEFINER RPC function for cross-user UID lookup
CREATE OR REPLACE FUNCTION public.get_profile_by_uid(target_uid text)
RETURNS TABLE (
  id uuid,
  username text,
  avatar text,
  uid text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.avatar, p.uid::text
  FROM public.profiles p
  WHERE p.uid = target_uid
  LIMIT 1;
END;
$$;

-- Grant execution to authenticated & anon roles
GRANT EXECUTE ON FUNCTION public.get_profile_by_uid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_uid(text) TO anon;

NOTIFY pgrst, 'reload schema';
