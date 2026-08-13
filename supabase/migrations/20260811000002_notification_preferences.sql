-- =====================================================================
-- ASCEND NOTIFICATION PREFERENCES MIGRATION
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =====================================================================

-- 1. ADD NOTIFICATION PREFERENCE COLUMNS TO PUBLIC.PROFILES
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notif_daily_reminder BOOLEAN DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notif_partner_activity BOOLEAN DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notif_league_updates BOOLEAN DEFAULT TRUE;

-- 2. UPDATE PROCESS_DAILY_REMINDER_NOTIFICATIONS TO FILTER OUT USERS WITH notif_daily_reminder = FALSE
CREATE OR REPLACE FUNCTION public.process_daily_reminder_notifications(
  p_target_date TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today TEXT;
  v_row RECORD;
  v_state JSONB;
  v_habit RECORD;
  v_incomplete_habits INT;
  v_has_active_habits BOOLEAN;
  
  v_has_workouts BOOLEAN;
  v_workout_done_today BOOLEAN;
  
  v_has_active_books BOOLEAN;
  v_reading_done_today BOOLEAN;
  
  v_has_journal BOOLEAN;
  v_journal_done_today BOOLEAN;
  
  v_has_active_skills BOOLEAN;
  v_skill_done_today BOOLEAN;
  
  v_missing_items TEXT[];
  v_missing_str TEXT;
  v_notif_title TEXT;
  v_notif_message TEXT;
  v_count INT := 0;
  v_already_notified BOOLEAN;
BEGIN
  IF p_target_date IS NOT NULL AND length(p_target_date) > 0 THEN
    v_today := p_target_date;
  ELSE
    v_today := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  END IF;

  FOR v_row IN 
    SELECT ud.user_id, ud.state 
    FROM public.user_data ud
    LEFT JOIN public.profiles p ON p.id = ud.user_id
    WHERE COALESCE(p.notif_daily_reminder, TRUE) = TRUE
  LOOP
    v_state := v_row.state;
    IF v_state IS NULL THEN
      CONTINUE;
    END IF;

    -- Check duplicate: skip if user already received daily_reminder for today
    SELECT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE recipient_id = v_row.user_id
        AND type = 'daily_reminder'
        AND payload->>'date' = v_today
    ) INTO v_already_notified;

    IF v_already_notified THEN
      CONTINUE;
    END IF;

    v_missing_items := ARRAY[]::TEXT[];

    -- A. HABITS
    v_incomplete_habits := 0;
    v_has_active_habits := FALSE;

    IF jsonb_typeof(v_state->'habits') = 'array' THEN
      FOR v_habit IN SELECT * FROM jsonb_to_recordset(v_state->'habits') AS x(id text, name text, completions jsonb) LOOP
        v_has_active_habits := TRUE;
        IF v_habit.completions IS NULL OR NOT (v_habit.completions @> to_jsonb(v_today)) THEN
          v_incomplete_habits := v_incomplete_habits + 1;
        END IF;
      END LOOP;
    END IF;

    IF v_has_active_habits AND v_incomplete_habits > 0 THEN
      v_missing_items := array_append(v_missing_items, v_incomplete_habits || ' habit' || CASE WHEN v_incomplete_habits > 1 THEN 's' ELSE '' END);
    END IF;

    -- B. WORKOUTS
    v_has_workouts := FALSE;
    v_workout_done_today := FALSE;
    IF jsonb_typeof(v_state->'workouts') = 'array' THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_state->'workouts') x
        WHERE x->>'date' = v_today
      ) INTO v_workout_done_today;
      v_has_workouts := jsonb_array_length(v_state->'workouts') > 0;
    END IF;

    IF (v_has_workouts OR (v_state->'exerciseGoalMinutes') IS NOT NULL) AND NOT v_workout_done_today THEN
      v_missing_items := array_append(v_missing_items, 'workout log');
    END IF;

    -- C. READING
    v_has_active_books := FALSE;
    v_reading_done_today := FALSE;
    IF jsonb_typeof(v_state->'readingLogs') = 'array' THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_state->'readingLogs') x
        WHERE x->>'date' = v_today
      ) INTO v_reading_done_today;
      v_has_active_books := jsonb_array_length(v_state->'readingLogs') > 0;
    END IF;

    IF (v_has_active_books OR (v_state->'readingGoalPages') IS NOT NULL) AND NOT v_reading_done_today THEN
      v_missing_items := array_append(v_missing_items, 'reading log');
    END IF;

    -- D. JOURNAL
    v_has_journal := FALSE;
    v_journal_done_today := FALSE;
    IF jsonb_typeof(v_state->'journalEntries') = 'array' THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_state->'journalEntries') x
        WHERE x->>'date' = v_today
      ) INTO v_journal_done_today;
      v_has_journal := jsonb_array_length(v_state->'journalEntries') > 0;
    END IF;

    IF v_has_journal AND NOT v_journal_done_today THEN
      v_missing_items := array_append(v_missing_items, 'journal entry');
    END IF;

    -- E. SKILL PRACTICE
    v_has_active_skills := FALSE;
    v_skill_done_today := FALSE;
    IF jsonb_typeof(v_state->'skillLogs') = 'array' THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_state->'skillLogs') x
        WHERE x->>'date' = v_today
      ) INTO v_skill_done_today;
      v_has_active_skills := jsonb_array_length(v_state->'skillLogs') > 0;
    END IF;

    IF v_has_active_skills AND NOT v_skill_done_today THEN
      v_missing_items := array_append(v_missing_items, 'skill practice');
    END IF;

    -- BUILD ONE COMBINED SUMMARY NOTIFICATION IF ITEMS REMAIN INCOMPLETE
    IF array_length(v_missing_items, 1) > 0 THEN
      v_missing_str := array_to_string(v_missing_items, ', ');
      v_notif_title := 'Evening Tracker Check-in 🌙';
      v_notif_message := 'Don''t break your momentum! You still have incomplete items for today: ' || v_missing_str || '.';

      INSERT INTO public.notifications (
        recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
      )
      VALUES (
        v_row.user_id,
        NULL,
        'Ascend System',
        '⚡',
        'daily_reminder',
        v_notif_title,
        v_notif_message,
        jsonb_build_object('date', v_today, 'missing', v_missing_items),
        FALSE
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'date', v_today,
    'notifications_created', v_count
  );
END;
$$;

-- 3. UPDATE CREATE_NOTIFICATION_ATOMIC RPC TO ENFORCE NOTIFICATION PREFERENCES
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
RETURNS public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notif public.notifications;
  v_dedup_key TEXT;
  v_notif_partner_activity BOOLEAN := TRUE;
  v_notif_league_updates BOOLEAN := TRUE;
  v_notif_daily_reminder BOOLEAN := TRUE;
BEGIN
  -- Query recipient notification preferences from public.profiles
  SELECT 
    COALESCE(notif_partner_activity, TRUE),
    COALESCE(notif_league_updates, TRUE),
    COALESCE(notif_daily_reminder, TRUE)
  INTO 
    v_notif_partner_activity,
    v_notif_league_updates,
    v_notif_daily_reminder
  FROM public.profiles
  WHERE id = p_recipient_id;

  -- Enforce preference suppression according to notification type:
  -- Partner Activity Alerts: partner_nudge, challenge_completed
  IF p_type IN ('partner_nudge', 'challenge_completed') AND v_notif_partner_activity IS FALSE THEN
    RETURN NULL;
  END IF;

  -- Weekly League Reset & Rank Updates: league_reset, league_promotion, league_demotion, league_update
  IF p_type IN ('league_reset', 'league_promotion', 'league_demotion', 'league_update') AND v_notif_league_updates IS FALSE THEN
    RETURN NULL;
  END IF;

  -- Daily Habit Reminders: daily_reminder
  IF p_type IN ('daily_reminder') AND v_notif_daily_reminder IS FALSE THEN
    RETURN NULL;
  END IF;

  v_dedup_key := p_payload->>'dedupKey';

  -- If dedupKey exists, try to insert ON CONFLICT DO NOTHING
  IF v_dedup_key IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
    )
    VALUES (
      p_recipient_id, p_actor_id, p_actor_username, p_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
    )
    ON CONFLICT (recipient_id, ((payload->>'dedupKey'))) WHERE (payload->>'dedupKey') IS NOT NULL
    DO NOTHING
    RETURNING * INTO v_notif;

    -- If conflict occurred, select existing notification row
    IF v_notif.id IS NULL THEN
      SELECT * INTO v_notif
      FROM public.notifications
      WHERE recipient_id = p_recipient_id AND payload->>'dedupKey' = v_dedup_key
      LIMIT 1;
    END IF;
  ELSE
    -- Standard insert without dedup check
    INSERT INTO public.notifications (
      recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
    )
    VALUES (
      p_recipient_id, p_actor_id, p_actor_username, p_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
    )
    RETURNING * INTO v_notif;
  END IF;

  RETURN v_notif;
END;
$$;

NOTIFY pgrst, 'reload schema';
