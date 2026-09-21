-- =====================================================================
-- ASCEND ROLLBACK SCRIPT: PHASE 0a-1 FUNCTION SECURITY LOCKDOWN
-- Restores previous permissions and recreates public.execute_season_reset
-- Run this in your Supabase SQL Editor if you need to revert Phase 0a-1
-- =====================================================================

-- 1. RECREATE public.execute_season_reset(text)
CREATE OR REPLACE FUNCTION public.execute_season_reset(p_season_name text DEFAULT 'Season Reset')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_history JSONB;
BEGIN
  FOR v_profile IN SELECT id, total_points, season_history FROM public.profiles LOOP
    v_history := COALESCE(v_profile.season_history, '[]'::jsonb);
    v_history := v_history || jsonb_build_object(
      'season_name', p_season_name,
      'final_points', COALESCE(v_profile.total_points, 0),
      'reset_at', NOW()
    );
    UPDATE public.profiles
    SET total_points = 0,
        season_history = v_history
    WHERE id = v_profile.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_season_reset(text) TO anon, authenticated, service_role;

-- 2. RESTORE DEBUG RPCS PERMISSIONS
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
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.func_signature);
  END LOOP;
END $$;

-- 3. RESTORE CRON NOTIFICATION WORKERS PERMISSIONS
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
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.func_signature);
  END LOOP;
END $$;

-- 4. RESTORE ANON EXECUTE PERMISSIONS ON ATOMIC RPCS
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
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.func_signature);
  END LOOP;
END $$;
