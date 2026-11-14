-- =====================================================================
-- COMPLETE ASCEND DATABASE MIGRATION SCRIPT FOR PHASE 3
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

-- 4. Enable RLS and scoped policies for public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profile fields are viewable by signed-in users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by all users" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;

CREATE POLICY "Profiles viewable by all users"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = id);

-- 5. Add Phase 3 columns to public.partnerships and public.shared_challenges
ALTER TABLE public.partnerships ADD COLUMN IF NOT EXISTS user1_allow_stats BOOLEAN DEFAULT FALSE;
ALTER TABLE public.partnerships ADD COLUMN IF NOT EXISTS user2_allow_stats BOOLEAN DEFAULT FALSE;

ALTER TABLE public.shared_challenges ADD COLUMN IF NOT EXISTS user1_category VARCHAR(50) DEFAULT 'habit';
ALTER TABLE public.shared_challenges ADD COLUMN IF NOT EXISTS user1_target TEXT;
ALTER TABLE public.shared_challenges ADD COLUMN IF NOT EXISTS user2_category VARCHAR(50) DEFAULT 'habit';
ALTER TABLE public.shared_challenges ADD COLUMN IF NOT EXISTS user2_target TEXT;

-- Drop legacy single-partner unique constraints that block multi-partner support (up to 5)
ALTER TABLE public.partnerships DROP CONSTRAINT IF EXISTS unique_user2_partner;
ALTER TABLE public.partnerships DROP CONSTRAINT IF EXISTS unique_user1_partner;
ALTER TABLE public.partnerships DROP CONSTRAINT IF EXISTS partnerships_user2_id_key;
ALTER TABLE public.partnerships DROP CONSTRAINT IF EXISTS partnerships_user1_id_key;

-- Add normalized composite unique index to prevent duplicate partnerships between the exact same pair of users
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_pair_idx ON public.partnerships (
  LEAST(user1_id, user2_id),
  GREATEST(user1_id, user2_id)
);

-- 6. Create SECURITY DEFINER RPC function for cross-user UID lookup
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

-- 7. ATOMIC ACCEPT PARTNER INVITE RPC WITH RACE-CONDITION GUARD
CREATE OR REPLACE FUNCTION public.accept_partner_invite_atomic(
  p_invite_id UUID,
  p_user1_id UUID,
  p_user1_username TEXT,
  p_user2_id UUID,
  p_user2_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_partnership_id UUID;
BEGIN
  -- Lock and verify invite exists and is pending
  SELECT * INTO v_invite
  FROM public.partner_invites
  WHERE id = p_invite_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invite is no longer available');
  END IF;

  -- Check if active partnership already exists between these users
  SELECT id INTO v_partnership_id
  FROM public.partnerships
  WHERE (user1_id = p_user1_id AND user2_id = p_user2_id)
     OR (user1_id = p_user2_id AND user2_id = p_user1_id)
     OR (user1_username ILIKE p_user1_username AND user2_username ILIKE p_user2_username)
     OR (user1_username ILIKE p_user2_username AND user2_username ILIKE p_user1_username)
  LIMIT 1;

  IF v_partnership_id IS NULL THEN
    v_partnership_id := gen_random_uuid();
    INSERT INTO public.partnerships (id, user1_id, user1_username, user2_id, user2_username, user1_allow_stats, user2_allow_stats, paired_at)
    VALUES (v_partnership_id, p_user1_id, p_user1_username, p_user2_id, p_user2_username, FALSE, FALSE, NOW());
  END IF;

  -- Delete invite row permanently
  DELETE FROM public.partner_invites WHERE id = p_invite_id;

  RETURN jsonb_build_object(
    'success', true,
    'partnership_id', v_partnership_id
  );
END;
$$;

-- 8. Grant execution permissions for RPCs
GRANT EXECUTE ON FUNCTION public.get_profile_by_uid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_uid(text) TO anon;
GRANT EXECUTE ON FUNCTION public.accept_partner_invite_atomic(UUID, UUID, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_partner_invite_atomic(UUID, UUID, TEXT, UUID, TEXT) TO anon;

-- 9. TIGHTENED RLS Policies for public.partner_invites
ALTER TABLE public.partner_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert partner invites" ON public.partner_invites;
DROP POLICY IF EXISTS "Users can access their own partner invites" ON public.partner_invites;

CREATE POLICY "Users can insert partner invites"
  ON public.partner_invites FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can access their own partner invites"
  ON public.partner_invites FOR ALL
  USING (
    auth.uid() = from_user_id OR
    auth.uid() = to_user_id
  );

-- 10. TIGHTENED RLS Policies for public.partnerships
ALTER TABLE public.partnerships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access their own partnerships" ON public.partnerships;

CREATE POLICY "Users can access their own partnerships"
  ON public.partnerships FOR ALL
  USING (
    auth.uid() = user1_id OR
    auth.uid() = user2_id
  )
  WITH CHECK (
    auth.uid() = user1_id OR
    auth.uid() = user2_id
  );

-- 11. TIGHTENED RLS Policies for public.shared_challenges
ALTER TABLE public.shared_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access shared challenges for their partnerships" ON public.shared_challenges;

CREATE POLICY "Users can access shared challenges for their partnerships"
  ON public.shared_challenges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.partnerships p
      WHERE p.id = shared_challenges.partnership_id
      AND (p.user1_id = auth.uid() OR p.user2_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partnerships p
      WHERE p.id = shared_challenges.partnership_id
      AND (p.user1_id = auth.uid() OR p.user2_id = auth.uid())
    )
  );

-- 12. Add Tables to Supabase Realtime Publication for Sub-Second Push Notifications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_invites, public.partnerships, public.shared_challenges;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 13. Trigger to prevent changing uid once set
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

-- 14. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
