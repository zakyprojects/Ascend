-- Migration: Apply Scheduled Notifications Cron Jobs (Daily Evening Tracker Reminder & Sunday Goal Planning)
-- Description: Updates process_daily_reminder_notifications with dual-shape completions, daily-frequency filtering,
-- removes obsolete exerciseGoalMinutes/readingGoalPages checks, delegates deduplication & preference checks to create_notification_atomic,
-- and schedules pg_cron jobs for daily 20:00 UTC and Sunday 19:00 UTC execution.

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
  v_notif_id UUID;
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

    v_missing_items := ARRAY[]::TEXT[];

    -- A. DAILY HABITS
    v_incomplete_habits := 0;
    v_has_active_habits := FALSE;

    IF jsonb_typeof(v_state->'habits') = 'array' THEN
      FOR v_habit IN 
        SELECT * FROM jsonb_to_recordset(v_state->'habits') 
        AS x(id text, name text, frequency text, completions jsonb) 
      LOOP
        -- Only evaluate habits with daily frequency (skip weekly habits)
        IF COALESCE(v_habit.frequency, 'daily') = 'weekly' THEN
          CONTINUE;
        END IF;

        v_has_active_habits := TRUE;
        -- Dual-shape completions check: string[] array OR Record<string, {done: boolean}> map
        IF v_habit.completions IS NULL OR NOT (
          COALESCE(v_habit.completions @> to_jsonb(v_today), false) OR 
          COALESCE((v_habit.completions->v_today->>'done')::boolean, false)
        ) THEN
          v_incomplete_habits := v_incomplete_habits + 1;
        END IF;
      END LOOP;
    END IF;

    IF v_has_active_habits AND v_incomplete_habits > 0 THEN
      v_missing_items := array_append(v_missing_items, v_incomplete_habits || ' habit' || CASE WHEN v_incomplete_habits > 1 THEN 's' ELSE '' END);
    END IF;

    -- B. READING
    v_has_active_books := FALSE;
    v_reading_done_today := FALSE;
    IF jsonb_typeof(v_state->'readingLogs') = 'array' THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_state->'readingLogs') x
        WHERE x->>'date' = v_today
      ) INTO v_reading_done_today;
      v_has_active_books := jsonb_array_length(v_state->'readingLogs') > 0;
    END IF;

    IF v_has_active_books AND NOT v_reading_done_today THEN
      v_missing_items := array_append(v_missing_items, 'reading log');
    END IF;

    -- C. JOURNAL
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

    -- D. SKILL PRACTICE
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

    -- BUILD & ROUTE COMBINED NOTIFICATION VIA create_notification_atomic
    IF array_length(v_missing_items, 1) > 0 THEN
      v_missing_str := array_to_string(v_missing_items, ', ');
      v_notif_title := 'Evening Tracker Check-in 🌙';
      v_notif_message := 'Don''t break your momentum! You still have incomplete items for today: ' || v_missing_str || '.';

      v_notif_id := public.create_notification_atomic(
        p_recipient_id => v_row.user_id,
        p_actor_id => NULL,
        p_actor_username => 'Ascend System',
        p_actor_avatar => '⚡',
        p_type => 'daily_reminder',
        p_title => v_notif_title,
        p_message => v_notif_message,
        p_payload => jsonb_build_object(
          'date', v_today,
          'missing', v_missing_items,
          'dedupKey', 'daily_reminder_' || v_today
        )
      );

      IF v_notif_id IS NOT NULL THEN
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'date', v_today,
    'notifications_created', v_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_sunday_planning_notifications(
  p_week_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_key TEXT;
  v_row RECORD;
  v_dedup_key TEXT;
  v_count INT := 0;
  v_notif_id UUID;
BEGIN
  IF p_week_key IS NOT NULL AND length(p_week_key) > 0 THEN
    v_week_key := p_week_key;
  ELSE
    v_week_key := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-"W"IW');
  END IF;

  FOR v_row IN SELECT id FROM public.profiles LOOP
    v_dedup_key := 'sunday_planning_' || v_week_key;

    v_notif_id := public.create_notification_atomic(
      p_recipient_id => v_row.id,
      p_actor_id => NULL,
      p_actor_username => 'Ascend Executive System',
      p_actor_avatar => '🎯',
      p_type => 'sunday_planning',
      p_title => 'Sunday Evening Goal Planning',
      p_message => 'Take 5 minutes to set your top 3 measurable goals and review last week''s velocity.',
      p_payload => jsonb_build_object('weekKey', v_week_key, 'dedupKey', v_dedup_key)
    );

    IF v_notif_id IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'weekKey', v_week_key,
    'notifications_created', v_count
  );
END;
$$;

-- Schedule pg_cron jobs for daily-evening-reminder and sunday-planning-reminder
DO $$
BEGIN
  -- 1. Daily Evening Reminder (runs at 20:00 UTC every day)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-evening-reminder') THEN
    PERFORM cron.unschedule('daily-evening-reminder');
  END IF;
  PERFORM cron.schedule(
    'daily-evening-reminder',
    '0 20 * * *',
    'SELECT public.process_daily_reminder_notifications();'
  );

  -- 2. Sunday Goal Planning Reminder (runs at 19:00 UTC every Sunday)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sunday-planning-reminder') THEN
    PERFORM cron.unschedule('sunday-planning-reminder');
  END IF;
  PERFORM cron.schedule(
    'sunday-planning-reminder',
    '0 19 * * 0',
    'SELECT public.process_sunday_planning_notifications();'
  );
END $$;
