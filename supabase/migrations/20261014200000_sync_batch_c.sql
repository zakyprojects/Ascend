-- DB normalization, batch C (knowledge/db-normalization-plan.md)
-- Habits and the modules coupled to points/streaks move to relational tables,
-- one jsonb document per item (the client keeps the whole item; nothing is
-- lost in a column mapping). Same sync template as the PFC pilot:
--   * PK (user_id, id text): item id, or the week key for weekly_goals
--   * updated_at last-writer-wins, deleted_at soft delete, server_updated_at cursor
--   * owner-only RLS, no DELETE grant, realtime, shared sync triggers
-- Also rewrites process_daily_reminder_notifications to read these tables
-- (and journal_entries from batch A) instead of the user_data blob.

BEGIN;

CREATE TABLE public.habits (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.workouts (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.reading_books (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.reading_logs (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.skills (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.skill_logs (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.bad_habits (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.bad_habit_logs (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.weekly_goals (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Cursor index, triggers, RLS, grants, realtime (identical for every table)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['habits', 'workouts', 'reading_books', 'reading_logs', 'skills', 'skill_logs', 'bad_habits', 'bad_habit_logs', 'weekly_goals'] LOOP
    EXECUTE format('CREATE INDEX %1$s_user_cursor_idx ON public.%1$I (user_id, server_updated_at)', t);

    EXECUTE format(
      'CREATE TRIGGER %1$s_keep_newer BEFORE UPDATE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.sync_keep_newer_row()', t);
    -- Runs after keep_newer (triggers fire in name order: keep_newer < stamp).
    EXECUTE format(
      'CREATE TRIGGER %1$s_stamp BEFORE INSERT OR UPDATE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.sync_stamp_row()', t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "Owner can read" ON public.%I FOR SELECT TO authenticated
         USING ((SELECT auth.uid()) = user_id)', t);
    EXECUTE format(
      'CREATE POLICY "Owner can insert" ON public.%I FOR INSERT TO authenticated
         WITH CHECK ((SELECT auth.uid()) = user_id)', t);
    EXECUTE format(
      'CREATE POLICY "Owner can update" ON public.%I FOR UPDATE TO authenticated
         USING ((SELECT auth.uid()) = user_id)
         WITH CHECK ((SELECT auth.uid()) = user_id)', t);

    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);

    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Backfill from the blob (skips ids the blob has tombstoned)
-- ---------------------------------------------------------------------------

INSERT INTO public.habits (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  e->>'id',
  e,
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'habits') = 'array' THEN ud.state->'habits' ELSE '[]'::jsonb END
) e
WHERE jsonb_typeof(e) = 'object'
  AND coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.workouts (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  e->>'id',
  e,
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'workouts') = 'array' THEN ud.state->'workouts' ELSE '[]'::jsonb END
) e
WHERE jsonb_typeof(e) = 'object'
  AND coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.reading_books (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  e->>'id',
  e,
  (e->>'addedAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'addedAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'libraryBooks') = 'array' THEN ud.state->'libraryBooks' ELSE '[]'::jsonb END
) e
WHERE jsonb_typeof(e) = 'object'
  AND coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.reading_logs (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  e->>'id',
  e,
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'readingLogs') = 'array' THEN ud.state->'readingLogs' ELSE '[]'::jsonb END
) e
WHERE jsonb_typeof(e) = 'object'
  AND coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.skills (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  e->>'id',
  e,
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'skills') = 'array' THEN ud.state->'skills' ELSE '[]'::jsonb END
) e
WHERE jsonb_typeof(e) = 'object'
  AND coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.skill_logs (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  e->>'id',
  e,
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'skillLogs') = 'array' THEN ud.state->'skillLogs' ELSE '[]'::jsonb END
) e
WHERE jsonb_typeof(e) = 'object'
  AND coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.bad_habits (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  e->>'id',
  e,
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'badHabits') = 'array' THEN ud.state->'badHabits' ELSE '[]'::jsonb END
) e
WHERE jsonb_typeof(e) = 'object'
  AND coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.bad_habit_logs (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  e->>'id',
  e,
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'badHabitLogs') = 'array' THEN ud.state->'badHabitLogs' ELSE '[]'::jsonb END
) e
WHERE jsonb_typeof(e) = 'object'
  AND coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.weekly_goals (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  e->>'weekKey',
  e,
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'weeklyGoals') = 'array' THEN ud.state->'weeklyGoals' ELSE '[]'::jsonb END
) e
WHERE jsonb_typeof(e) = 'object'
  AND coalesce(e->>'weekKey', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;
-- ---------------------------------------------------------------------------
-- Daily reminder reads the tables (the blob no longer carries these modules)
-- Same rules as before: daily habits not done today, reading/journal/skill
-- not logged today (only for users who have ever logged that module).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_daily_reminder_notifications(p_target_date text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today TEXT;
  v_row RECORD;
  v_incomplete_habits INT;
  v_missing_items TEXT[];
  v_notif_id UUID;
  v_count INT := 0;
BEGIN
  IF p_target_date IS NOT NULL AND length(p_target_date) > 0 THEN
    v_today := p_target_date;
  ELSE
    v_today := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  END IF;

  FOR v_row IN
    SELECT ud.user_id
    FROM public.user_data ud
    LEFT JOIN public.profiles p ON p.id = ud.user_id
    WHERE COALESCE(p.notif_daily_reminder, TRUE) = TRUE
  LOOP
    v_missing_items := ARRAY[]::TEXT[];

    -- A. DAILY HABITS (completions: string[] legacy or { date: { done } })
    SELECT count(*) INTO v_incomplete_habits
    FROM public.habits h
    WHERE h.user_id = v_row.user_id
      AND h.deleted_at IS NULL
      AND COALESCE(h.data->>'frequency', 'daily') <> 'weekly'
      AND NOT (
        COALESCE(h.data->'completions' @> to_jsonb(v_today), false) OR
        COALESCE((h.data->'completions'->v_today->>'done')::boolean, false)
      );

    IF v_incomplete_habits > 0 THEN
      v_missing_items := array_append(v_missing_items, v_incomplete_habits || ' habit' || CASE WHEN v_incomplete_habits > 1 THEN 's' ELSE '' END);
    END IF;

    -- B. READING
    IF EXISTS (SELECT 1 FROM public.reading_logs r WHERE r.user_id = v_row.user_id AND r.deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.reading_logs r WHERE r.user_id = v_row.user_id AND r.deleted_at IS NULL AND r.data->>'date' = v_today) THEN
      v_missing_items := array_append(v_missing_items, 'reading log');
    END IF;

    -- C. JOURNAL
    IF EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.user_id = v_row.user_id AND j.deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.user_id = v_row.user_id AND j.deleted_at IS NULL AND j.entry_date = v_today::date) THEN
      v_missing_items := array_append(v_missing_items, 'journal entry');
    END IF;

    -- D. SKILL PRACTICE
    IF EXISTS (SELECT 1 FROM public.skill_logs s WHERE s.user_id = v_row.user_id AND s.deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.skill_logs s WHERE s.user_id = v_row.user_id AND s.deleted_at IS NULL AND s.data->>'date' = v_today) THEN
      v_missing_items := array_append(v_missing_items, 'skill practice');
    END IF;

    IF array_length(v_missing_items, 1) > 0 THEN
      v_notif_id := public.create_notification_atomic(
        p_recipient_id => v_row.user_id,
        p_actor_id => NULL,
        p_actor_username => 'Ascend System',
        p_actor_avatar => '⚡',
        p_type => 'daily_reminder',
        p_title => 'Evening Tracker Check-in 🌙',
        p_message => 'Don''t break your momentum! You still have incomplete items for today: ' || array_to_string(v_missing_items, ', ') || '.',
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
$function$;

COMMIT;
