-- ASCEND PHASE C & D MIGRATION — REVIEW LOOPS & DISCOVER SCALING
-- =====================================================================

-- 1. ADD REVIEW CADENCE COLUMNS TO PLANS AND FOLLOWS
ALTER TABLE public.improvement_plans
  ADD COLUMN IF NOT EXISTS review_cadence TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_review_due_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.user_plan_follows
  ADD COLUMN IF NOT EXISTS review_cadence TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_review_due_at TIMESTAMPTZ DEFAULT NULL;

-- Remove any old category check constraints if present to support all central categories
ALTER TABLE public.improvement_plans DROP CONSTRAINT IF EXISTS improvement_plans_category_check;

-- 2. CREATE PLAN REFLECTION NOTES TABLE (SCALABLE REAL-TIME REFLECTIONS)
CREATE TABLE IF NOT EXISTS public.plan_reflection_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_plan_id UUID REFERENCES public.improvement_plans(id) ON DELETE CASCADE,
  followed_plan_id UUID REFERENCES public.user_plan_follows(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on plan_reflection_notes
ALTER TABLE public.plan_reflection_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own reflection notes" ON public.plan_reflection_notes;

CREATE POLICY "Users can manage their own reflection notes"
  ON public.plan_reflection_notes FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Grants
GRANT ALL ON public.plan_reflection_notes TO authenticated;
GRANT SELECT ON public.plan_reflection_notes TO anon;

-- 3. EXTEND DAILY REMINDER CRON FUNCTION TO INCLUDE OVERDUE REVIEW PLANS
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

  v_overdue_plans_count INT;
  
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

  FOR v_row IN SELECT user_id, state FROM public.user_data LOOP
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

    IF v_incomplete_habits > 0 THEN
      IF v_incomplete_habits = 1 THEN
        v_missing_items := array_append(v_missing_items, '1 habit');
      ELSE
        v_missing_items := array_append(v_missing_items, v_incomplete_habits || ' habits');
      END IF;
    END IF;

    -- B. EXERCISE (Workouts)
    v_workout_done_today := FALSE;
    v_has_workouts := FALSE;

    IF jsonb_typeof(v_state->'workouts') = 'array' AND jsonb_array_length(v_state->'workouts') > 0 THEN
      v_has_workouts := TRUE;
      SELECT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(v_state->'workouts') AS w(date text, "createdAt" text)
        WHERE w.date = v_today OR w."createdAt" LIKE v_today || '%'
      ) INTO v_workout_done_today;
    END IF;

    IF v_has_workouts AND NOT v_workout_done_today THEN
      v_missing_items := array_append(v_missing_items, 'Exercise');
    END IF;

    -- C. READING (Books)
    v_has_active_books := FALSE;
    v_reading_done_today := FALSE;

    IF jsonb_typeof(v_state->'books') = 'array' THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(v_state->'books') AS b("isFinished" boolean)
        WHERE b."isFinished" IS FALSE
      ) INTO v_has_active_books;
    END IF;

    IF v_has_active_books THEN
      IF jsonb_typeof(v_state->'readingLogs') = 'array' THEN
        SELECT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(v_state->'readingLogs') AS r(date text, "createdAt" text)
          WHERE r.date = v_today OR r."createdAt" LIKE v_today || '%'
        ) INTO v_reading_done_today;
      END IF;

      IF NOT v_reading_done_today THEN
        v_missing_items := array_append(v_missing_items, 'Reading');
      END IF;
    END IF;

    -- D. JOURNAL ENTRIES
    v_journal_done_today := FALSE;
    v_has_journal := FALSE;

    IF jsonb_typeof(v_state->'journalEntries') = 'array' AND jsonb_array_length(v_state->'journalEntries') > 0 THEN
      v_has_journal := TRUE;
      SELECT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(v_state->'journalEntries') AS j(date text, "createdAt" text)
        WHERE j.date = v_today OR j."createdAt" LIKE v_today || '%'
      ) INTO v_journal_done_today;
    END IF;

    IF v_has_journal AND NOT v_journal_done_today THEN
      v_missing_items := array_append(v_missing_items, 'Journal');
    END IF;

    -- E. SKILLS
    v_has_active_skills := FALSE;
    v_skill_done_today := FALSE;

    IF jsonb_typeof(v_state->'skills') = 'array' AND jsonb_array_length(v_state->'skills') > 0 THEN
      v_has_active_skills := TRUE;
      IF jsonb_typeof(v_state->'skillLogs') = 'array' THEN
        SELECT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(v_state->'skillLogs') AS s(date text, "createdAt" text)
          WHERE s.date = v_today OR s."createdAt" LIKE v_today || '%'
        ) INTO v_skill_done_today;
      END IF;

      IF NOT v_skill_done_today THEN
        v_missing_items := array_append(v_missing_items, 'Skills practice');
      END IF;
    END IF;

    -- F. OVERDUE IMPROVEMENT PLAN REVIEWS (Strict UTC Timezone)
    v_overdue_plans_count := 0;
    SELECT (
      (SELECT COUNT(*) FROM public.improvement_plans WHERE creator_id = v_row.user_id AND review_cadence IS NOT NULL AND next_review_due_at <= NOW() AT TIME ZONE 'UTC') +
      (SELECT COUNT(*) FROM public.user_plan_follows WHERE user_id = v_row.user_id AND review_cadence IS NOT NULL AND next_review_due_at <= NOW() AT TIME ZONE 'UTC')
    ) INTO v_overdue_plans_count;

    IF v_overdue_plans_count > 0 THEN
      IF v_overdue_plans_count = 1 THEN
        v_missing_items := array_append(v_missing_items, '1 plan due for review');
      ELSE
        v_missing_items := array_append(v_missing_items, v_overdue_plans_count || ' plans due for review');
      END IF;
    END IF;

    -- BUILD COMBINED NOTIFICATION
    IF array_length(v_missing_items, 1) > 0 THEN
      IF array_length(v_missing_items, 1) = 1 THEN
        v_missing_str := v_missing_items[1];
      ELSIF array_length(v_missing_items, 1) = 2 THEN
        v_missing_str := v_missing_items[1] || ' and ' || v_missing_items[2];
      ELSE
        v_missing_str := array_to_string(v_missing_items[1:array_length(v_missing_items, 1)-1], ', ') || ', and ' || v_missing_items[array_length(v_missing_items, 1)];
      END IF;

      v_notif_title := 'Daily Reminder: Pending Reviews & Trackers';
      v_notif_message := 'You haven''t completed: ' || v_missing_str || ' today.';

      INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        actor_username,
        actor_avatar,
        type,
        title,
        message,
        payload,
        read,
        created_at
      ) VALUES (
        v_row.user_id,
        NULL,
        'Ascend System',
        '🔔',
        'daily_reminder',
        v_notif_title,
        v_notif_message,
        jsonb_build_object('date', v_today, 'incompleteItems', to_jsonb(v_missing_items)),
        FALSE,
        NOW()
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