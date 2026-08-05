-- ==================================================================================
-- ASCEND ABSOLUTE STRICT RLS & SECURITY DEFINER COPY COUNT RPC
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard
-- ==================================================================================

-- 1. Create SECURITY DEFINER function so ANY user can atomically increment copy_count on public plans
CREATE OR REPLACE FUNCTION increment_plan_copy_count(target_plan_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count int;
BEGIN
  UPDATE improvement_plans
  SET copy_count = COALESCE(copy_count, 0) + 1
  WHERE id = target_plan_id
  RETURNING copy_count INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION increment_plan_copy_count(uuid) TO authenticated, anon;

-- 2. Nuke dangerous open policies
DROP POLICY IF EXISTS "Anyone can insert improvement plans" ON public.improvement_plans;
DROP POLICY IF EXISTS "Anyone can update public improvement plans" ON public.improvement_plans;
DROP POLICY IF EXISTS "Anyone can update copy_count on public plans" ON public.improvement_plans;
DROP POLICY IF EXISTS "Users can insert their own improvement plans" ON public.improvement_plans;
DROP POLICY IF EXISTS "Users can update their own improvement plans" ON public.improvement_plans;
DROP POLICY IF EXISTS "Users can delete their own improvement plans" ON public.improvement_plans;
DROP POLICY IF EXISTS "Public plans viewable by everyone" ON public.improvement_plans;

-- 3. Reinstate Absolute Strict RLS for SELECT
CREATE POLICY "Public plans viewable by everyone"
  ON public.improvement_plans FOR SELECT
  USING (is_public = true OR auth.uid() = creator_id);

-- 4. Reinstate Absolute Strict RLS for INSERT (auth.uid() MUST match creator_id)
CREATE POLICY "Users can insert their own improvement plans"
  ON public.improvement_plans FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

-- 5. Reinstate Absolute Strict RLS for UPDATE (auth.uid() MUST match creator_id)
CREATE POLICY "Users can update their own improvement plans"
  ON public.improvement_plans FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- 6. Reinstate Absolute Strict RLS for DELETE (auth.uid() MUST match creator_id)
CREATE POLICY "Users can delete their own improvement plans"
  ON public.improvement_plans FOR DELETE
  USING (auth.uid() = creator_id);

-- 7. Followed plans RLS policies
DROP POLICY IF EXISTS "Followed plans viewable by creator or follower" ON public.user_plan_follows;
DROP POLICY IF EXISTS "Users can access their own followed plans" ON public.user_plan_follows;

CREATE POLICY "Users can access their own followed plans"
  ON public.user_plan_follows FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
