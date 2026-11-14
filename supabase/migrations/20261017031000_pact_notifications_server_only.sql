-- Pact notifications server only (work/mode-a-pact-sides-partner-cap-2026-10-16.md, #8)
-- APPLY AFTER the app without its own partner_pledge_done / challenge_completed sends is in production.
-- Since 20261017030000 the shared_challenges trigger issues both notices from the stored pact. This
-- makes create_notification_atomic ignore those two types when a signed-in member calls it directly
-- (outside a trigger), so a member can no longer send a forged "partner done" or "pact completed".
-- Server callers (no auth.uid()) and the trigger are unchanged. Rest of the live definition unchanged.

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
  -- 0. Pact notices come only from the shared_challenges trigger (20261017030000), which issues them
  --    from the stored pact; the app's own sends of these two types are ignored.
  IF p_type IN ('partner_pledge_done', 'challenge_completed')
     AND auth.uid() IS NOT NULL AND pg_catalog.pg_trigger_depth() = 0 THEN
    RETURN NULL;
  END IF;

  -- 1. Force actor_id to auth.uid() internally (caller cannot spoof actor identity)
  -- If auth.uid() is NULL, only allowed for service_role / cron / system processes,
  -- which name the actor themselves for partner activity.
  IF auth.uid() IS NOT NULL THEN
    v_actor_id := auth.uid();
  ELSIF p_type IN ('partner_pledge_done', 'challenge_completed', 'partner_missed_habit', 'partner_nudge') THEN
    v_actor_id := p_actor_id;
  ELSE
    v_actor_id := NULL;
  END IF;

  -- 2. Derive actor_username and actor_avatar from public.profiles using the enforced actor
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
  -- SELF types: recipient must equal auth.uid(); the server (no auth.uid()) may send them to anyone
  IF p_type IN ('addiction_milestone', 'missed_habit', 'bad_habit_no_report', 'missed_exercise_target') THEN
    IF auth.uid() IS NOT NULL AND p_recipient_id != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: recipient must equal authenticated user for self notifications';
    END IF;

  -- ACTIVE PARTNER types: active partnership row must exist between the actor and recipient
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

  -- 3b. What members send is bounded: title and message are cut to a sane length, the payload
  -- is capped, and one member can nudge the same partner at most 3 times per 24 hours
  -- (the app's own once-per-pact-per-day key is chosen by the client, so it limits nothing).
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
$function$;

COMMIT;
