-- Partners redesign (2026-10-17): removing a partner or deleting a shared challenge tells the
-- other member, and removing a partner is one atomic server step.
-- Safe to run BEFORE the studio test: additive only. Older app builds keep their direct
-- deletes (no notice); the new app falls back to them while end_partnership_atomic is missing.

-- 1. Two new server-issued notice types: partner_removed, challenge_deleted.
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

  -- 0b. Invite accepted/declined notices come only from accept_partner_invite_atomic and
  --     decline_partner_invite_atomic (20261017070000), which set ascend.server_notice for the call.
  --     Partner-removed / challenge-deleted notices come only from end_partnership_atomic and
  --     delete_shared_challenge_atomic (20261017110000), the same way.
  IF p_type IN ('partner_invite_accepted', 'partner_invite_declined', 'partner_removed', 'challenge_deleted')
     AND auth.uid() IS NOT NULL
     AND coalesce(current_setting('ascend.server_notice', true), '') <> '1' THEN
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

-- 2. Deleting a shared challenge notifies the other member (before the row goes).
CREATE OR REPLACE FUNCTION public.delete_shared_challenge_atomic(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_challenge public.shared_challenges;
  v_partner UUID;
  v_username TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You must be authenticated to delete a challenge.');
  END IF;

  SELECT * INTO v_challenge FROM public.shared_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  SELECT CASE WHEN p.user1_id = v_caller_id THEN p.user2_id ELSE p.user1_id END INTO v_partner
  FROM public.partnerships p
  WHERE p.id = v_challenge.partnership_id AND (p.user1_id = v_caller_id OR p.user2_id = v_caller_id);
  IF v_partner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You cannot delete a challenge for a partnership you do not belong to.');
  END IF;

  BEGIN
    SELECT username INTO v_username FROM public.profiles WHERE id = v_caller_id;
    PERFORM set_config('ascend.server_notice', '1', true);
    PERFORM public.create_notification_atomic(
      p_recipient_id => v_partner,
      p_type => 'challenge_deleted',
      p_title => 'Challenge deleted',
      p_message => coalesce(v_username, 'Your partner') || ' deleted the challenge "' || v_challenge.title || '".',
      p_payload => jsonb_build_object('challengeId', v_challenge.id, 'dedupKey', 'challenge_deleted_' || v_challenge.id)
    );
    PERFORM set_config('ascend.server_notice', '', true);
  EXCEPTION WHEN OTHERS THEN
    -- A notice must never block the delete.
    RAISE WARNING 'delete_shared_challenge_atomic notice: %', SQLERRM;
  END;

  DELETE FROM public.shared_challenges WHERE id = p_challenge_id;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- 3. Removing a partner: notice, the pair's challenges and the partnership go in one transaction.
CREATE OR REPLACE FUNCTION public.end_partnership_atomic(p_partnership_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_partner UUID;
  v_username TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT CASE WHEN p.user1_id = v_caller_id THEN p.user2_id ELSE p.user1_id END INTO v_partner
  FROM public.partnerships p
  WHERE p.id = p_partnership_id AND (p.user1_id = v_caller_id OR p.user2_id = v_caller_id)
  FOR UPDATE;
  IF v_partner IS NULL THEN
    -- Already removed (by either member) or not the caller's: nothing left to do.
    RETURN jsonb_build_object('success', true);
  END IF;

  BEGIN
    SELECT username INTO v_username FROM public.profiles WHERE id = v_caller_id;
    PERFORM set_config('ascend.server_notice', '1', true);
    PERFORM public.create_notification_atomic(
      p_recipient_id => v_partner,
      p_type => 'partner_removed',
      p_title => 'Partner removed',
      p_message => coalesce(v_username, 'Your partner') || ' removed you as a partner.',
      p_payload => jsonb_build_object('partnershipId', p_partnership_id, 'dedupKey', 'partner_removed_' || p_partnership_id)
    );
    PERFORM set_config('ascend.server_notice', '', true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'end_partnership_atomic notice: %', SQLERRM;
  END;

  DELETE FROM public.shared_challenges WHERE partnership_id = p_partnership_id;
  DELETE FROM public.partnerships WHERE id = p_partnership_id;
  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.end_partnership_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_partnership_atomic(uuid) TO authenticated;
