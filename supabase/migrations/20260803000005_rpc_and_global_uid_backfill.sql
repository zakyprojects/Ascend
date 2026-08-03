-- =====================================================================
-- COMPLETE ASCEND DATABASE MIGRATION SCRIPT
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =====================================================================

-- 1. Add missing columns to public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_username_change_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS uid VARCHAR(6);

-- 2. Backfill EVERY existing row in public.profiles with a unique 6-digit numeric UID
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

-- 3. Add UNIQUE constraint to uid column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_uid_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_uid_key UNIQUE (uid);
  END IF;
END $$;

-- 4. Create SECURITY DEFINER RPC function for cross-user UID lookup
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

-- 5. Grant execution permissions for RPC
GRANT EXECUTE ON FUNCTION public.get_profile_by_uid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_uid(text) TO anon;

-- 6. RLS Policies for public.profiles
DROP POLICY IF EXISTS "Public profile fields are viewable by signed-in users" ON public.profiles;
CREATE POLICY "Public profile fields are viewable by signed-in users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 7. RLS Policies for public.partner_invites
ALTER TABLE public.partner_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view partner invites sent or received by them" ON public.partner_invites;
DROP POLICY IF EXISTS "Users can send partner invites" ON public.partner_invites;
DROP POLICY IF EXISTS "Users can update invites sent to them" ON public.partner_invites;
DROP POLICY IF EXISTS "Allow authenticated partner invite operations" ON public.partner_invites;

CREATE POLICY "Allow authenticated partner invite operations"
  ON public.partner_invites FOR ALL
  TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- 8. RLS Policies for public.partnerships
ALTER TABLE public.partnerships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Partnerships viewable only by paired users" ON public.partnerships;
DROP POLICY IF EXISTS "Partnerships manageable by paired users" ON public.partnerships;
DROP POLICY IF EXISTS "Allow authenticated partnerships operations" ON public.partnerships;

CREATE POLICY "Allow authenticated partnerships operations"
  ON public.partnerships FOR ALL
  TO authenticated
  USING (auth.uid() = user1_id OR auth.uid() = user2_id)
  WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- 9. Trigger to prevent changing uid once set
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

-- 10. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
