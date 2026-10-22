-- Grant and policy hygiene on partnerships and user_data. No behaviour change for the app.
--
-- 1. partnerships: authenticated loses INSERT and UPDATE. No policy allows either (RLS already
--    refuses every direct write), so the grants are noise. Every write runs inside a SECURITY
--    DEFINER function owned by postgres: accept_partner_invite_atomic (INSERT),
--    profiles_propagate_username (UPDATE of the username copies), end_partnership_atomic (DELETE).
--    The app only SELECTs partnerships (supabase.ts fetchPartnershipSupabase / fetchPartnershipsSupabase,
--    realtime). Checked read-only 2026-10-22 17:35 PKT.
-- 2. The {public}-role policies move to authenticated, same expressions: partnerships SELECT,
--    user_data UPDATE. anon has no grant on either table, so {public} only ever meant
--    authenticated in practice. Guests are anonymous Supabase users with the authenticated role,
--    so they keep access. The app's user_data upsert (INSERT ... ON CONFLICT DO UPDATE) uses the
--    INSERT (already authenticated) and UPDATE policies.
-- 3. user_data: the owner DELETE policy is dropped and DELETE revoked. No client, api/ or Edge
--    Function code deletes user_data (only select + upsert in supabase.ts); account deletion
--    removes it by the ON DELETE CASCADE from profiles (delete_own_account and
--    ascend_cleanup_abandoned_guests are SECURITY DEFINER; FK cascades ignore RLS).
--
-- RUN ORDER: AFTER the production push and AFTER 20261022120000_partnerships_no_direct_delete.sql
-- (that file drops the partnerships DELETE policy and grant; this one does not touch them),
-- with Zakria's explicit go. Studio and production share one Supabase project.
-- Snapshot first (standing rule): pg_policies + relacl rows for both tables (the rollback below
-- restores them).
--
-- Not touched: SELECT/INSERT on user_data, SELECT on partnerships, the trigger
-- ascend_keep_rank_celebrated, the FKs, every function and its grants, service_role, postgres.

BEGIN;

REVOKE INSERT, UPDATE ON public.partnerships FROM anon, authenticated;
ALTER POLICY "Users can select their own partnerships" ON public.partnerships TO authenticated;

ALTER POLICY "Users can update their own data" ON public.user_data TO authenticated;
DROP POLICY IF EXISTS "Users can delete their own data" ON public.user_data;
REVOKE DELETE ON public.user_data FROM anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------------------------
-- Verify (read-only):
-- V1 policies (want partnerships: 1 row SELECT {authenticated}; user_data: INSERT, SELECT, UPDATE,
--    all {authenticated}, expressions as before):
--   SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
--   WHERE tablename IN ('partnerships', 'user_data') ORDER BY 1, 3;
-- V2 grants (want partnerships authenticated=r/postgres, user_data authenticated=arw/postgres):
--   SELECT relname, relacl FROM pg_class WHERE oid IN ('public.partnerships'::regclass, 'public.user_data'::regclass);
-- V3 the writers still run as definer (want 3 rows, prosecdef true):
--   SELECT oid::regprocedure, prosecdef FROM pg_proc WHERE proname IN
--   ('accept_partner_invite_atomic', 'profiles_propagate_username', 'end_partnership_atomic');
-- Browser: save a change (user_data upsert), accept an invite, rename (partner name copies), remove a
-- partner, delete a test account.
--
-- ---------------------------------------------------------------------------------------------
-- Rollback (restores the state before this file; postgres role):
--   BEGIN;
--   GRANT INSERT, UPDATE ON public.partnerships TO authenticated;
--   ALTER POLICY "Users can select their own partnerships" ON public.partnerships TO public;
--   ALTER POLICY "Users can update their own data" ON public.user_data TO public;
--   CREATE POLICY "Users can delete their own data" ON public.user_data
--     FOR DELETE USING ((SELECT auth.uid()) = user_id);
--   GRANT DELETE ON public.user_data TO authenticated;
--   COMMIT;
