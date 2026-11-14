-- DB normalization, batch A (knowledge/db-normalization-plan.md)
-- Moves six blob collections without point-ledger coupling into relational
-- tables, following the PFC pilot template (20261014000000_sync_foundation_pfc_logs.sql):
--   * PK (user_id, id text), client ids kept
--   * updated_at last-writer-wins, deleted_at soft delete, server_updated_at cursor
--   * owner-only RLS, no DELETE grant, realtime
--   * reuses the shared triggers sync_stamp_row + sync_keep_newer_row
-- Tables: craving_logs, journal_entries, focus_logs, goals, projects, tasks.
-- Safe to re-run the backfill part: ON CONFLICT DO NOTHING.

BEGIN;

CREATE TABLE public.craving_logs (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  logged_at         timestamptz NOT NULL,
  intensity         smallint    NOT NULL CHECK (intensity BETWEEN 1 AND 10),
  trigger_text      text        NOT NULL DEFAULT '',
  coping_strategy   text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.journal_entries (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  entry_date        date        NOT NULL,
  mood              text        NOT NULL,
  content           text        NOT NULL DEFAULT '',
  points_awarded    boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.focus_logs (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  log_date          date        NOT NULL,
  task_name         text        NOT NULL DEFAULT '',
  skill_id          text,
  duration_minutes  integer     NOT NULL DEFAULT 0,
  points_awarded    integer     NOT NULL DEFAULT 0,
  reflection        text,
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.goals (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  title             text        NOT NULL DEFAULT '',
  description       text,
  category          text,
  target_date       date,
  status            text        NOT NULL DEFAULT 'active',
  manual_progress   numeric,
  sequential_mode   boolean,
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.projects (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  title             text        NOT NULL DEFAULT '',
  description       text,
  goal_id           text,
  start_date        date,
  due_date          date,
  status            text        NOT NULL DEFAULT 'not_started',
  completed_at      timestamptz,
  manual_progress   numeric,
  sort_order        integer,
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

-- Subtasks stay embedded (jsonb): they are only ever edited through their task.
CREATE TABLE public.tasks (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  title             text        NOT NULL DEFAULT '',
  description       text,
  project_id        text,
  due_date          date,
  priority          text        NOT NULL DEFAULT 'medium',
  completed         boolean     NOT NULL DEFAULT false,
  subtasks          jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(subtasks) = 'array'),
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
  FOREACH t IN ARRAY ARRAY['craving_logs', 'journal_entries', 'focus_logs', 'goals', 'projects', 'tasks'] LOOP
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

INSERT INTO public.craving_logs (
  user_id, id, logged_at, intensity, trigger_text, coping_strategy, created_at, updated_at
)
SELECT
  ud.user_id,
  e->>'id',
  coalesce(e->>'date', e->>'createdAt')::timestamptz,
  least(10, greatest(1, coalesce((e->>'intensity')::numeric, 1)))::smallint,
  coalesce(e->>'trigger', ''),
  coalesce(e->>'copingStrategy', ''),
  coalesce(e->>'createdAt', e->>'date')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt', e->>'date')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(coalesce(ud.state->'cravingLogs', '[]'::jsonb)) e
WHERE coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.journal_entries (
  user_id, id, entry_date, mood, content, points_awarded, created_at, updated_at
)
SELECT
  ud.user_id,
  e->>'id',
  (e->>'date')::date,
  coalesce(e->>'mood', 'neutral'),
  coalesce(e->>'content', ''),
  coalesce((e->>'pointsAwarded')::boolean, false),
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(coalesce(ud.state->'journalEntries', '[]'::jsonb)) e
WHERE coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.focus_logs (
  user_id, id, log_date, task_name, skill_id, duration_minutes, points_awarded,
  reflection, created_at, updated_at
)
SELECT
  ud.user_id,
  e->>'id',
  (e->>'date')::date,
  coalesce(e->>'taskName', ''),
  nullif(e->>'skillId', ''),
  coalesce((e->>'durationMinutes')::numeric, 0)::integer,
  coalesce((e->>'pointsAwarded')::numeric, 0)::integer,
  e->>'reflection',
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(coalesce(ud.state->'focusLogs', '[]'::jsonb)) e
WHERE coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.goals (
  user_id, id, title, description, category, target_date, status,
  manual_progress, sequential_mode, created_at, updated_at
)
SELECT
  ud.user_id,
  e->>'id',
  coalesce(e->>'title', ''),
  e->>'description',
  e->>'category',
  nullif(e->>'targetDate', '')::date,
  coalesce(e->>'status', 'active'),
  (e->>'manualProgress')::numeric,
  (e->>'sequentialMode')::boolean,
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(coalesce(ud.state->'goals', '[]'::jsonb)) e
WHERE coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.projects (
  user_id, id, title, description, goal_id, start_date, due_date, status,
  completed_at, manual_progress, sort_order, created_at, updated_at
)
SELECT
  ud.user_id,
  e->>'id',
  coalesce(e->>'title', ''),
  e->>'description',
  nullif(e->>'goalId', ''),
  nullif(e->>'startDate', '')::date,
  nullif(e->>'dueDate', '')::date,
  coalesce(e->>'status', 'not_started'),
  nullif(e->>'completedAt', '')::timestamptz,
  (e->>'manualProgress')::numeric,
  (e->>'order')::numeric::integer,
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(coalesce(ud.state->'projects', '[]'::jsonb)) e
WHERE coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.tasks (
  user_id, id, title, description, project_id, due_date, priority, completed,
  subtasks, created_at, updated_at
)
SELECT
  ud.user_id,
  e->>'id',
  coalesce(e->>'title', ''),
  e->>'description',
  nullif(e->>'projectId', ''),
  nullif(e->>'dueDate', '')::date,
  coalesce(e->>'priority', 'medium'),
  coalesce((e->>'completed')::boolean, false),
  CASE WHEN jsonb_typeof(e->'subtasks') = 'array'
       THEN (SELECT coalesce(jsonb_agg(st), '[]'::jsonb)
               FROM jsonb_array_elements(e->'subtasks') st
              WHERE NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (st->>'id'))
       ELSE '[]'::jsonb END,
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(coalesce(ud.state->'tasks', '[]'::jsonb)) e
WHERE coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

COMMIT;
