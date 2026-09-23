-- Migration: Phase S Security Hardening - Part 1 (Backward-Compatible)
-- Deployed first. Safe with currently-live client code.
-- Adds auth.uid() enforcement, ILIKE removal, explicit search_path, and auto-notify trigger.
-- Retains existing RLS policies and allow_stats columns for zero-downtime transition.

-- ============================================================================
-- 1. NOTIFICATIONS: create_notification_atomic
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_notification_atomic(UUID, UUID, TEXT, TEXT, VARCHAR, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_notification_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

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
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_username TEXT;
  v_actor_avatar TEXT;
  v_notif_id UUID;
  v_dedup_key TEXT;
  v_notif_partner_activity BOOLEAN := TRUE;
  v_notif_league_updates BOOLEAN := TRUE;
  v_notif_daily_reminder BOOLEAN := TRUE;
  v_notif_sunday_planning BOOLEAN := TRUE;
BEGIN
  -- 1. Force actor_id to auth.uid() internally (caller cannot spoof actor identity)
  -- If auth.uid() is NULL, only allowed for service_role / cron / system processes
  IF auth.uid() IS NOT NULL THEN
    v_actor_id := auth.uid();
  ELSE
    v_actor_id := NULL;
  END IF;

  -- 2. Derive actor_username and actor_avatar from public.profiles using enforced auth.uid()
  IF v_actor_id IS NOT NULL THEN
    SELECT username, avatar INTO v_actor_username, v_actor_avatar
    FROM public.profiles
    WHERE id = v_actor_id;

    IF v_actor_username IS NULL THEN
      v_actor_username := COALESCE(p_actor_username, 'User');
    END IF;
    IF v_actor_avatar IS NULL THEN
      v_actor_avatar := COALESCE(p_actor_avatar, '🧑');
    END IF;
  ELSE
    v_actor_username := NULL;
    v_actor_avatar := NULL;
  END IF;

  -- 3. Enforce recipient rules per notification type
  -- SELF types: recipient must equal auth.uid()
  IF p_type IN ('addiction_milestone', 'missed_habit', 'bad_habit_no_report', 'missed_exercise_target') THEN
    IF auth.uid() IS NULL OR p_recipient_id != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: recipient must equal authenticated user for self notifications';
    END IF;

  -- ACTIVE PARTNER types: active partnership row must exist between auth.uid() and recipient
  ELSIF p_type IN ('partner_pledge_done', 'challenge_completed', 'partner_missed_habit', 'partner_nudge') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: authenticated session required for partner activity notifications';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.partnerships
      WHERE (user1_id = auth.uid() AND user2_id = p_recipient_id)
         OR (user2_id = auth.uid() AND user1_id = p_recipient_id)
    ) THEN
      RAISE EXCEPTION 'Unauthorized: active partnership required between sender and recipient';
    END IF;

  -- INVITE PARTY types: caller must be one of the two parties on the relevant invite or partnership
  ELSIF p_type IN ('partner_invite', 'partner_invite_declined', 'partner_invite_accepted') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: authenticated session required for invite notifications';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.partner_invites
      WHERE (from_user_id = auth.uid() AND to_user_id = p_recipient_id)
         OR (to_user_id = auth.uid() AND from_user_id = p_recipient_id)
    ) AND NOT EXISTS (
      SELECT 1 FROM public.partnerships
      WHERE (user1_id = auth.uid() AND user2_id = p_recipient_id)
         OR (user2_id = auth.uid() AND user1_id = p_recipient_id)
    ) THEN
      RAISE EXCEPTION 'Unauthorized: caller must be a party to the invite or partnership';
    END IF;

  -- SYSTEM types: only allowed when auth.uid() IS NULL (cron / service_role context)
  ELSIF p_type IN ('daily_reminder', 'sunday_planning') OR p_type LIKE 'league_%' THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Unauthorized: system notifications cannot be triggered by authenticated clients';
    END IF;

  ELSE
    RAISE EXCEPTION 'Unauthorized or invalid notification type: %', p_type;
  END IF;

  -- 4. Preference gating logic (query recipient preferences from public.profiles)
  SELECT 
    COALESCE(notif_partner_activity, TRUE),
    COALESCE(notif_league_updates, TRUE),
    COALESCE(notif_daily_reminder, TRUE),
    COALESCE(notif_sunday_planning, TRUE)
  INTO 
    v_notif_partner_activity,
    v_notif_league_updates,
    v_notif_daily_reminder,
    v_notif_sunday_planning
  FROM public.profiles
  WHERE id = p_recipient_id;

  -- Enforce preference suppression according to notification type
  IF p_type IN ('partner_nudge', 'challenge_completed', 'partner_pledge_done', 'partner_missed_habit') AND v_notif_partner_activity IS FALSE THEN
    RETURN NULL;
  END IF;

  IF (p_type LIKE 'league_%' OR p_type IN ('league_reset', 'league_promotion', 'league_demotion', 'league_update')) AND v_notif_league_updates IS FALSE THEN
    RETURN NULL;
  END IF;

  IF p_type IN ('daily_reminder') AND v_notif_daily_reminder IS FALSE THEN
    RETURN NULL;
  END IF;

  IF p_type IN ('sunday_planning') AND v_notif_sunday_planning IS FALSE THEN
    RETURN NULL;
  END IF;

  -- 5. Dedup-on-conflict logic & insertion (return only the row ID)
  v_dedup_key := p_payload->>'dedupKey';

  IF v_dedup_key IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
    )
    VALUES (
      p_recipient_id, v_actor_id, v_actor_username, v_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
    )
    ON CONFLICT (recipient_id, ((payload->>'dedupKey'))) WHERE (payload->>'dedupKey') IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_notif_id;

    IF v_notif_id IS NULL THEN
      SELECT id INTO v_notif_id
      FROM public.notifications
      WHERE recipient_id = p_recipient_id AND payload->>'dedupKey' = v_dedup_key
      LIMIT 1;
    END IF;
  ELSE
    INSERT INTO public.notifications (
      recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
    )
    VALUES (
      p_recipient_id, v_actor_id, v_actor_username, v_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
    )
    RETURNING id INTO v_notif_id;
  END IF;

  RETURN v_notif_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification_atomic(UUID, UUID, TEXT, TEXT, VARCHAR, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification_atomic(UUID, UUID, TEXT, TEXT, VARCHAR, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_notification_atomic(UUID, UUID, TEXT, TEXT, VARCHAR, TEXT, TEXT, JSONB) TO authenticated, service_role;


-- ============================================================================
-- 2. PARTNER INVITES: notify_partner_invite trigger AFTER INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_partner_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.create_notification_atomic(
      p_recipient_id := NEW.to_user_id,
      p_actor_id := NEW.from_user_id,
      p_actor_username := NEW.from_username,
      p_actor_avatar := NEW.from_avatar,
      p_type := 'partner_invite',
      p_title := 'New Partner Invite',
      p_message := COALESCE(NEW.from_username, 'Someone') || ' sent you an accountability partner invite!',
      p_payload := jsonb_build_object('inviteId', NEW.id, 'dedupKey', 'partner_invite_' || NEW.id::text)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Ensure notification failure never aborts or rolls back the partner_invite row creation
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_partner_invite ON public.partner_invites;
CREATE TRIGGER trg_notify_partner_invite
  AFTER INSERT ON public.partner_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_partner_invite();


-- ============================================================================
-- 3. PARTNER INVITES: send_partner_invite_atomic (auth.uid() enforced, UUIDs only)
-- ============================================================================

DROP FUNCTION IF EXISTS public.send_partner_invite_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT);

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
  -- 0. Authorization check: caller must be p_from_user_id
  IF auth.uid() IS NULL OR auth.uid() != p_from_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- 1. Validate inputs
  IF p_from_user_id IS NULL OR p_to_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender and recipient IDs must be provided.');
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot send an invite to yourself.');
  END IF;

  -- 2. Check if already active partners (UUIDs only, no ILIKE)
  SELECT id INTO v_existing_partner
  FROM public.partnerships
  WHERE (user1_id = p_from_user_id AND user2_id = p_to_user_id)
     OR (user1_id = p_to_user_id AND user2_id = p_from_user_id)
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

  -- 4. Clean up any stale or existing invites between these two users (UUIDs only, no ILIKE)
  DELETE FROM public.partner_invites
  WHERE (from_user_id = p_from_user_id AND to_user_id = p_to_user_id)
     OR (from_user_id = p_to_user_id AND to_user_id = p_from_user_id);

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

REVOKE ALL ON FUNCTION public.send_partner_invite_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_partner_invite_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.send_partner_invite_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT) TO authenticated;


-- ============================================================================
-- 4. PARTNERSHIPS: accept_partner_invite_atomic
-- Note: Does NOT modify or drop allow_stats columns yet.
-- Lingering old clients reading user1_allow_stats/user2_allow_stats will get NULL for new rows.
-- ============================================================================

DROP FUNCTION IF EXISTS public.accept_partner_invite_atomic(UUID, UUID, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.accept_partner_invite_atomic(
  p_invite_id UUID,
  p_user1_id UUID,
  p_user1_username TEXT,
  p_user2_id UUID,
  p_user2_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_partnership_id UUID;
BEGIN
  -- Lock and verify invite exists and is pending
  SELECT * INTO v_invite
  FROM public.partner_invites
  WHERE id = p_invite_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invite is no longer available');
  END IF;

  -- Enforce that caller is the intended invite recipient
  IF auth.uid() IS NULL OR auth.uid() != v_invite.to_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Check if active partnership already exists between these users (UUIDs only, no ILIKE)
  SELECT id INTO v_partnership_id
  FROM public.partnerships
  WHERE (user1_id = p_user1_id AND user2_id = p_user2_id)
     OR (user1_id = p_user2_id AND user2_id = p_user1_id)
  LIMIT 1;

  IF v_partnership_id IS NULL THEN
    v_partnership_id := gen_random_uuid();
    INSERT INTO public.partnerships (id, user1_id, user1_username, user2_id, user2_username, paired_at)
    VALUES (v_partnership_id, p_user1_id, p_user1_username, p_user2_id, p_user2_username, NOW());
  END IF;

  -- Delete invite row permanently
  DELETE FROM public.partner_invites WHERE id = p_invite_id;

  RETURN jsonb_build_object(
    'success', true,
    'partnership_id', v_partnership_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_partner_invite_atomic(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_partner_invite_atomic(UUID, UUID, TEXT, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_partner_invite_atomic(UUID, UUID, TEXT, UUID, TEXT) TO authenticated;
