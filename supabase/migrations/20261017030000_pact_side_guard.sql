-- Pact sides guard (work/mode-a-pact-sides-partner-cap-2026-10-16.md, #8)
-- Every app write to shared_challenges sends the whole row, both partners' done dates included,
-- so a partner's stale copy could erase the other's day, and either member could edit any column.
--
-- Now, for a signed-in member (auth.uid() set; the SQL editor, service role and cron are not limited):
--   * Create: the member must be in the partnership; the pact starts empty (no dates, streak and
--     total 0, active, created now). A save of a pact that already exists is left to the update rules
--     (an upsert runs the insert trigger first, and its values become EXCLUDED).
--   * Update: the member's side comes from the stored row's partnership (not a member -> error).
--     The pact itself (id, partnership, created_at, title, target habit, duration, both sides'
--     category and target) and the partner's done dates are kept as stored. On the member's own
--     side, past days are kept as stored and only today (the member's own timezone, as the other
--     "today" guards) follows the write. Total, status and streak follow the dates, the same way the
--     app reconciles them (pactLifecycle.ts). Anything else is ignored silently, so the old app keeps
--     working and the realtime echo corrects its screen.
--   * The partner hears about it from the server, from the stored row, in the same transaction:
--     partner_pledge_done when the member ticks today, challenge_completed when the joint total
--     reaches the duration. Same dedup keys as the app, so the app's own sends make no duplicates.
--     (20261017031000, after the app without those sends is in production, stops the app's sends.)
--   * save_shared_challenge_atomic checks membership of the stored row's partnership when the pact
--     exists, so a pact of another pair can no longer be taken over by its id.

BEGIN;

-- Dates of one side: the array plus the legacy single date, distinct and sorted.
CREATE OR REPLACE FUNCTION public.ascend_pact_dates(p_dates jsonb, p_date date)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT coalesce(array_agg(DISTINCT d ORDER BY d), '{}'::text[])
  FROM (
    SELECT e.value AS d
    FROM pg_catalog.jsonb_array_elements_text(
      CASE WHEN pg_catalog.jsonb_typeof(p_dates) = 'array' THEN p_dates ELSE '[]'::jsonb END) AS e(value)
    WHERE e.value ~ '^\d{4}-\d{2}-\d{2}$'
    UNION
    SELECT to_char(p_date, 'YYYY-MM-DD') WHERE p_date IS NOT NULL
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.shared_challenges_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_user1 boolean;
  v_today    text;
  v_tz       text;
  v_own      text[];
  v_new_own  text[];
  v_u1       text[];
  v_u2       text[];
  v_total    integer;
  v_duration integer;
  v_elapsed  integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- An upsert of an existing pact: the update rules below decide what changes.
    IF EXISTS (SELECT 1 FROM public.shared_challenges sc WHERE sc.id = NEW.id) THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.partnerships p
      WHERE p.id = NEW.partnership_id AND (p.user1_id = v_uid OR p.user2_id = v_uid)
    ) THEN
      RAISE EXCEPTION 'Unauthorized: You are not a member of this partnership.';
    END IF;
    NEW.created_at := now();
    NEW.user1_done_dates := '[]'::jsonb;
    NEW.user2_done_dates := '[]'::jsonb;
    NEW.user1_done_date := NULL;
    NEW.user2_done_date := NULL;
    NEW.joint_streak := 0;
    NEW.total_joint_days_completed := 0;
    NEW.status := 'active';
    RETURN NEW;
  END IF;

  SELECT (p.user1_id = v_uid) INTO v_is_user1
  FROM public.partnerships p
  WHERE p.id = OLD.partnership_id AND (p.user1_id = v_uid OR p.user2_id = v_uid);
  IF v_is_user1 IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: You are not a member of this partnership.';
  END IF;

  -- The pact itself is set at creation.
  NEW.id := OLD.id;
  NEW.partnership_id := OLD.partnership_id;
  NEW.created_at := OLD.created_at;
  NEW.title := OLD.title;
  NEW.target_habit_name := OLD.target_habit_name;
  NEW.duration_days := OLD.duration_days;
  NEW.user1_category := OLD.user1_category;
  NEW.user1_target := OLD.user1_target;
  NEW.user2_category := OLD.user2_category;
  NEW.user2_target := OLD.user2_target;

  v_tz := coalesce(public.ascend_own_timezone(v_uid), 'Asia/Karachi');
  v_today := to_char((now() AT TIME ZONE v_tz)::date, 'YYYY-MM-DD');

  -- Own side: stored past days, today as written. Partner's side: as stored.
  IF v_is_user1 THEN
    v_own := public.ascend_pact_dates(OLD.user1_done_dates, OLD.user1_done_date);
    v_new_own := public.ascend_pact_dates(NEW.user1_done_dates, NULL);
  ELSE
    v_own := public.ascend_pact_dates(OLD.user2_done_dates, OLD.user2_done_date);
    v_new_own := public.ascend_pact_dates(NEW.user2_done_dates, NULL);
  END IF;
  v_own := array_remove(v_own, v_today);
  IF v_today = ANY (v_new_own) THEN
    v_own := v_own || v_today;
  END IF;
  SELECT coalesce(array_agg(d ORDER BY d), '{}'::text[]) INTO v_own FROM unnest(v_own) AS u(d);

  IF v_is_user1 THEN
    NEW.user1_done_dates := to_jsonb(v_own);
    NEW.user1_done_date := v_own[array_upper(v_own, 1)]::date;
    NEW.user2_done_dates := OLD.user2_done_dates;
    NEW.user2_done_date := OLD.user2_done_date;
  ELSE
    NEW.user2_done_dates := to_jsonb(v_own);
    NEW.user2_done_date := v_own[array_upper(v_own, 1)]::date;
    NEW.user1_done_dates := OLD.user1_done_dates;
    NEW.user1_done_date := OLD.user1_done_date;
  END IF;

  -- Derived values, as reconcileSharedChallengeLifecycle: completed once the joint days reach the
  -- duration, expired once the calendar days since creation pass it, active otherwise.
  v_u1 := public.ascend_pact_dates(NEW.user1_done_dates, NEW.user1_done_date);
  v_u2 := public.ascend_pact_dates(NEW.user2_done_dates, NEW.user2_done_date);
  SELECT count(*) INTO v_total FROM (SELECT unnest(v_u1) INTERSECT SELECT unnest(v_u2)) j;
  v_duration := coalesce(NEW.duration_days, 7);
  v_elapsed := greatest(1, (now() AT TIME ZONE v_tz)::date - (NEW.created_at AT TIME ZONE v_tz)::date + 1);

  NEW.total_joint_days_completed := v_total;
  NEW.status := CASE
    WHEN v_total >= v_duration THEN 'completed'
    WHEN v_elapsed > v_duration THEN 'expired'
    ELSE 'active'
  END;
  NEW.joint_streak := least(greatest(coalesce(NEW.joint_streak, 0), 0), v_total);
  RETURN NEW;
END;
$function$;

-- Partner notifications from the stored row. Runs as the member, so create_notification_atomic
-- takes the member as the actor and checks the partnership as for the app's own sends.
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

    -- The stored total of an old row may be stale; count it from its dates.
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
    -- A notice must never undo the member's save.
    RAISE WARNING 'shared_challenges_notify: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS shared_challenges_guard ON public.shared_challenges;
CREATE TRIGGER shared_challenges_guard BEFORE INSERT OR UPDATE ON public.shared_challenges
  FOR EACH ROW EXECUTE FUNCTION public.shared_challenges_guard();

DROP TRIGGER IF EXISTS shared_challenges_notify ON public.shared_challenges;
CREATE TRIGGER shared_challenges_notify AFTER UPDATE ON public.shared_challenges
  FOR EACH ROW EXECUTE FUNCTION public.shared_challenges_notify();

REVOKE ALL ON FUNCTION public.ascend_pact_dates(jsonb, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared_challenges_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shared_challenges_notify() FROM PUBLIC, anon, authenticated;

-- Membership of the stored pact's partnership when the pact exists (the passed partnership
-- otherwise); the rest is the live definition unchanged.
CREATE OR REPLACE FUNCTION public.save_shared_challenge_atomic(p_id uuid, p_partnership_id uuid, p_title text, p_target_habit_name text, p_duration_days integer, p_joint_streak integer DEFAULT 0, p_total_joint_days_completed integer DEFAULT 0, p_user1_category text DEFAULT 'habit'::text, p_user1_target text DEFAULT ''::text, p_user2_category text DEFAULT 'habit'::text, p_user2_target text DEFAULT ''::text, p_user1_done_date text DEFAULT NULL::text, p_user2_done_date text DEFAULT NULL::text, p_user1_done_dates jsonb DEFAULT '[]'::jsonb, p_user2_done_dates jsonb DEFAULT '[]'::jsonb, p_status text DEFAULT 'active'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID;
  v_partner_exists BOOLEAN;
  v_challenge public.shared_challenges;
  v_user1_date DATE;
  v_user2_date DATE;
BEGIN
  -- 1. Require authenticated session
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You must be authenticated to create or update a joint pact.'
    );
  END IF;

  -- 2. Verify caller is a member of the pact's partnership (the stored one when the pact exists)
  SELECT EXISTS (
    SELECT 1 FROM public.partnerships p
    WHERE p.id = coalesce((SELECT sc.partnership_id FROM public.shared_challenges sc WHERE sc.id = p_id), p_partnership_id)
    AND (p.user1_id = v_caller_id OR p.user2_id = v_caller_id)
  ) INTO v_partner_exists;

  IF NOT v_partner_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You are not a member of this partnership.'
    );
  END IF;

  -- 3. Safely cast date strings to DATE (null if empty or not provided)
  IF p_user1_done_date IS NOT NULL AND TRIM(p_user1_done_date) <> '' THEN
    v_user1_date := p_user1_done_date::DATE;
  ELSE
    v_user1_date := NULL;
  END IF;

  IF p_user2_done_date IS NOT NULL AND TRIM(p_user2_done_date) <> '' THEN
    v_user2_date := p_user2_done_date::DATE;
  ELSE
    v_user2_date := NULL;
  END IF;

  -- 4. Upsert challenge
  INSERT INTO public.shared_challenges (
    id,
    partnership_id,
    title,
    target_habit_name,
    duration_days,
    joint_streak,
    total_joint_days_completed,
    user1_category,
    user1_target,
    user2_category,
    user2_target,
    user1_done_date,
    user2_done_date,
    user1_done_dates,
    user2_done_dates,
    status
  )
  VALUES (
    p_id,
    p_partnership_id,
    p_title,
    p_target_habit_name,
    p_duration_days,
    COALESCE(p_joint_streak, 0),
    COALESCE(p_total_joint_days_completed, 0),
    COALESCE(p_user1_category, 'habit'),
    COALESCE(p_user1_target, ''),
    COALESCE(p_user2_category, 'habit'),
    COALESCE(p_user2_target, ''),
    v_user1_date,
    v_user2_date,
    COALESCE(p_user1_done_dates, '[]'::jsonb),
    COALESCE(p_user2_done_dates, '[]'::jsonb),
    COALESCE(p_status, 'active')
  )
  ON CONFLICT (id) DO UPDATE SET
    partnership_id = EXCLUDED.partnership_id,
    title = EXCLUDED.title,
    target_habit_name = EXCLUDED.target_habit_name,
    duration_days = EXCLUDED.duration_days,
    joint_streak = EXCLUDED.joint_streak,
    total_joint_days_completed = EXCLUDED.total_joint_days_completed,
    user1_category = EXCLUDED.user1_category,
    user1_target = EXCLUDED.user1_target,
    user2_category = EXCLUDED.user2_category,
    user2_target = EXCLUDED.user2_target,
    user1_done_date = EXCLUDED.user1_done_date,
    user2_done_date = EXCLUDED.user2_done_date,
    user1_done_dates = EXCLUDED.user1_done_dates,
    user2_done_dates = EXCLUDED.user2_done_dates,
    status = EXCLUDED.status
  RETURNING * INTO v_challenge;

  RETURN jsonb_build_object(
    'success', true,
    'challenge_id', v_challenge.id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

COMMIT;
