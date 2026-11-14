-- Security B1: notification and push flood (knowledge/mode-a-security-*-2026-10-19.md, H1 / M2)
--
-- Before: a signed-in member (guests included) could call create_notification_atomic with
-- partner_invite (free text, pushed, uncapped) or addiction_milestone (pushed), and every
-- send_partner_invite_atomic call replaced the pair's invite with a new id, so each call was a
-- new notice + push. send-push had no limit at all.
--
-- 1. create_notification_atomic: partner_invite, addiction_milestone, partner_missed_habit and
--    the midnight self notices are server-issued only (a trigger or a job). The app sends none of
--    them (its only call is partner_nudge, still capped 3 per pair per 24 h).
-- 2. send_partner_invite_atomic: a repeat send keeps the waiting invite (no new push); at most 3
--    invites to the same person and 10 in total per sender per 24 h; the stored avatar comes from
--    the sender's profile (p_from_avatar is ignored, signature unchanged).
-- 3. notifications_send_push: a recipient who got more than 10 pushed notices in 10 minutes gets
--    further ones in the app only.
-- 4. Index for the per-recipient time window (the push backstop and the app's notification list).
-- Same signatures; bodies are the live definitions (pg_get_functiondef, 2026-10-19) plus the
-- marked steps.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_notification_atomic(p_recipient_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_actor_username text DEFAULT NULL::text, p_actor_avatar text DEFAULT NULL::text, p_type character varying DEFAULT 'system'::character varying, p_title text DEFAULT NULL::text, p_message text DEFAULT ''::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Server-issued only (Security B1): the invite trigger and the recovery awards send these, the
  -- midnight penalty job sends the missed-habit notices. A member's own call is dropped, so no
  -- member can push free text or repeat these.
  IF p_type IN ('partner_invite', 'addiction_milestone', 'partner_missed_habit',
                'missed_habit', 'bad_habit_no_report', 'missed_exercise_target')
     AND auth.uid() IS NOT NULL AND pg_catalog.pg_trigger_depth() = 0 THEN
    RETURN NULL;
  END IF;

  IF p_type IN ('partner_pledge_done', 'challenge_completed')
     AND auth.uid() IS NOT NULL AND pg_catalog.pg_trigger_depth() = 0 THEN
    RETURN NULL;
  END IF;

  IF p_type IN ('partner_invite_accepted', 'partner_invite_declined', 'partner_removed', 'challenge_deleted')
     AND auth.uid() IS NOT NULL
     AND coalesce(current_setting('ascend.server_notice', true), '') <> '1' THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_actor_id := auth.uid();
  ELSIF p_type IN ('partner_pledge_done', 'challenge_completed', 'partner_missed_habit', 'partner_nudge') THEN
    v_actor_id := p_actor_id;
  ELSE
    v_actor_id := NULL;
  END IF;

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

  IF p_type IN ('addiction_milestone', 'missed_habit', 'bad_habit_no_report', 'missed_exercise_target') THEN
    IF auth.uid() IS NOT NULL AND p_recipient_id != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: recipient must equal authenticated user for self notifications';
    END IF;

  ELSIF p_type IN ('partner_pledge_done', 'challenge_completed', 'partner_missed_habit', 'partner_nudge') THEN
    IF v_actor_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: authenticated session required for partner activity notifications';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.partnerships
      WHERE (user1_id = v_actor_id AND user2_id = p_recipient_id)
         OR (user2_id = v_actor_id AND user1_id = p_recipient_id)
    ) THEN
      RAISE EXCEPTION 'Unauthorized: active partnership required between sender and recipient';
    END IF;

  ELSIF p_type IN ('partner_invite', 'partner_invite_declined', 'partner_invite_accepted', 'partner_removed', 'challenge_deleted') THEN
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

  ELSIF p_type IN ('daily_reminder', 'sunday_planning') OR p_type LIKE 'league_%' THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Unauthorized: system notifications cannot be triggered by authenticated clients';
    END IF;

  ELSE
    RAISE EXCEPTION 'Unauthorized or invalid notification type: %', p_type;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    p_title := left(p_title, 120);
    p_message := left(coalesce(p_message, ''), 500);
    IF length(coalesce(p_payload, '{}'::jsonb)::text) > 2000 THEN
      RAISE EXCEPTION 'Notification payload too large';
    END IF;
    IF p_type = 'partner_nudge' AND (
      SELECT count(*) FROM public.notifications n
      WHERE n.recipient_id = p_recipient_id
        AND n.actor_id = v_actor_id
        AND n.type = 'partner_nudge'
        AND n.created_at > now() - interval '24 hours'
    ) >= 3 THEN
      RETURN NULL;
    END IF;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.send_partner_invite_atomic(p_invite_id uuid, p_from_user_id uuid, p_from_username text, p_from_avatar text, p_to_user_id uuid, p_to_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT;
  v_existing_partner UUID;
  v_invite public.partner_invites;
  v_from_username TEXT;
  v_from_avatar TEXT;
  v_to_username TEXT;
  v_pending_id UUID;
  v_pair_sent INT;
  v_total_sent INT;
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

  -- Lock both users (fixed order, same as accept_partner_invite_atomic) so the cap holds
  PERFORM pg_advisory_xact_lock(hashtext('partner_cap:' || LEAST(p_from_user_id, p_to_user_id)::text));
  PERFORM pg_advisory_xact_lock(hashtext('partner_cap:' || GREATEST(p_from_user_id, p_to_user_id)::text));

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

  -- Usernames and the sender's avatar come from profiles, not from the caller
  SELECT username, avatar INTO v_from_username, v_from_avatar FROM public.profiles WHERE id = p_from_user_id;
  SELECT username INTO v_to_username FROM public.profiles WHERE id = p_to_user_id;

  -- 3b. Sending again while the caller's invite still waits keeps that invite: same id, no new
  -- notice or push (Security B1).
  SELECT id INTO v_pending_id
  FROM public.partner_invites
  WHERE from_user_id = p_from_user_id AND to_user_id = p_to_user_id AND status = 'pending'
  LIMIT 1;

  IF v_pending_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'invite_id', v_pending_id);
  END IF;

  -- 3c. Flood caps (Security B1), counted from the invite notices the trigger wrote in the last
  -- 24 hours: at most 3 to the same person and 10 in total per sender.
  SELECT count(*) FILTER (WHERE n.recipient_id = p_to_user_id), count(*)
  INTO v_pair_sent, v_total_sent
  FROM public.notifications n
  WHERE n.actor_id = p_from_user_id
    AND n.type = 'partner_invite'
    AND n.created_at > now() - interval '24 hours';

  IF v_pair_sent >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'You can invite the same person 3 times a day. Try again tomorrow.');
  END IF;

  IF v_total_sent >= 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'You can send 10 partner invites a day. Try again tomorrow.');
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
    COALESCE(v_from_username, p_from_username),
    COALESCE(v_from_avatar, '🧑'),
    p_to_user_id,
    COALESCE(v_to_username, p_to_username),
    'pending',
    NOW()
  )
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'success', true,
    'invite_id', v_invite.id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.notifications_send_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions ps WHERE ps.user_id = NEW.recipient_id) THEN
    RETURN NULL;
  END IF;

  -- Flood backstop (Security B1): once a recipient got more than 10 pushed notices in the last
  -- 10 minutes (this one included), further ones stay in the app only.
  IF (SELECT count(*) FROM (
        SELECT 1 FROM public.notifications n
        WHERE n.recipient_id = NEW.recipient_id
          AND n.created_at > now() - interval '10 minutes'
          AND n.type::text <> ALL (ARRAY['missed_habit', 'bad_habit_no_report', 'partner_missed_habit', 'missed_exercise_target'])
        LIMIT 11) recent) > 10 THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT max(ds.decrypted_secret) FILTER (WHERE ds.name = 'ascend_push_url'),
           max(ds.decrypted_secret) FILTER (WHERE ds.name = 'ascend_push_secret')
      INTO v_url, v_secret
    FROM vault.decrypted_secrets ds
    WHERE ds.name IN ('ascend_push_url', 'ascend_push_secret');

    IF v_url IS NULL OR v_secret IS NULL THEN
      RETURN NULL;
    END IF;

    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object('notification_id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-ascend-push-secret', v_secret),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    -- A push is best effort: the in-app notification stands either way.
    RAISE WARNING 'notifications_send_push: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at);

COMMIT;
