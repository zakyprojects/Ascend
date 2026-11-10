-- AUTH-L2 (audit 2026-11-10): a signed-in user can no longer delete their own profile row over the
-- REST API.
--
-- Why: profiles had the policy "Users can delete their own profile" and authenticated held DELETE.
-- Deleting the row cascaded user_data, improvement_plans, user_plan_follows, partner_invites and
-- partnerships (bypassing the partnership RPCs), and the app then re-inserted the profile on the
-- next load with any username, skipping the 24 h rename cooldown (profiles_guard_username only
-- clears last_username_change_at on INSERT).
--
-- Account deletion is not affected: the app deletes accounts only through delete_own_account()
-- (src/lib/auth.ts deleteOwnAccount; guests' Log out uses it too). That function is SECURITY
-- DEFINER and deletes auth.users; the profile goes by the foreign-key cascade, which needs no
-- client grant or policy. No app code deletes from profiles (grep), and no public function does
-- (catalog check 2026-11-10).
--
-- Order: any time (the app never uses this path).

BEGIN;

DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
REVOKE DELETE ON public.profiles FROM authenticated, anon;

COMMIT;

-- Verify (read-only):
--   SELECT relacl FROM pg_class WHERE oid = 'public.profiles'::regclass;   -- authenticated=aw (no d)
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.profiles'::regclass AND polcmd = 'd';  -- none
