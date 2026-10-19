-- Security B1: drop privileges the app never uses
-- (knowledge/mode-a-security-idor-db-2026-10-19.md L1, L4)
--
-- - authenticated held TRUNCATE (ignores RLS), REFERENCES, TRIGGER and MAINTAIN on the older
--   social tables. PostgREST and Realtime never use them; SELECT/INSERT/UPDATE/DELETE stay as
--   they are (RLS still decides rows).
-- - anon held MAINTAIN on profiles.
-- - The five trigger functions below were executable by PUBLIC and anon. Postgres checks EXECUTE
--   on a trigger function only when the trigger is created, not when it fires, so writes keep
--   working; authenticated keeps its grant.
-- - ascend_own_timezone returns null unless p_user is the caller, so anon never needed it. The
--   app does not call it; only the today guards and pact triggers use it (as authenticated or
--   as the definer).

BEGIN;

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.improvement_plans,
           public.notifications,
           public.partner_invites,
           public.partnerships,
           public.profiles,
           public.shared_challenges,
           public.user_data,
           public.user_plan_follows
  FROM authenticated;

REVOKE MAINTAIN ON TABLE public.profiles FROM anon;

REVOKE EXECUTE ON FUNCTION
  public.check_partner_invite_allowed(),
  public.improvement_plans_guard_server_fields(),
  public.notify_partner_invite(),
  public.profiles_propagate_avatar(),
  public.user_plan_follows_sync_copy_count()
  FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.ascend_own_timezone(uuid) FROM PUBLIC, anon;

COMMIT;
