-- Item #11: a partner can be removed only through end_partnership_atomic, which sends the other
-- member the "Partner removed" notice and then deletes the pair's challenges and the partnership.
-- Members lose the direct DELETE on partnerships (policy + grant), so no client can remove a
-- partner silently. The revoke matters too: with only the policy gone, a direct delete would
-- "succeed" with 0 rows; without the grant it fails loudly (42501) and old clients roll back.
--
-- RUN ORDER: AFTER the production push of the client commit that removed the direct-delete
-- fallback (deletePartnershipSupabase), with Zakria's explicit go. Studio and production share
-- one Supabase project.
--
-- Not touched: the SELECT policy, end_partnership_atomic and its grants (SECURITY DEFINER, owner
-- postgres), the FK cascades (account delete), INSERT/UPDATE grants.

BEGIN;

DROP POLICY IF EXISTS "Users can delete their own partnerships" ON public.partnerships;
REVOKE DELETE ON public.partnerships FROM anon, authenticated;

COMMIT;

-- Verify (read-only):
--   select policyname, cmd from pg_policies where tablename = 'partnerships';
--     -> only "Users can select their own partnerships" (SELECT)
--   select has_table_privilege('authenticated', 'public.partnerships', 'DELETE');   -> false
--   select relacl from pg_class where oid = 'public.partnerships'::regclass;      -> authenticated=arw
--   select has_function_privilege('authenticated', 'public.end_partnership_atomic(uuid)', 'EXECUTE'); -> true
--
-- Rollback (restores the state before this file):
--   BEGIN;
--   CREATE POLICY "Users can delete their own partnerships" ON public.partnerships
--     FOR DELETE USING ((SELECT auth.uid()) = user1_id OR (SELECT auth.uid()) = user2_id);
--   GRANT DELETE ON public.partnerships TO authenticated;
--   COMMIT;
