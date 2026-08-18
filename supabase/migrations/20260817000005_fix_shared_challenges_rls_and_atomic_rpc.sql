-- =====================================================================
-- FIX SHARED CHALLENGES RLS AND ATOMIC RPC SAVE/DELETE
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =====================================================================

-- 1. Ensure all columns exist on public.shared_challenges
ALTER TABLE public.shared_challenges 
ADD COLUMN IF NOT EXISTS user1_category VARCHAR(50) DEFAULT 'habit',
ADD COLUMN IF NOT EXISTS user1_target TEXT,
ADD COLUMN IF NOT EXISTS user2_category VARCHAR(50) DEFAULT 'habit',
ADD COLUMN IF NOT EXISTS user2_target TEXT,
ADD COLUMN IF NOT EXISTS total_joint_days_completed INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS user1_done_dates JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS user2_done_dates JSONB DEFAULT '[]'::jsonb;

-- 2. Strictly preserve the original partnership-ownership RLS policy on public.shared_challenges
ALTER TABLE public.shared_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access shared challenges for their partnerships" ON public.shared_challenges;
DROP POLICY IF EXISTS "Allow shared challenges access" ON public.shared_challenges;
DROP POLICY IF EXISTS "Allow authenticated and partnership members shared challenges access" ON public.shared_challenges;

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

-- 3. Atomic RPC function to securely save/upsert shared challenges with explicit type conversions
CREATE OR REPLACE FUNCTION public.save_shared_challenge_atomic(
  p_id UUID,
  p_partnership_id UUID,
  p_title TEXT,
  p_target_habit_name TEXT,
  p_duration_days INT,
  p_joint_streak INT DEFAULT 0,
  p_total_joint_days_completed INT DEFAULT 0,
  p_user1_category TEXT DEFAULT 'habit',
  p_user1_target TEXT DEFAULT '',
  p_user2_category TEXT DEFAULT 'habit',
  p_user2_target TEXT DEFAULT '',
  p_user1_done_date TEXT DEFAULT NULL,
  p_user2_done_date TEXT DEFAULT NULL,
  p_user1_done_dates JSONB DEFAULT '[]'::jsonb,
  p_user2_done_dates JSONB DEFAULT '[]'::jsonb,
  p_status TEXT DEFAULT 'active'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_partner_exists BOOLEAN;
  v_challenge public.shared_challenges;
  v_user1_date DATE;
  v_user2_date DATE;
BEGIN
  -- 1. Require authenticated session
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You must be authenticated to create or update a joint pact.'
    );
  END IF;

  -- 2. Verify caller is actually a member of this partnership
  SELECT EXISTS (
    SELECT 1 FROM public.partnerships p
    WHERE p.id = p_partnership_id
    AND (p.user1_id = v_caller_id OR p.user2_id = v_caller_id)
  ) INTO v_partner_exists;

  IF NOT v_partner_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You are not a member of this partnership.'
    );
  END IF;

  -- 3. Safely cast date strings to DATE (null if empty or not provided)
  IF p_user1_done_date IS NOT NULL AND TRIM(p_user1_done_date) <> '' THEN
    v_user1_date := p_user1_done_date::DATE;
  ELSE
    v_user1_date := NULL;
  END IF;

  IF p_user2_done_date IS NOT NULL AND TRIM(p_user2_done_date) <> '' THEN
    v_user2_date := p_user2_done_date::DATE;
  ELSE
    v_user2_date := NULL;
  END IF;

  -- 4. Upsert challenge
  INSERT INTO public.shared_challenges (
    id,
    partnership_id,
    title,
    target_habit_name,
    duration_days,
    joint_streak,
    total_joint_days_completed,
    user1_category,
    user1_target,
    user2_category,
    user2_target,
    user1_done_date,
    user2_done_date,
    user1_done_dates,
    user2_done_dates,
    status
  )
  VALUES (
    p_id,
    p_partnership_id,
    p_title,
    p_target_habit_name,
    p_duration_days,
    COALESCE(p_joint_streak, 0),
    COALESCE(p_total_joint_days_completed, 0),
    COALESCE(p_user1_category, 'habit'),
    COALESCE(p_user1_target, ''),
    COALESCE(p_user2_category, 'habit'),
    COALESCE(p_user2_target, ''),
    v_user1_date,
    v_user2_date,
    COALESCE(p_user1_done_dates, '[]'::jsonb),
    COALESCE(p_user2_done_dates, '[]'::jsonb),
    COALESCE(p_status, 'active')
  )
  ON CONFLICT (id) DO UPDATE SET
    partnership_id = EXCLUDED.partnership_id,
    title = EXCLUDED.title,
    target_habit_name = EXCLUDED.target_habit_name,
    duration_days = EXCLUDED.duration_days,
    joint_streak = EXCLUDED.joint_streak,
    total_joint_days_completed = EXCLUDED.total_joint_days_completed,
    user1_category = EXCLUDED.user1_category,
    user1_target = EXCLUDED.user1_target,
    user2_category = EXCLUDED.user2_category,
    user2_target = EXCLUDED.user2_target,
    user1_done_date = EXCLUDED.user1_done_date,
    user2_done_date = EXCLUDED.user2_done_date,
    user1_done_dates = EXCLUDED.user1_done_dates,
    user2_done_dates = EXCLUDED.user2_done_dates,
    status = EXCLUDED.status
  RETURNING * INTO v_challenge;

  RETURN jsonb_build_object(
    'success', true,
    'challenge_id', v_challenge.id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- 4. Atomic RPC function to securely delete shared challenges with strict authenticated caller ownership verification
CREATE OR REPLACE FUNCTION public.delete_shared_challenge_atomic(
  p_challenge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_partnership_id UUID;
  v_is_member BOOLEAN;
BEGIN
  -- 1. Require authenticated session
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You must be authenticated to delete a joint pact.'
    );
  END IF;

  -- 2. Retrieve partnership ID for target challenge
  SELECT partnership_id INTO v_partnership_id
  FROM public.shared_challenges
  WHERE id = p_challenge_id;

  IF v_partnership_id IS NULL THEN
    -- Already deleted or doesn't exist
    RETURN jsonb_build_object('success', true);
  END IF;

  -- 3. Verify caller belongs to the challenge's partnership
  SELECT EXISTS (
    SELECT 1 FROM public.partnerships p
    WHERE p.id = v_partnership_id
    AND (p.user1_id = v_caller_id OR p.user2_id = v_caller_id)
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You cannot delete a challenge for a partnership you do not belong to.'
    );
  END IF;

  DELETE FROM public.shared_challenges WHERE id = p_challenge_id;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. Grant execution permissions only to authenticated users
GRANT EXECUTE ON FUNCTION public.save_shared_challenge_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shared_challenge_atomic TO authenticated;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
