-- =====================================================================
-- ASCEND ATOMIC PARTNER INVITE RPC MIGRATION
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =====================================================================

-- 1. Create single canonical atomic function to send partner invites
CREATE OR REPLACE FUNCTION public.send_partner_invite_atomic(
  p_invite_id UUID,
  p_from_user_id UUID,
  p_from_username TEXT,
  p_from_avatar TEXT,
  p_to_user_id UUID,
  p_to_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_existing_partner UUID;
  v_invite public.partner_invites;
BEGIN
  -- 1. Validate inputs
  IF p_from_user_id IS NULL OR p_to_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender and recipient IDs must be provided.');
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot send an invite to yourself.');
  END IF;

  -- 2. Check if already active partners
  SELECT id INTO v_existing_partner
  FROM public.partnerships
  WHERE (user1_id = p_from_user_id AND user2_id = p_to_user_id)
     OR (user1_id = p_to_user_id AND user2_id = p_from_user_id)
     OR (user1_username ILIKE p_from_username AND user2_username ILIKE p_to_username)
     OR (user1_username ILIKE p_to_username AND user2_username ILIKE p_from_username)
  LIMIT 1;

  IF v_existing_partner IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are already accountability partners.');
  END IF;

  -- 3. Check if sender or recipient already has 5 partners
  SELECT COUNT(*) INTO v_count
  FROM public.partnerships
  WHERE user1_id = p_from_user_id OR user2_id = p_from_user_id;

  IF v_count >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have reached the maximum limit of 5 accountability partners.');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.partnerships
  WHERE user1_id = p_to_user_id OR user2_id = p_to_user_id;

  IF v_count >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user has reached the maximum limit of 5 accountability partners.');
  END IF;

  -- 4. Clean up any stale or existing invites between these two users
  DELETE FROM public.partner_invites
  WHERE (from_user_id = p_from_user_id AND to_user_id = p_to_user_id)
     OR (from_user_id = p_to_user_id AND to_user_id = p_from_user_id)
     OR (from_username ILIKE p_from_username AND to_username ILIKE p_to_username)
     OR (from_username ILIKE p_to_username AND to_username ILIKE p_from_username);

  -- 5. Insert new pending invite (runs with SECURITY DEFINER privileges)
  INSERT INTO public.partner_invites (
    id,
    from_user_id,
    from_username,
    from_avatar,
    to_user_id,
    to_username,
    status,
    created_at
  )
  VALUES (
    p_invite_id,
    p_from_user_id,
    p_from_username,
    COALESCE(p_from_avatar, '🧑'),
    p_to_user_id,
    p_to_username,
    'pending',
    NOW()
  )
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'success', true,
    'invite_id', v_invite.id
  );
END;
$$;

-- 2. Grant execution permissions on the RPC function to standard roles
GRANT EXECUTE ON FUNCTION public.send_partner_invite_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
