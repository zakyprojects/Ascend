-- Drop the dead profiles.notif_league_updates column (all 10 profiles true; the Settings toggle
-- left the app in cf8b491, 2026-10-17; nothing sends league_* notifications). Its two readers are
-- replaced first, in the same transaction:
--   create_notification_atomic: the league preference check (variable, SELECT column, IF) goes;
--     everything else is the live body unchanged (same signature, SECURITY DEFINER, search_path).
--   ascend_my_profile: the notif_league_updates key goes (live body had CRLF line endings; LF here).
--     Its LANGUAGE sql body is not dependency-tracked, so dropping the column first would break
--     every own-profile load.
-- Builds older than cf8b491 that still send the column retry their profile save without notif_*
-- fields when the error names one, so they keep saving.
-- Rollback: ALTER TABLE public.profiles ADD COLUMN notif_league_updates boolean DEFAULT true;
-- then restore both previous function bodies (snapshot work/snapshots/notif_league_updates_before_drop_2026-10-24.json).

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
  v_notif_daily_reminder BOOLEAN := TRUE;
  v_notif_sunday_planning BOOLEAN := TRUE;
BEGIN
  -- Server-issued only (Security B1): the invite trigger and the recovery awards send these, the
  -- midnight penalty job sends the missed-habit notices. A member's own call is dropped, so no
  -- member can push free text or repeat these. The shared_challenges triggers send the pact ones.
  IF p_type IN ('partner_invite', 'addiction_milestone', 'partner_missed_habit',
                'missed_habit', 'bad_habit_no_report', 'missed_exercise_target')
     AND auth.uid() IS NOT NULL AND pg_catalog.pg_trigger_depth() = 0 THEN
    RETURN NULL;
  END IF;

  IF p_type IN ('partner_pledge_done', 'challenge_completed', 'challenge_created')
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
  ELSIF p_type IN ('partner_pledge_done', 'challenge_completed', 'challenge_created', 'partner_missed_habit', 'partner_nudge') THEN
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

  ELSIF p_type IN ('partner_pledge_done', 'challenge_completed', 'challenge_created', 'partner_missed_habit', 'partner_nudge') THEN
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
    -- At most 3 nudges / 3 new-challenge notices per sender -> recipient pair in 24 hours.
    IF p_type IN ('partner_nudge', 'challenge_created') AND (
      SELECT count(*) FROM public.notifications n
      WHERE n.recipient_id = p_recipient_id
        AND n.actor_id = v_actor_id
        AND n.type = p_type
        AND n.created_at > now() - interval '24 hours'
    ) >= 3 THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT 
    COALESCE(notif_partner_activity, TRUE),
    COALESCE(notif_daily_reminder, TRUE),
    COALESCE(notif_sunday_planning, TRUE)
  INTO 
    v_notif_partner_activity,
    v_notif_daily_reminder,
    v_notif_sunday_planning
  FROM public.profiles
  WHERE id = p_recipient_id;

  IF p_type IN ('partner_nudge', 'challenge_completed', 'challenge_created', 'partner_pledge_done', 'partner_missed_habit') AND v_notif_partner_activity IS FALSE THEN
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

CREATE OR REPLACE FUNCTION public.ascend_my_profile()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'email', pr.email,
    'notif_daily_reminder', pr.notif_daily_reminder,
    'notif_partner_activity', pr.notif_partner_activity,
    'notif_sunday_planning', pr.notif_sunday_planning,
    'last_username_change_at', pr.last_username_change_at,
    'timezone', pr.timezone,
    'timezone_waiting_since', pr.timezone_waiting_since
  )
  FROM public.profiles pr
  WHERE pr.id = auth.uid();
$function$;

ALTER TABLE public.profiles DROP COLUMN notif_league_updates;

COMMIT;
