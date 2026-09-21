-- =====================================================================
-- ASCEND PHASE 0a-1 MIGRATION: FUNCTION SECURITY AUDIT & PRIVILEGE LOCKDOWN
-- Idempotent privilege revocation & function cleanup
-- =====================================================================

-- S1: DROP UNUSED & UNPROTECTED SEASON RESET FUNCTION
DROP FUNCTION IF EXISTS public.execute_season_reset(text);

-- S2: REVOKE ACCESS ON INTERNAL DEBUG & VERIFICATION RPCS
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_debug_partnership_audit',
        'get_verification_audit'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.func_signature);
  END LOOP;
END $$;

-- S3: REVOKE ACCESS ON PG_CRON BATCH NOTIFICATION WORKERS
-- pg_cron executes as the background job owner; external HTTP RPC access is forbidden.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'process_daily_reminder_notifications',
        'process_sunday_planning_notifications'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.func_signature);
  END LOOP;
END $$;

-- S4: LOCK DOWN AUTHENTICATED ATOMIC RPCS
-- Revoke execution from unauthenticated/anon callers and PUBLIC; ensure authenticated & service_role access.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'send_partner_invite_atomic',
        'accept_partner_invite_atomic',
        'create_notification_atomic',
        'save_shared_challenge_atomic',
        'delete_shared_challenge_atomic'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.func_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.func_signature);
  END LOOP;
END $$;
