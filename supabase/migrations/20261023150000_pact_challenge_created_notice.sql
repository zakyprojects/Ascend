-- Pacts: the partner gets a "New challenge" notice when a challenge is created (studio, pact backlog
-- Mode B 2026-10-23; Mode A knowledge/mode-a-backlog-pacts-2026-10-23.md §3 #7a).
--
-- In plain words: when you start a challenge with a partner, they get one notice (in the app, and a
-- push if they have pushes on) saying you started it. It respects their "Partner activity" setting
-- and is capped at 3 per 24 hours from one partner to the other, like nudges.
--
-- What changes:
--   1. public.shared_challenges_notify(): a new INSERT branch sends 'challenge_created' to the
--      partner (dedupKey challenge_created_<id>, so a challenge is announced at most once). The
--      UPDATE logic is unchanged. Re-saves never repeat it: the save RPC's ON CONFLICT DO UPDATE
--      fires UPDATE triggers, not INSERT ones.
--   2. Trigger shared_challenges_notify now fires AFTER INSERT OR UPDATE (was AFTER UPDATE).
--   3. public.create_notification_atomic(): 'challenge_created' joins the server-only types (a
--      member's direct call at trigger depth 0 is dropped), the partner-activity actor and
--      partnership branches (sender and recipient must be partners), the 3-per-24-h per
--      sender -> recipient cap (shared with partner_nudge, counted per type) and the
--      notif_partner_activity preference. Nothing else in it changes.
-- A challenge that starts ticked (habit already done) sends "New challenge" and then
-- "completed today" (Zakria 2026-10-23: OK).
--
-- Same signatures, no overload to drop. Both stay SECURITY DEFINER with their live pinned
-- search_path (create_notification_atomic 'public', the trigger function ''). CREATE OR REPLACE
-- keeps the ACLs; the GRANT/REVOKEs below restate the live ones (read 2026-10-23):
--   create_notification_atomic: postgres, authenticated, service_role (no anon, no PUBLIC)
--   shared_challenges_notify:   postgres, service_role
--
-- Based on the live bodies read 2026-10-23 ~15:00 PKT,
--   create_notification_atomic md5(replace(prosrc, chr(13), '')) = f21cfc99ec92de5970b2d5dbecddf0c3
--   shared_challenges_notify   md5(replace(prosrc, chr(13), '')) = 7f24c977562a90c549351e88146b3595
-- (the rollback below is those bodies). Re-check both md5s right before applying.
--
-- Production-compatible: safe to run BEFORE the studio test. The notifications table has no type
-- check; production's current app shows an unknown type as a plain notice (bell, title, message,
-- no link), and send-push opens the dashboard for it until the new send-push is deployed.
-- Failure inside the notify trigger is caught (RAISE WARNING), so a notice can never block a
-- challenge from being created.

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

  IF p_type IN ('partner_nudge', 'challenge_completed', 'challenge_created', 'partner_pledge_done', 'partner_missed_habit') AND v_notif_partner_activity IS FALSE THEN
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

REVOKE ALL ON FUNCTION public.create_notification_atomic(uuid, uuid, text, text, character varying, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification_atomic(uuid, uuid, text, text, character varying, text, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shared_challenges_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_user1 boolean;
  v_partner  uuid;
  v_username text;
  v_today    text;
  v_old_own  text[];
  v_new_own  text[];
  v_duration integer;
  v_old_total integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT (p.user1_id = v_uid), CASE WHEN p.user1_id = v_uid THEN p.user2_id ELSE p.user1_id END
    INTO v_is_user1, v_partner
    FROM public.partnerships p
    WHERE p.id = NEW.partnership_id AND (p.user1_id = v_uid OR p.user2_id = v_uid);
    IF v_partner IS NULL THEN
      RETURN NULL;
    END IF;

    SELECT pr.username INTO v_username FROM public.profiles pr WHERE pr.id = v_uid;
    v_username := coalesce(v_username, 'User');
    -- A new challenge: the partner is told once (dedup per challenge). It starts empty (guard),
    -- so a pact that starts ticked sends its "completed today" from the save after this one.
    IF TG_OP = 'INSERT' THEN
      PERFORM public.create_notification_atomic(
        p_recipient_id => v_partner,
        p_actor_id => v_uid,
        p_type => 'challenge_created',
        p_title => 'New challenge',
        p_message => v_username || ' started the challenge "' || NEW.title || '" with you.',
        p_payload => jsonb_build_object('challengeId', NEW.id, 'dedupKey', 'challenge_created_' || NEW.id)
      );
      RETURN NULL;
    END IF;

    v_today := to_char((now() AT TIME ZONE coalesce(public.ascend_own_timezone(v_uid), 'Asia/Karachi'))::date, 'YYYY-MM-DD');

    IF v_is_user1 THEN
      v_old_own := public.ascend_pact_dates(OLD.user1_done_dates, OLD.user1_done_date);
      v_new_own := public.ascend_pact_dates(NEW.user1_done_dates, NEW.user1_done_date);
    ELSE
      v_old_own := public.ascend_pact_dates(OLD.user2_done_dates, OLD.user2_done_date);
      v_new_own := public.ascend_pact_dates(NEW.user2_done_dates, NEW.user2_done_date);
    END IF;

    IF v_today = ANY (v_new_own) AND NOT v_today = ANY (v_old_own) THEN
      PERFORM public.create_notification_atomic(
        p_recipient_id => v_partner,
        p_actor_id => v_uid,
        p_type => 'partner_pledge_done',
        p_title => 'Partner Completed Challenge Today',
        p_message => v_username || ' completed today''s target for "' || NEW.title || '"! Don''t break your joint streak!',
        p_payload => jsonb_build_object('challengeId', NEW.id, 'dateKey', v_today,
                                        'dedupKey', 'partner_pledge_done_' || NEW.id || '_' || v_today)
      );
    END IF;

    SELECT count(*) INTO v_old_total FROM (
      SELECT unnest(public.ascend_pact_dates(OLD.user1_done_dates, OLD.user1_done_date))
      INTERSECT
      SELECT unnest(public.ascend_pact_dates(OLD.user2_done_dates, OLD.user2_done_date))
    ) j;
    v_duration := coalesce(NEW.duration_days, 7);
    IF v_old_total < v_duration
       AND coalesce(NEW.total_joint_days_completed, 0) >= v_duration THEN
      PERFORM public.create_notification_atomic(
        p_recipient_id => v_partner,
        p_actor_id => v_uid,
        p_type => 'challenge_completed',
        p_title => 'Shared Challenge Completed! 🎉',
        p_message => 'Congratulations! You and ' || v_username || ' completed the "' || NEW.title || '" challenge!',
        p_payload => jsonb_build_object('challengeId', NEW.id, 'dedupKey', 'challenge_completed_' || NEW.id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'shared_challenges_notify: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.shared_challenges_notify() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_challenges_notify() TO service_role;

CREATE OR REPLACE TRIGGER shared_challenges_notify
  AFTER INSERT OR UPDATE ON public.shared_challenges
  FOR EACH ROW EXECUTE FUNCTION public.shared_challenges_notify();

COMMIT;

-- ROLLBACK (the live state before this file). Run in one transaction:
--   1. the trigger back to AFTER UPDATE only:
-- CREATE OR REPLACE TRIGGER shared_challenges_notify
--   AFTER UPDATE ON public.shared_challenges
--   FOR EACH ROW EXECUTE FUNCTION public.shared_challenges_notify();
--   2. the live create_notification_atomic body (one statement), then the REVOKE/GRANT above:
-- CREATE OR REPLACE FUNCTION public.create_notification_atomic(p_recipient_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_actor_username text DEFAULT NULL::text, p_actor_avatar text DEFAULT NULL::text, p_type character varying DEFAULT 'system'::character varying, p_title text DEFAULT NULL::text, p_message text DEFAULT ''::text, p_payload jsonb DEFAULT '{}'::jsonb)
--  RETURNS uuid
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_actor_id UUID;
--   v_actor_username TEXT;
--   v_actor_avatar TEXT;
--   v_notif_id UUID;
--   v_dedup_key TEXT;
--   v_notif_partner_activity BOOLEAN := TRUE;
--   v_notif_league_updates BOOLEAN := TRUE;
--   v_notif_daily_reminder BOOLEAN := TRUE;
--   v_notif_sunday_planning BOOLEAN := TRUE;
-- BEGIN
--   -- Server-issued only (Security B1): the invite trigger and the recovery awards send these, the
--   -- midnight penalty job sends the missed-habit notices. A member's own call is dropped, so no
--   -- member can push free text or repeat these.
--   IF p_type IN ('partner_invite', 'addiction_milestone', 'partner_missed_habit',
--                 'missed_habit', 'bad_habit_no_report', 'missed_exercise_target')
--      AND auth.uid() IS NOT NULL AND pg_catalog.pg_trigger_depth() = 0 THEN
--     RETURN NULL;
--   END IF;
--
--   IF p_type IN ('partner_pledge_done', 'challenge_completed')
--      AND auth.uid() IS NOT NULL AND pg_catalog.pg_trigger_depth() = 0 THEN
--     RETURN NULL;
--   END IF;
--
--   IF p_type IN ('partner_invite_accepted', 'partner_invite_declined', 'partner_removed', 'challenge_deleted')
--      AND auth.uid() IS NOT NULL
--      AND coalesce(current_setting('ascend.server_notice', true), '') <> '1' THEN
--     RETURN NULL;
--   END IF;
--
--   IF auth.uid() IS NOT NULL THEN
--     v_actor_id := auth.uid();
--   ELSIF p_type IN ('partner_pledge_done', 'challenge_completed', 'partner_missed_habit', 'partner_nudge') THEN
--     v_actor_id := p_actor_id;
--   ELSE
--     v_actor_id := NULL;
--   END IF;
--
--   IF v_actor_id IS NOT NULL THEN
--     SELECT username, avatar INTO v_actor_username, v_actor_avatar
--     FROM public.profiles
--     WHERE id = v_actor_id;
--
--     IF v_actor_username IS NULL THEN
--       v_actor_username := COALESCE(p_actor_username, 'User');
--     END IF;
--     IF v_actor_avatar IS NULL THEN
--       v_actor_avatar := COALESCE(p_actor_avatar, '🧑');
--     END IF;
--   ELSE
--     v_actor_username := NULL;
--     v_actor_avatar := NULL;
--   END IF;
--
--   IF p_type IN ('addiction_milestone', 'missed_habit', 'bad_habit_no_report', 'missed_exercise_target') THEN
--     IF auth.uid() IS NOT NULL AND p_recipient_id != auth.uid() THEN
--       RAISE EXCEPTION 'Unauthorized: recipient must equal authenticated user for self notifications';
--     END IF;
--
--   ELSIF p_type IN ('partner_pledge_done', 'challenge_completed', 'partner_missed_habit', 'partner_nudge') THEN
--     IF v_actor_id IS NULL THEN
--       RAISE EXCEPTION 'Unauthorized: authenticated session required for partner activity notifications';
--     END IF;
--
--     IF NOT EXISTS (
--       SELECT 1 FROM public.partnerships
--       WHERE (user1_id = v_actor_id AND user2_id = p_recipient_id)
--          OR (user2_id = v_actor_id AND user1_id = p_recipient_id)
--     ) THEN
--       RAISE EXCEPTION 'Unauthorized: active partnership required between sender and recipient';
--     END IF;
--
--   ELSIF p_type IN ('partner_invite', 'partner_invite_declined', 'partner_invite_accepted', 'partner_removed', 'challenge_deleted') THEN
--     IF auth.uid() IS NULL THEN
--       RAISE EXCEPTION 'Unauthorized: authenticated session required for invite notifications';
--     END IF;
--
--     IF NOT EXISTS (
--       SELECT 1 FROM public.partner_invites
--       WHERE (from_user_id = auth.uid() AND to_user_id = p_recipient_id)
--          OR (to_user_id = auth.uid() AND from_user_id = p_recipient_id)
--     ) AND NOT EXISTS (
--       SELECT 1 FROM public.partnerships
--       WHERE (user1_id = auth.uid() AND user2_id = p_recipient_id)
--          OR (user2_id = auth.uid() AND user1_id = p_recipient_id)
--     ) THEN
--       RAISE EXCEPTION 'Unauthorized: caller must be a party to the invite or partnership';
--     END IF;
--
--   ELSIF p_type IN ('daily_reminder', 'sunday_planning') OR p_type LIKE 'league_%' THEN
--     IF auth.uid() IS NOT NULL THEN
--       RAISE EXCEPTION 'Unauthorized: system notifications cannot be triggered by authenticated clients';
--     END IF;
--
--   ELSE
--     RAISE EXCEPTION 'Unauthorized or invalid notification type: %', p_type;
--   END IF;
--
--   IF auth.uid() IS NOT NULL THEN
--     p_title := left(p_title, 120);
--     p_message := left(coalesce(p_message, ''), 500);
--     IF length(coalesce(p_payload, '{}'::jsonb)::text) > 2000 THEN
--       RAISE EXCEPTION 'Notification payload too large';
--     END IF;
--     IF p_type = 'partner_nudge' AND (
--       SELECT count(*) FROM public.notifications n
--       WHERE n.recipient_id = p_recipient_id
--         AND n.actor_id = v_actor_id
--         AND n.type = 'partner_nudge'
--         AND n.created_at > now() - interval '24 hours'
--     ) >= 3 THEN
--       RETURN NULL;
--     END IF;
--   END IF;
--
--   SELECT 
--     COALESCE(notif_partner_activity, TRUE),
--     COALESCE(notif_league_updates, TRUE),
--     COALESCE(notif_daily_reminder, TRUE),
--     COALESCE(notif_sunday_planning, TRUE)
--   INTO 
--     v_notif_partner_activity,
--     v_notif_league_updates,
--     v_notif_daily_reminder,
--     v_notif_sunday_planning
--   FROM public.profiles
--   WHERE id = p_recipient_id;
--
--   IF p_type IN ('partner_nudge', 'challenge_completed', 'partner_pledge_done', 'partner_missed_habit') AND v_notif_partner_activity IS FALSE THEN
--     RETURN NULL;
--   END IF;
--
--   IF (p_type LIKE 'league_%' OR p_type IN ('league_reset', 'league_promotion', 'league_demotion', 'league_update')) AND v_notif_league_updates IS FALSE THEN
--     RETURN NULL;
--   END IF;
--
--   IF p_type IN ('daily_reminder') AND v_notif_daily_reminder IS FALSE THEN
--     RETURN NULL;
--   END IF;
--
--   IF p_type IN ('sunday_planning') AND v_notif_sunday_planning IS FALSE THEN
--     RETURN NULL;
--   END IF;
--
--   v_dedup_key := p_payload->>'dedupKey';
--
--   IF v_dedup_key IS NOT NULL THEN
--     INSERT INTO public.notifications (
--       recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
--     )
--     VALUES (
--       p_recipient_id, v_actor_id, v_actor_username, v_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
--     )
--     ON CONFLICT (recipient_id, ((payload->>'dedupKey'))) WHERE (payload->>'dedupKey') IS NOT NULL
--     DO NOTHING
--     RETURNING id INTO v_notif_id;
--
--     IF v_notif_id IS NULL THEN
--       SELECT id INTO v_notif_id
--       FROM public.notifications
--       WHERE recipient_id = p_recipient_id AND payload->>'dedupKey' = v_dedup_key
--       LIMIT 1;
--     END IF;
--   ELSE
--     INSERT INTO public.notifications (
--       recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
--     )
--     VALUES (
--       p_recipient_id, v_actor_id, v_actor_username, v_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
--     )
--     RETURNING id INTO v_notif_id;
--   END IF;
--
--   RETURN v_notif_id;
-- END;
-- $function$;
--   3. the live shared_challenges_notify body (one statement), then the REVOKE/GRANT above:
-- CREATE OR REPLACE FUNCTION public.shared_challenges_notify()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
-- DECLARE
--   v_uid      uuid := auth.uid();
--   v_is_user1 boolean;
--   v_partner  uuid;
--   v_username text;
--   v_today    text;
--   v_old_own  text[];
--   v_new_own  text[];
--   v_duration integer;
--   v_old_total integer;
-- BEGIN
--   IF v_uid IS NULL THEN
--     RETURN NULL;
--   END IF;
--
--   BEGIN
--     SELECT (p.user1_id = v_uid), CASE WHEN p.user1_id = v_uid THEN p.user2_id ELSE p.user1_id END
--     INTO v_is_user1, v_partner
--     FROM public.partnerships p
--     WHERE p.id = NEW.partnership_id AND (p.user1_id = v_uid OR p.user2_id = v_uid);
--     IF v_partner IS NULL THEN
--       RETURN NULL;
--     END IF;
--
--     SELECT pr.username INTO v_username FROM public.profiles pr WHERE pr.id = v_uid;
--     v_username := coalesce(v_username, 'User');
--     v_today := to_char((now() AT TIME ZONE coalesce(public.ascend_own_timezone(v_uid), 'Asia/Karachi'))::date, 'YYYY-MM-DD');
--
--     IF v_is_user1 THEN
--       v_old_own := public.ascend_pact_dates(OLD.user1_done_dates, OLD.user1_done_date);
--       v_new_own := public.ascend_pact_dates(NEW.user1_done_dates, NEW.user1_done_date);
--     ELSE
--       v_old_own := public.ascend_pact_dates(OLD.user2_done_dates, OLD.user2_done_date);
--       v_new_own := public.ascend_pact_dates(NEW.user2_done_dates, NEW.user2_done_date);
--     END IF;
--
--     IF v_today = ANY (v_new_own) AND NOT v_today = ANY (v_old_own) THEN
--       PERFORM public.create_notification_atomic(
--         p_recipient_id => v_partner,
--         p_actor_id => v_uid,
--         p_type => 'partner_pledge_done',
--         p_title => 'Partner Completed Challenge Today',
--         p_message => v_username || ' completed today''s target for "' || NEW.title || '"! Don''t break your joint streak!',
--         p_payload => jsonb_build_object('challengeId', NEW.id, 'dateKey', v_today,
--                                         'dedupKey', 'partner_pledge_done_' || NEW.id || '_' || v_today)
--       );
--     END IF;
--
--     SELECT count(*) INTO v_old_total FROM (
--       SELECT unnest(public.ascend_pact_dates(OLD.user1_done_dates, OLD.user1_done_date))
--       INTERSECT
--       SELECT unnest(public.ascend_pact_dates(OLD.user2_done_dates, OLD.user2_done_date))
--     ) j;
--     v_duration := coalesce(NEW.duration_days, 7);
--     IF v_old_total < v_duration
--        AND coalesce(NEW.total_joint_days_completed, 0) >= v_duration THEN
--       PERFORM public.create_notification_atomic(
--         p_recipient_id => v_partner,
--         p_actor_id => v_uid,
--         p_type => 'challenge_completed',
--         p_title => 'Shared Challenge Completed! 🎉',
--         p_message => 'Congratulations! You and ' || v_username || ' completed the "' || NEW.title || '" challenge!',
--         p_payload => jsonb_build_object('challengeId', NEW.id, 'dedupKey', 'challenge_completed_' || NEW.id)
--       );
--     END IF;
--   EXCEPTION WHEN OTHERS THEN
--     RAISE WARNING 'shared_challenges_notify: %', SQLERRM;
--   END;
--   RETURN NULL;
-- END;
-- $function$;
-- Notices already sent stay (type 'challenge_created'); the app keeps showing them.
