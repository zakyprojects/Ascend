-- Partner invite notices issued by the server (knowledge/mode-a-batch3a-2026-10-17.md, Batch 3a #6)
-- APPLY BEFORE the studio code that stops the app's own accepted/declined sends.
-- 1. accept_partner_invite_atomic sends partner_invite_accepted itself (same transaction).
-- 2. New decline_partner_invite_atomic: only the invite's recipient; notice + delete in one transaction.
-- Both set the transaction-local flag ascend.server_notice while calling create_notification_atomic,
-- which 20261017071000 (after the production push) uses to ignore the app's own sends of these types.
-- Same dedup keys the app uses, so the current production app makes no duplicates meanwhile.
-- Rest of the live accept definition unchanged.

BEGIN;

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
      p_title => 'Partner Invite Accepted 🎉',
      p_message => COALESCE(v_to_username, v_invite.to_username) || ' accepted your partner invite!',
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
      p_title => 'Partner Invite Declined',
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

REVOKE ALL ON FUNCTION public.decline_partner_invite_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_partner_invite_atomic(uuid) TO authenticated, service_role;

COMMIT;
