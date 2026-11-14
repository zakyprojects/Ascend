-- Partners: a shared challenge is deleted only through delete_shared_challenge_atomic (which tells
-- the other member) or with its partnership (end_partnership_atomic / FK cascade).
-- Before: one FOR ALL policy let either member DELETE the row directly, skipping the notice.
-- After: the same membership check for SELECT / INSERT / UPDATE, no DELETE policy, and DELETE
-- revoked so a direct delete fails loudly (permission denied) instead of silently removing 0 rows.
-- SECURITY DEFINER functions and the partnerships FK cascade run as the owner and are unaffected.
-- App builds since 2026-08-18 (6a76943) delete through the RPC; older builds get an error toast.
-- Safe to run BEFORE the studio test (production already uses the RPC).

BEGIN;

DROP POLICY IF EXISTS "Users can access shared challenges for their partnerships" ON public.shared_challenges;

CREATE POLICY "Members read their shared challenges" ON public.shared_challenges
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.partnerships p
    WHERE p.id = shared_challenges.partnership_id
      AND (p.user1_id = auth.uid() OR p.user2_id = auth.uid())
  ));

CREATE POLICY "Members add shared challenges" ON public.shared_challenges
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.partnerships p
    WHERE p.id = shared_challenges.partnership_id
      AND (p.user1_id = auth.uid() OR p.user2_id = auth.uid())
  ));

CREATE POLICY "Members update their shared challenges" ON public.shared_challenges
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.partnerships p
    WHERE p.id = shared_challenges.partnership_id
      AND (p.user1_id = auth.uid() OR p.user2_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.partnerships p
    WHERE p.id = shared_challenges.partnership_id
      AND (p.user1_id = auth.uid() OR p.user2_id = auth.uid())
  ));

REVOKE DELETE ON public.shared_challenges FROM anon, authenticated;

COMMIT;

-- Verify (read-only):
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'shared_challenges';  -- SELECT, INSERT, UPDATE only
-- SELECT has_table_privilege('authenticated', 'public.shared_challenges', 'DELETE');  -- false
