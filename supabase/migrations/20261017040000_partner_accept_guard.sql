-- Partner invites: the pair, the names and the 5-partner cap come from the server.
--
-- 1. accept_partner_invite_atomic ignores the caller-supplied user ids and usernames (the
--    parameters stay so older app builds keep working) and pairs only the invite's own two
--    users, names taken from profiles. Both users are locked (advisory, fixed order) and the
--    cap of 5 is enforced for each side at accept time.
-- 2. send_partner_invite_atomic takes both usernames from profiles and uses the same locks.
-- 3. The direct INSERT policy on partner_invites is dropped: invites are created only by the
--    send RPC, which enforces the cap (the app's direct-insert fallback is removed too).
-- 4. ascend_process_penalties sends partner_missed_habit to every partner, not just one.
--    Based on the live definition; only the partner lookup changed.
--
-- Old app compatible: same signatures and return shapes; apply before or after the app push.

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

  RETURN jsonb_build_object(
    'success', true,
    'partnership_id', v_partnership_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_partner_invite_atomic(uuid, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_partner_invite_atomic(uuid, uuid, text, uuid, text) TO authenticated, service_role;

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
  v_to_username TEXT;
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

  -- Usernames come from profiles, not from the caller
  SELECT username INTO v_from_username FROM public.profiles WHERE id = p_from_user_id;
  SELECT username INTO v_to_username FROM public.profiles WHERE id = p_to_user_id;

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
    COALESCE(p_from_avatar, '🧑'),
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

REVOKE ALL ON FUNCTION public.send_partner_invite_atomic(uuid, uuid, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_partner_invite_atomic(uuid, uuid, text, text, uuid, text) TO authenticated, service_role;

-- Invites are created only through send_partner_invite_atomic (cap + checks).
DROP POLICY IF EXISTS "Users can insert partner invites" ON public.partner_invites;

-- partner_missed_habit to every partner (live definition, partner lookup changed only).
CREATE OR REPLACE FUNCTION public.ascend_process_penalties(p_user uuid, p_tz text, p_from date, p_to date, p_apply boolean)
 RETURNS TABLE(kind text, entity_id text, period text, amount integer, multiplier double precision)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_now_iso    text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_season     int  := public.ascend_season_points(p_user);
  v_username   text;
  v_partner    uuid;
  v_day        date;
  v_habit      record;
  v_bad        record;
  v_key        text;
  v_created    date;
  v_created_key text;
  v_cursor     text;
  v_cursor_day date;
  v_misses     int;
  v_mult       double precision;
  v_penalty    int;
  v_entry_id   text;
  v_done       boolean;
  v_eligible   text[];
  v_planned    text[] := '{}';
  v_status     text;
  v_occ        int;
  v_goal       jsonb;
  v_target     int;
  v_logged     int;
  v_avg        int;
  v_inserted   int;
  v_changed    boolean := false;
BEGIN
  SELECT pr.username INTO v_username FROM public.profiles pr WHERE pr.id = p_user;

  -- Bad habits holding the point-eligible slots (getPointEligibleHabitIds, 2 slots).
  SELECT coalesce(array_agg(b.id ORDER BY b.ord_valid, b.ord_time, b.id), '{}') INTO v_eligible
  FROM (
    SELECT bh.id,
      (public.ascend_instant(bh.data->>'createdAt') IS NULL) AS ord_valid,
      public.ascend_instant(bh.data->>'createdAt') AS ord_time
    FROM public.bad_habits bh
    WHERE bh.user_id = p_user AND bh.deleted_at IS NULL
      AND coalesce((bh.data->>'isCompleted')::boolean, false) = false
    ORDER BY 2, 3, 1
    LIMIT 2
  ) b;

  v_day := p_from;
  WHILE v_day <= p_to LOOP

    -- a) Preset habits (processHabitPenalties). Daily: every day. Weekly: on the week's last day.
    FOR v_habit IN
      SELECT h.id, h.data
      FROM public.habits h
      WHERE h.user_id = p_user AND h.deleted_at IS NULL
        AND coalesce((h.data->>'isPreset')::boolean, false)
        AND coalesce((h.data->>'points')::numeric, 0) > 0
      ORDER BY h.created_at, h.id
    LOOP
      v_created := public.ascend_local_date(v_habit.data->>'createdAt', p_tz);
      IF v_created IS NULL OR v_day < v_created THEN
        CONTINUE;
      END IF;

      IF v_habit.data->>'frequency' = 'daily' THEN
        v_key := to_char(v_day, 'YYYY-MM-DD');
        v_created_key := coalesce(v_habit.data->>'createdAtPeriod', to_char(v_created, 'YYYY-MM-DD'));
      ELSE
        IF extract(isodow FROM v_day) <> 7 THEN
          CONTINUE;
        END IF;
        v_key := public.ascend_week_key(v_day, p_tz);
        v_created_key := coalesce(v_habit.data->>'createdAtPeriod', public.ascend_week_key(v_created, p_tz));
      END IF;

      -- isHabitPeriodCompleted
      v_done := CASE jsonb_typeof(v_habit.data->'completions')
        WHEN 'object' THEN coalesce(v_habit.data->'completions'->v_key->>'done', '') = 'true'
        WHEN 'array'  THEN (v_habit.data->'completions') ? v_key
        ELSE false END;
      IF v_done THEN
        CONTINUE;
      END IF;

      -- Already missed: in the ledger (deleted rows included, so an excised penalty is never
      -- re-issued by the server). The habit's missedPeriods is not trusted: the app writes it.
      IF EXISTS (
        SELECT 1 FROM public.point_entries pe
        WHERE pe.user_id = p_user
          AND (pe.id = 'habit_missed_' || v_habit.id || '_' || v_key
               OR (pe.data->>'source' = 'habit_missed'
                   AND pe.data->'metadata'->>'habitId' = v_habit.id
                   AND pe.data->'metadata'->>'period' = v_key))
      ) THEN
        CONTINUE;
      END IF;

      -- getHabitConsecutiveMissesUpToPeriod
      v_misses := 0;
      v_cursor := v_key;
      FOR i IN 1..(CASE WHEN v_habit.data->>'frequency' = 'daily' THEN 90 ELSE 52 END) LOOP
        EXIT WHEN v_cursor < v_created_key;
        EXIT WHEN CASE jsonb_typeof(v_habit.data->'completions')
          WHEN 'object' THEN coalesce(v_habit.data->'completions'->v_cursor->>'done', '') = 'true'
          WHEN 'array'  THEN (v_habit.data->'completions') ? v_cursor
          ELSE false END;
        v_misses := v_misses + 1;
        IF v_habit.data->>'frequency' = 'daily' THEN
          v_cursor := to_char(v_cursor::date - 1, 'YYYY-MM-DD');
        ELSE
          v_cursor := public.ascend_add_weeks(v_cursor, -1, p_tz);
        END IF;
      END LOOP;

      v_mult := public.ascend_miss_multiplier(v_misses, v_season);
      v_penalty := round((v_habit.data->>'points')::numeric * v_mult::numeric)::int;
      v_entry_id := 'habit_missed_' || v_habit.id || '_' || v_key;

      IF p_apply THEN
        INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
        VALUES (p_user, v_entry_id, jsonb_build_object(
          'id', v_entry_id,
          'amount', -v_penalty,
          'reason', 'Missed habit (' || v_mult || 'x penalty): ' || (v_habit.data->>'name'),
          'source', 'habit_missed',
          'timestamp', v_now_iso,
          'metadata', jsonb_build_object('habitId', v_habit.id, 'habitName', v_habit.data->>'name', 'period', v_key, 'multiplier', v_mult)
        ), now(), now())
        ON CONFLICT (user_id, id) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        IF v_inserted = 0 THEN
          CONTINUE;
        END IF;

        PERFORM public.create_notification_atomic(
          p_recipient_id => p_user,
          p_type => 'missed_habit',
          p_title => 'Habit Missed Penalty',
          p_message => 'You missed your habit "' || (v_habit.data->>'name') || '" for period ' || v_key || '. '
                       || CASE WHEN v_penalty > 0 THEN v_penalty || ' points deducted.' ELSE '' END,
          p_payload => jsonb_build_object('habitId', v_habit.id, 'habitName', v_habit.data->>'name', 'period', v_key,
                                          'dedupKey', 'missed_habit_' || v_habit.id || '_' || v_key)
        );
        -- Every partner gets the notice (dedup is per recipient, so the key stays the same).
        FOR v_partner IN
          SELECT CASE WHEN ps.user1_id = p_user THEN ps.user2_id ELSE ps.user1_id END
          FROM public.partnerships ps
          WHERE ps.user1_id = p_user OR ps.user2_id = p_user
          ORDER BY ps.paired_at, ps.id
        LOOP
          PERFORM public.create_notification_atomic(
            p_recipient_id => v_partner,
            p_actor_id => p_user,
            p_type => 'partner_missed_habit',
            p_title => 'Streak Risk Warning',
            p_message => 'Your partner ' || coalesce(v_username, 'User') || ' missed their habit "' || (v_habit.data->>'name')
                         || '". Reach out to encourage them!',
            p_payload => jsonb_build_object('habitId', v_habit.id, 'habitName', v_habit.data->>'name', 'period', v_key,
                                            'dedupKey', 'partner_missed_habit_' || v_habit.id || '_' || v_key)
          );
        END LOOP;
        v_changed := true;
      END IF;

      v_season := greatest(v_season - v_penalty, 0);
      kind := 'habit_missed'; entity_id := v_habit.id; period := v_key; amount := -v_penalty; multiplier := v_mult;
      RETURN NEXT;
    END LOOP;

    -- b) Bad-habit no-reports (processBadHabitNoReports), oldest habit first.
    FOR v_bad IN
      SELECT bh.id, bh.data
      FROM public.bad_habits bh
      WHERE bh.user_id = p_user AND bh.deleted_at IS NULL
        AND coalesce((bh.data->>'isCompleted')::boolean, false) = false
      ORDER BY public.ascend_instant(bh.data->>'createdAt') NULLS LAST, bh.id
    LOOP
      v_created := public.ascend_local_date(v_bad.data->>'createdAt', p_tz);
      IF v_created IS NULL OR v_day < v_created THEN
        CONTINUE;
      END IF;
      v_key := to_char(v_day, 'YYYY-MM-DD');

      -- Any live log for the day, or this day's no-report row in any state (a deleted one
      -- was removed by the user and stays removed).
      IF EXISTS (
        SELECT 1 FROM public.bad_habit_logs l
        WHERE l.user_id = p_user
          AND ((l.deleted_at IS NULL AND l.data->>'badHabitId' = v_bad.id AND l.data->>'date' = v_key)
               OR l.id = 'no_report_' || v_bad.id || '_' || v_key)
      ) OR (v_bad.id || '|' || v_key) = ANY (v_planned) THEN
        CONTINUE;
      END IF;

      -- consecutiveOccurrences: 1 + the unbroken run of occurred/no_report logs before the day.
      v_occ := 1;
      FOR v_status IN
        SELECT s.status FROM (
          SELECT l.data->>'date' AS d, l.data->>'status' AS status
          FROM public.bad_habit_logs l
          WHERE l.user_id = p_user AND l.deleted_at IS NULL
            AND l.data->>'badHabitId' = v_bad.id AND l.data->>'date' < v_key
          UNION ALL
          SELECT split_part(p, '|', 2), 'no_report'
          FROM unnest(v_planned) p
          WHERE split_part(p, '|', 1) = v_bad.id AND split_part(p, '|', 2) < v_key
        ) s
        ORDER BY s.d DESC
      LOOP
        EXIT WHEN v_status NOT IN ('occurred', 'no_report');
        v_occ := v_occ + 1;
      END LOOP;

      IF v_bad.id = ANY (v_eligible) THEN
        v_mult := public.ascend_miss_multiplier(v_occ, v_season);
        v_penalty := round(3 * v_mult::numeric)::int;
      ELSE
        v_mult := 1;
        v_penalty := 0;
      END IF;

      -- A preview writes nothing, so it remembers its own no-report days for the run.
      IF NOT p_apply THEN
        v_planned := v_planned || (v_bad.id || '|' || v_key);
      END IF;

      IF p_apply THEN
        INSERT INTO public.bad_habit_logs (user_id, id, data, created_at, updated_at)
        VALUES (p_user, 'no_report_' || v_bad.id || '_' || v_key, jsonb_build_object(
          'id', 'no_report_' || v_bad.id || '_' || v_key,
          'badHabitId', v_bad.id,
          'date', v_key,
          'status', 'no_report',
          'consecutiveOccurrences', v_occ,
          'pointsAwardedOrDeducted', -v_penalty,
          'createdAt', v_now_iso
        ), now(), now())
        ON CONFLICT (user_id, id) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        IF v_inserted = 0 THEN
          CONTINUE;
        END IF;
        v_changed := true;

        IF v_penalty > 0 THEN
          v_entry_id := 'bad_habit_no_report_' || v_bad.id || '_' || v_key;
          INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
          VALUES (p_user, v_entry_id, jsonb_build_object(
            'id', v_entry_id,
            'amount', -v_penalty,
            'reason', 'No-report bad habit penalty (' || v_mult || 'x penalty): ' || (v_bad.data->>'name'),
            'source', 'bad_habit_no_report',
            'timestamp', v_now_iso,
            'metadata', jsonb_build_object('badHabitId', v_bad.id, 'badHabitName', v_bad.data->>'name', 'date', v_key, 'multiplier', v_mult)
          ), now(), now())
          ON CONFLICT (user_id, id) DO NOTHING;

          PERFORM public.create_notification_atomic(
            p_recipient_id => p_user,
            p_type => 'bad_habit_no_report',
            p_title => 'Bad Habit No-Report Penalty',
            p_message => 'No status reported for "' || (v_bad.data->>'name') || '" on ' || v_key || '. '
                         || v_penalty || ' points deducted.',
            p_payload => jsonb_build_object('badHabitId', v_bad.id, 'badHabitName', v_bad.data->>'name', 'date', v_key,
                                            'dedupKey', 'bad_habit_' || v_bad.id || '_' || v_key)
          );
        END IF;
      END IF;

      v_season := greatest(v_season - v_penalty, 0);
      kind := 'bad_habit_no_report'; entity_id := v_bad.id; period := v_key; amount := -v_penalty; multiplier := v_mult;
      RETURN NEXT;
    END LOOP;

    -- c) Weekly exercise target (processExerciseTargetPenalties), on the week's last day.
    IF extract(isodow FROM v_day) = 7 THEN
      SELECT ud.state->'exerciseGoal' INTO v_goal FROM public.user_data ud WHERE ud.user_id = p_user;
      v_target := CASE WHEN v_goal->>'targetWeeklySessions' ~ '^\d+(\.\d+)?$' THEN (v_goal->>'targetWeeklySessions')::numeric::int ELSE 0 END;
      v_key := public.ascend_week_key(v_day, p_tz);

      IF v_target > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.point_entries pe
          WHERE pe.user_id = p_user
            AND (pe.id = 'exercise_missed_' || v_key
                 OR (pe.data->>'source' = 'exercise_missed' AND pe.data->'metadata'->>'weekKey' = v_key))
        )
      THEN
        SELECT count(*) INTO v_logged
        FROM public.workouts w
        WHERE w.user_id = p_user AND w.deleted_at IS NULL
          AND public.ascend_week_key(public.ascend_local_date(w.data->>'date', p_tz), p_tz) = v_key;

        IF v_logged < v_target THEN
          -- getExerciseGoalConsecutiveMisses, counted from the Monday after the week.
          v_created_key := public.ascend_week_key(public.ascend_local_date(v_goal->>'createdAt', p_tz), p_tz);
          v_misses := 0;
          FOR i IN 1..52 LOOP
            v_cursor := public.ascend_week_key(v_day + 1 - 7 * i, p_tz);
            EXIT WHEN v_created_key IS NOT NULL AND v_cursor < v_created_key;
            EXIT WHEN (
              SELECT count(*) FROM public.workouts w
              WHERE w.user_id = p_user AND w.deleted_at IS NULL
                AND public.ascend_week_key(public.ascend_local_date(w.data->>'date', p_tz), p_tz) = v_cursor
            ) >= v_target;
            v_misses := v_misses + 1;
          END LOOP;

          SELECT coalesce(round(avg(coalesce((w.data->>'durationMinutes')::numeric, 0))), 30)::int INTO v_avg
          FROM public.workouts w
          WHERE w.user_id = p_user AND w.deleted_at IS NULL;

          v_mult := public.ascend_miss_multiplier(v_misses, v_season);
          v_penalty := round(v_avg * v_mult::numeric)::int;
          v_entry_id := 'exercise_missed_' || v_key;

          IF p_apply THEN
            INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
            VALUES (p_user, v_entry_id, jsonb_build_object(
              'id', v_entry_id,
              'amount', -v_penalty,
              'reason', 'Missed weekly workout goal (' || v_logged || '/' || v_target || ' sessions, ' || v_mult || 'x penalty)',
              'source', 'exercise_missed',
              'timestamp', v_now_iso,
              'metadata', jsonb_build_object('weekKey', v_key, 'logged', v_logged, 'target', v_target, 'multiplier', v_mult)
            ), now(), now())
            ON CONFLICT (user_id, id) DO NOTHING;
            GET DIAGNOSTICS v_inserted = ROW_COUNT;
            IF v_inserted > 0 THEN
              PERFORM public.create_notification_atomic(
                p_recipient_id => p_user,
                p_type => 'missed_exercise_target',
                p_title => 'Exercise Goal Missed',
                p_message => 'You logged ' || v_logged || '/' || v_target || ' workout sessions for week ' || v_key || '. '
                             || CASE WHEN v_penalty > 0 THEN v_penalty || ' points deducted.' ELSE '' END,
                p_payload => jsonb_build_object('weekKey', v_key, 'logged', v_logged, 'target', v_target,
                                                'dedupKey', 'missed_exercise_' || v_key)
              );
              v_changed := true;
            END IF;
          END IF;

          IF NOT p_apply OR v_inserted > 0 THEN
            v_season := greatest(v_season - v_penalty, 0);
            kind := 'exercise_missed'; entity_id := v_key; period := v_key; amount := -v_penalty; multiplier := v_mult;
            RETURN NEXT;
          END IF;
        END IF;
      END IF;
    END IF;

    v_day := v_day + 1;
  END LOOP;

  -- The leaderboard reads profiles.season_points; the app writes the same value on its next save.
  IF p_apply AND v_changed THEN
    v_season := public.ascend_season_points(p_user);
    UPDATE public.profiles SET season_points = v_season, total_points = v_season WHERE id = p_user;
  END IF;
END;
$function$;
