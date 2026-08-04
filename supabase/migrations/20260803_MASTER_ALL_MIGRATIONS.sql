-- ====================================================================================
-- ASCEND MASTER DATABASE MIGRATION SCRIPT (SECURED WITH RLS & MULTI-PARTNER COMPOSITE UNIQUE)
-- Run this ENTIRE script in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ====================================================================================

-- 1. PUBLIC.PROFILES COLUMNS & UNIQUE CONSTRAINTS
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_username_change_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS uid VARCHAR(6);

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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_uid_key') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_uid_key UNIQUE (uid);
  END IF;
END $$;

-- Enable RLS on profiles table
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


-- 2. PARTNERSHIPS & SHARED CHALLENGES PHASE 3 COLUMNS & MULTI-PARTNER INDEXES
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


-- 3. LIBRARY BOOKS TABLE & RLS
CREATE TABLE IF NOT EXISTS public.library_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curated_book_id TEXT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  description TEXT,
  category TEXT,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'to-read',
  pages_read INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access their own library books" ON public.library_books;

CREATE POLICY "Users can access their own library books"
  ON public.library_books FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 4. IMPROVEMENT PLANS TABLES & RLS
CREATE TABLE IF NOT EXISTS public.improvement_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_username TEXT NOT NULL,
  creator_avatar TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'Personal Growth',
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  copy_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.improvement_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public plans viewable by everyone" ON public.improvement_plans;
DROP POLICY IF EXISTS "Users can insert their own improvement plans" ON public.improvement_plans;
DROP POLICY IF EXISTS "Users can update their own improvement plans" ON public.improvement_plans;
DROP POLICY IF EXISTS "Users can delete their own improvement plans" ON public.improvement_plans;

CREATE POLICY "Public plans viewable by everyone"
  ON public.improvement_plans FOR SELECT
  USING (is_public = true OR auth.uid() = creator_id);

CREATE POLICY "Users can insert their own improvement plans"
  ON public.improvement_plans FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update their own improvement plans"
  ON public.improvement_plans FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE POLICY "Users can delete their own improvement plans"
  ON public.improvement_plans FOR DELETE
  USING (auth.uid() = creator_id);


CREATE TABLE IF NOT EXISTS public.user_plan_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_plan_id UUID REFERENCES public.improvement_plans(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_plan_follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access their own followed plans" ON public.user_plan_follows;

CREATE POLICY "Users can access their own followed plans"
  ON public.user_plan_follows FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 5. PARTNER INVITES, PARTNERSHIPS & SHARED CHALLENGES RLS
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


-- 6. RPC FUNCTIONS
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
  SELECT * INTO v_invite
  FROM public.partner_invites
  WHERE id = p_invite_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invite is no longer available');
  END IF;

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

  DELETE FROM public.partner_invites WHERE id = p_invite_id;

  RETURN jsonb_build_object(
    'success', true,
    'partnership_id', v_partnership_id
  );
END;
$$;

-- 7. GRANT RPC EXECUTION PERMISSIONS
GRANT EXECUTE ON FUNCTION public.get_profile_by_uid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_uid(text) TO anon;
GRANT EXECUTE ON FUNCTION public.accept_partner_invite_atomic(UUID, UUID, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_partner_invite_atomic(UUID, UUID, TEXT, UUID, TEXT) TO anon;


-- 8. NOTIFICATIONS TABLE & RLS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_username TEXT,
  actor_avatar TEXT,
  type VARCHAR(50) NOT NULL,
  title TEXT,
  message TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications for themselves as actor" ON public.notifications;

CREATE POLICY "Users can read their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can insert notifications for recipients"
  ON public.notifications FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND (actor_id IS NULL OR auth.uid() = actor_id))
    OR
    (auth.role() = 'authenticated' OR auth.role() = 'anon')
  );

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = recipient_id);


-- 9. PREVENT PROFILE UID CHANGE TRIGGER
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


-- 10. REALTIME PUBLICATION SETUP
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_invites, public.partnerships, public.shared_challenges, public.notifications;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- 11. REFRESH POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
