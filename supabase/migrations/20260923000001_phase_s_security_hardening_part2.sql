-- Migration: Phase S Security Hardening - Part 2 (Strict Lockdown)
-- ==============================================================================================
-- CRITICAL DEPLOYMENT ORDER INSTRUCTION:
-- DO NOT RUN THIS MIGRATION UNTIL THE CLIENT RELEASE (WITH FIX 1, FIX 2, AND OBSOLETE CODE REMOVAL)
-- FROM MIGRATION A'S CYCLE IS CONFIRMED FULLY LIVE IN PRODUCTION.
-- ==============================================================================================
-- Changes applied:
-- 1. Drops the old open notifications INSERT policies permanently (all client notifications go via RPC).
-- 2. Restricts partnerships RLS from open ALL to explicit SELECT and DELETE only.
-- 3. Replaces partner_invites RLS with granular SELECT, DELETE, and INSERT policies.
-- 4. Permanently drops user1_allow_stats and user2_allow_stats columns from partnerships table.

-- ============================================================================
-- 1. NOTIFICATIONS RLS: Drop direct INSERT policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert notifications for recipients" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;


-- ============================================================================
-- 2. PARTNERSHIPS RLS: Replace open ALL policy with SELECT and DELETE only
-- ============================================================================

DROP POLICY IF EXISTS "Users can access their own partnerships" ON public.partnerships;
DROP POLICY IF EXISTS "Users can view their own partnerships" ON public.partnerships;
DROP POLICY IF EXISTS "Users can delete their own partnerships" ON public.partnerships;
DROP POLICY IF EXISTS "Users can select their own partnerships" ON public.partnerships;

CREATE POLICY "Users can select their own partnerships"
  ON public.partnerships FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can delete their own partnerships"
  ON public.partnerships FOR DELETE
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);


-- ============================================================================
-- 3. PARTNER INVITES RLS: Distinct SELECT, DELETE, and INSERT policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can access their own partner invites" ON public.partner_invites;
DROP POLICY IF EXISTS "Users can select their own partner invites" ON public.partner_invites;
DROP POLICY IF EXISTS "Users can delete their own partner invites" ON public.partner_invites;
DROP POLICY IF EXISTS "Users can insert partner invites" ON public.partner_invites;

CREATE POLICY "Users can select their own partner invites"
  ON public.partner_invites FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can delete their own partner invites"
  ON public.partner_invites FOR DELETE
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can insert partner invites"
  ON public.partner_invites FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);


-- ============================================================================
-- 4. PARTNERSHIPS SCHEMA: Drop obsolete allow_stats columns
-- ============================================================================

ALTER TABLE public.partnerships DROP COLUMN IF EXISTS user1_allow_stats;
ALTER TABLE public.partnerships DROP COLUMN IF EXISTS user2_allow_stats;
