-- Grants catch-up: the migrations now produce the Data API grants the live project holds
-- (live ACLs read 2026-10-24). Until now these came only from Supabase's old automatic grants,
-- which new projects no longer give (and existing projects stop giving to new objects from
-- 2026-10-30). Idempotent; a no-op on the live project, where every grant below already holds.

-- Client tables whose grants came only from the automatic grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.improvement_plans, public.notifications,
  public.partner_invites, public.user_plan_follows TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shared_challenges, public.user_data TO authenticated;
GRANT SELECT ON public.partnerships TO authenticated;
-- SELECT on profiles stays column-level (20261017000000).
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- service_role (Edge Functions): full table access as live. Its sequence grant matters:
-- ascend_sign_in_result is SECURITY INVOKER and inserts into sign_in_failures as service_role.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.sign_in_failures_id_seq,
  public.ascend_guest_cleanup_log_id_seq TO service_role;

-- Pact RPCs: live has no PUBLIC/anon EXECUTE; 20260817000005 granted authenticated but never
-- revoked the default PUBLIC grant.
REVOKE EXECUTE ON FUNCTION
  public.save_shared_challenge_atomic(uuid, uuid, text, text, integer, integer, integer, text, text, text, text, text, text, jsonb, jsonb, text),
  public.delete_shared_challenge_atomic(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.save_shared_challenge_atomic(uuid, uuid, text, text, integer, integer, integer, text, text, text, text, text, text, jsonb, jsonb, text),
  public.delete_shared_challenge_atomic(uuid)
  TO authenticated, service_role;
