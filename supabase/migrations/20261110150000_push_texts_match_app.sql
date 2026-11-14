-- GLB-L5 + backlog #17 (audit 2026-11-10): phone pushes use the app's own words.
--
-- Why: send-push sends the stored title/message as they are, while the app's Notification Center
-- writes its own text from the type (src/lib/notificationMeta.ts). Pushes still read like
-- "Partner Completed Challenge Today" / "Don't break your joint streak!" and
-- "Evening Tracker Check-in 🌙". This rewrites only the text literals in the five functions that
-- create pushed notices; every body is the live definition of 2026-11-10 (pg_get_functiondef) with
-- nothing else changed:
--   notify_partner_invite          partner_invite           'Partner invite' / '<name> wants to be your accountability partner.'
--   accept_partner_invite_atomic   partner_invite_accepted  'Invite accepted' / '<name> is now your partner.'
--   decline_partner_invite_atomic  partner_invite_declined  'Invite declined' (message unchanged)
--   shared_challenges_notify       challenge_created        message '<name> started "<title>" with you.'
--                                  partner_pledge_done      '<name> did today's part' / '<name> finished today's target for "<title>". Your turn.'
--                                  challenge_completed      'Challenge complete' / 'You and <name> finished "<title>".'
--   ascend_send_daily_reminder     daily_reminder           'Evening check-in' / 'Still open today: <items>.'
-- Already matching, untouched: end_partnership_atomic, delete_shared_challenge_atomic, sunday_planning
-- (ascend_run_local_reminders). Not pushed, untouched: the penalty / missed notices.
-- partner_nudge text is written by the app (AccountabilityPartner.tsx), not here.
--
-- Old and new apps: notificationMeta ignores the stored title for these types and reads the
-- challenge name from the first straight-double-quoted text of the message (quoted()); every new
-- message keeps "<title>" in straight quotes, so the in-app text stays the same on 1.2.0 and later.
-- Rows already stored keep their old text (only new notices change).
-- CREATE OR REPLACE keeps owner, grants, SECURITY DEFINER and search_path as they are.
--
-- Order: any time (server-only; prod-compatible). Rollback: re-run the live definitions saved in
-- work/audit-global-fix/rollback/GLB-L5_rollback.sql (snapshot again right before applying).

BEGIN;

-- notify_partner_invite
CREATE OR REPLACE FUNCTION public.notify_partner_invite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM public.create_notification_atomic(
      p_recipient_id := NEW.to_user_id,
      p_actor_id := NEW.from_user_id,
      p_actor_username := NEW.from_username,
      p_actor_avatar := NEW.from_avatar,
      p_type := 'partner_invite',
      p_title := 'Partner invite',
      p_message := COALESCE(NEW.from_username, 'Someone') || ' wants to be your accountability partner.',
      p_payload := jsonb_build_object('inviteId', NEW.id, 'dedupKey', 'partner_invite_' || NEW.id::text)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Ensure notification failure never aborts or rolls back the partner_invite row creation
    NULL;
  END;
  RETURN NEW;
END;
$function$;

-- accept_partner_invite_atomic
CREATE OR REPLACE FUNCTION public.accept_partner_invite_atomic(p_invite_id uuid, p_user1_id uuid, p_user1_username text, p_user2_id uuid, p_user2_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite RECORD;
  v_from_user_id UUID;
  v_to_user_id UUID;
  v_from_username TEXT;
  v_to_username TEXT;
  v_count INT;
  v_partnership_id UUID;
BEGIN
  -- p_user1_id / p_user1_username / p_user2_id / p_user2_username are ignored on purpose:
  -- the partnership is always between the invite's own two users.

  -- Read the invite's two users so both can be locked before the invite row (same lock order
  -- as send_partner_invite_atomic, so the two never deadlock).
  SELECT from_user_id, to_user_id INTO v_from_user_id, v_to_user_id
  FROM public.partner_invites
  WHERE id = p_invite_id AND status = 'pending';

  IF NOT FOUND OR v_from_user_id IS NULL OR v_to_user_id IS NULL OR v_from_user_id = v_to_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invite is no longer available');
  END IF;

  -- Enforce that caller is the intended invite recipient
  IF auth.uid() IS NULL OR auth.uid() != v_to_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('partner_cap:' || LEAST(v_from_user_id, v_to_user_id)::text));
  PERFORM pg_advisory_xact_lock(hashtext('partner_cap:' || GREATEST(v_from_user_id, v_to_user_id)::text));

  -- Lock and re-verify the invite is still pending for the same two users
  SELECT * INTO v_invite
  FROM public.partner_invites
  WHERE id = p_invite_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND OR v_invite.from_user_id IS DISTINCT FROM v_from_user_id
     OR v_invite.to_user_id IS DISTINCT FROM v_to_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invite is no longer available');
  END IF;

  -- Check if active partnership already exists between these users (UUIDs only, no ILIKE)
  SELECT id INTO v_partnership_id
  FROM public.partnerships
  WHERE (user1_id = v_from_user_id AND user2_id = v_to_user_id)
     OR (user1_id = v_to_user_id AND user2_id = v_from_user_id)
  LIMIT 1;

  IF v_partnership_id IS NULL THEN
    -- Cap of 5 for both sides, checked under the locks
    SELECT COUNT(*) INTO v_count
    FROM public.partnerships
    WHERE user1_id = v_to_user_id OR user2_id = v_to_user_id;

    IF v_count >= 5 THEN
      RETURN jsonb_build_object('success', false, 'error', 'You have reached the maximum limit of 5 accountability partners.');
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.partnerships
    WHERE user1_id = v_from_user_id OR user2_id = v_from_user_id;

    IF v_count >= 5 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Target user has reached the maximum limit of 5 accountability partners.');
    END IF;

    SELECT username INTO v_from_username FROM public.profiles WHERE id = v_from_user_id;
    SELECT username INTO v_to_username FROM public.profiles WHERE id = v_to_user_id;

    v_partnership_id := gen_random_uuid();
    INSERT INTO public.partnerships (id, user1_id, user1_username, user2_id, user2_username, paired_at)
    VALUES (
      v_partnership_id,
      v_from_user_id,
      COALESCE(v_from_username, v_invite.from_username),
      v_to_user_id,
      COALESCE(v_to_username, v_invite.to_username),
      NOW()
    );
  END IF;

  -- Delete invite row permanently
  DELETE FROM public.partner_invites WHERE id = p_invite_id;

  -- The sender's "accepted" notice is issued here, in the same transaction as the partnership.
  -- Same dedup key the app used, so an older app's own send makes no duplicate.
  BEGIN
    PERFORM set_config('ascend.server_notice', '1', true);
    PERFORM public.create_notification_atomic(
      p_recipient_id => v_from_user_id,
      p_type => 'partner_invite_accepted',
      p_title => 'Invite accepted',
      p_message => COALESCE(v_to_username, v_invite.to_username) || ' is now your partner.',
      p_payload => jsonb_build_object('partnershipId', v_partnership_id,
                                      'dedupKey', 'partner_invite_accepted_' || v_partnership_id)
    );
    PERFORM set_config('ascend.server_notice', '', true);
  EXCEPTION WHEN OTHERS THEN
    -- A notice must never undo the accept.
    RAISE WARNING 'accept_partner_invite_atomic notice: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'partnership_id', v_partnership_id
  );
END;
$function$;

-- decline_partner_invite_atomic
CREATE OR REPLACE FUNCTION public.decline_partner_invite_atomic(p_invite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite RECORD;
  v_username TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_invite
  FROM public.partner_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  -- Already gone (accepted, cancelled or declined elsewhere): nothing left to decline.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  IF v_invite.to_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Notice first: create_notification_atomic checks the invite still exists between the two.
  BEGIN
    SELECT username INTO v_username FROM public.profiles WHERE id = auth.uid();
    PERFORM set_config('ascend.server_notice', '1', true);
    PERFORM public.create_notification_atomic(
      p_recipient_id => v_invite.from_user_id,
      p_type => 'partner_invite_declined',
      p_title => 'Invite declined',
      p_message => COALESCE(v_username, v_invite.to_username) || ' declined your partner invite.',
      p_payload => jsonb_build_object('inviteId', v_invite.id,
                                      'dedupKey', 'partner_invite_declined_' || v_invite.id)
    );
    PERFORM set_config('ascend.server_notice', '', true);
  EXCEPTION WHEN OTHERS THEN
    -- A notice must never block the decline.
    RAISE WARNING 'decline_partner_invite_atomic notice: %', SQLERRM;
  END;

  DELETE FROM public.partner_invites WHERE id = p_invite_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- shared_challenges_notify
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
        p_message => v_username || ' started "' || NEW.title || '" with you.',
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
        p_title => v_username || ' did today''s part',
        p_message => v_username || ' finished today''s target for "' || NEW.title || '". Your turn.',
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
        p_title => 'Challenge complete',
        p_message => 'You and ' || v_username || ' finished "' || NEW.title || '".',
        p_payload => jsonb_build_object('challengeId', NEW.id, 'dedupKey', 'challenge_completed_' || NEW.id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'shared_challenges_notify: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

-- ascend_send_daily_reminder
CREATE OR REPLACE FUNCTION public.ascend_send_daily_reminder(p_user uuid, p_today date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_today text := to_char(p_today, 'YYYY-MM-DD');
  v_incomplete_habits int;
  v_missing_items text[] := ARRAY[]::text[];
BEGIN
  -- A. Daily habits (completions: string[] legacy or { date: { done } })
  SELECT count(*) INTO v_incomplete_habits
  FROM public.habits h
  WHERE h.user_id = p_user
    AND h.deleted_at IS NULL
    AND coalesce(h.data->>'frequency', 'daily') <> 'weekly'
    AND NOT (
      coalesce(h.data->'completions' @> to_jsonb(v_today), false) OR
      coalesce((h.data->'completions'->v_today->>'done')::boolean, false)
    );

  IF v_incomplete_habits > 0 THEN
    v_missing_items := array_append(v_missing_items, v_incomplete_habits || ' habit' || CASE WHEN v_incomplete_habits > 1 THEN 's' ELSE '' END);
  END IF;

  -- B. Reading
  IF EXISTS (SELECT 1 FROM public.reading_logs r WHERE r.user_id = p_user AND r.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.reading_logs r WHERE r.user_id = p_user AND r.deleted_at IS NULL AND r.data->>'date' = v_today) THEN
    v_missing_items := array_append(v_missing_items, 'reading log');
  END IF;

  -- C. Journal
  IF EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.user_id = p_user AND j.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.user_id = p_user AND j.deleted_at IS NULL AND j.entry_date = p_today) THEN
    v_missing_items := array_append(v_missing_items, 'journal entry');
  END IF;

  -- D. Skill practice
  IF EXISTS (SELECT 1 FROM public.skill_logs s WHERE s.user_id = p_user AND s.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.skill_logs s WHERE s.user_id = p_user AND s.deleted_at IS NULL AND s.data->>'date' = v_today) THEN
    v_missing_items := array_append(v_missing_items, 'skill practice');
  END IF;

  IF coalesce(array_length(v_missing_items, 1), 0) > 0 THEN
    PERFORM public.create_notification_atomic(
      p_recipient_id => p_user,
      p_actor_id => NULL,
      p_actor_username => 'Ascend System',
      p_actor_avatar => '⚡',
      p_type => 'daily_reminder',
      p_title => 'Evening check-in',
      p_message => 'Still open today: ' || array_to_string(v_missing_items, ', ') || '.',
      p_payload => jsonb_build_object('date', v_today, 'missing', v_missing_items, 'dedupKey', 'daily_reminder_' || v_today)
    );
  END IF;
END;
$function$;

COMMIT;

-- Verify (read-only):
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND (p.prosrc LIKE '%Partner Completed Challenge%' OR p.prosrc LIKE '%Evening Tracker%'
--     OR p.prosrc LIKE '%New Partner Invite%' OR p.prosrc LIKE '%Partner Invite Accepted%' OR p.prosrc LIKE '%Shared Challenge Completed%'
--     OR p.prosrc LIKE '%Partner Invite Declined%');   -- 0 rows
--   SELECT proname, prosecdef, proconfig, proacl FROM pg_proc WHERE proname IN ('notify_partner_invite',
--     'accept_partner_invite_atomic', 'decline_partner_invite_atomic', 'shared_challenges_notify',
--     'ascend_send_daily_reminder');   -- same as before
