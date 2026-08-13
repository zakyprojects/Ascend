-- =====================================================================
-- ASCEND ATOMIC NOTIFICATION & DEDUP MIGRATION
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =====================================================================

-- 1. Create expression index for deduplication by recipient_id + payload->>'dedupKey'
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup 
ON public.notifications (recipient_id, ((payload->>'dedupKey'))) 
WHERE (payload->>'dedupKey') IS NOT NULL;

-- 2. Drop ALL existing overloaded versions of create_notification_atomic to prevent HTTP 300 (Multiple Choices)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT oid::regprocedure AS func_signature
    FROM pg_proc
    WHERE proname = 'create_notification_atomic'
      AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'DROP FUNCTION ' || r.func_signature || ' CASCADE';
  END LOOP;
END $$;

-- 3. Create single canonical atomic function
CREATE OR REPLACE FUNCTION public.create_notification_atomic(
  p_recipient_id UUID,
  p_actor_id UUID DEFAULT NULL,
  p_actor_username TEXT DEFAULT NULL,
  p_actor_avatar TEXT DEFAULT NULL,
  p_type VARCHAR DEFAULT 'system',
  p_title TEXT DEFAULT NULL,
  p_message TEXT DEFAULT '',
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notif public.notifications;
  v_dedup_key TEXT;
BEGIN
  v_dedup_key := p_payload->>'dedupKey';

  -- If dedupKey exists, try to insert ON CONFLICT DO NOTHING
  IF v_dedup_key IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
    )
    VALUES (
      p_recipient_id, p_actor_id, p_actor_username, p_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
    )
    ON CONFLICT (recipient_id, ((payload->>'dedupKey'))) WHERE (payload->>'dedupKey') IS NOT NULL
    DO NOTHING
    RETURNING * INTO v_notif;

    -- If conflict occurred, select existing notification row
    IF v_notif.id IS NULL THEN
      SELECT * INTO v_notif
      FROM public.notifications
      WHERE recipient_id = p_recipient_id AND payload->>'dedupKey' = v_dedup_key
      LIMIT 1;
    END IF;
  ELSE
    -- Standard insert without dedup check
    INSERT INTO public.notifications (
      recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
    )
    VALUES (
      p_recipient_id, p_actor_id, p_actor_username, p_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
    )
    RETURNING * INTO v_notif;
  END IF;

  RETURN v_notif;
END;
$$;

-- Grant execution permissions on the RPC function to standard roles
GRANT EXECUTE ON FUNCTION public.create_notification_atomic(UUID, UUID, TEXT, TEXT, VARCHAR, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
