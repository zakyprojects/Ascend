-- Phase 0 / S1: relational sync foundation + pilot tables (Prefrontal Cortex logs).
-- Pilot tables mirror user_data.state.decisionLogs / emotionLogs. Reads and writes
-- stay on the blob until S2 (dual-write) and S3 (read switch) ship.
--
-- Sync-table conventions (reused by every later module):
--   * PK (user_id, id): client ids are only unique per user.
--   * updated_at      = client edit time; last-writer-wins key.
--   * deleted_at      = soft delete (tombstone that never expires). No DELETE grant.
--   * server_updated_at = server clock, cursor for delta pulls.
--   * RLS owner-only; triggers sync_stamp_row + sync_keep_newer_row.

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

-- Stamps the server cursor and pins identity columns.
CREATE OR REPLACE FUNCTION public.sync_stamp_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.user_id := OLD.user_id;
    NEW.id := OLD.id;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.server_updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- Drops an UPDATE that is older than the stored row (offline replay, second tab),
-- and never lets a write bring a soft-deleted row back.
CREATE OR REPLACE FUNCTION public.sync_keep_newer_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF NEW.deleted_at IS NULL AND NEW.updated_at < OLD.updated_at THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- decision_logs
-- ---------------------------------------------------------------------------

CREATE TABLE public.decision_logs (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  title             text        NOT NULL,
  rationale         text        NOT NULL DEFAULT '',
  expected_outcome  text        NOT NULL DEFAULT '',
  revisit_date      date        NOT NULL,
  reflection        text,
  is_reflected      boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX decision_logs_user_cursor_idx
  ON public.decision_logs (user_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- emotion_logs
-- ---------------------------------------------------------------------------

CREATE TABLE public.emotion_logs (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  logged_at         timestamptz NOT NULL,
  emotion           text        NOT NULL,
  intensity         smallint    NOT NULL CHECK (intensity BETWEEN 1 AND 10),
  context           text        NOT NULL DEFAULT '',
  points_awarded    integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX emotion_logs_user_cursor_idx
  ON public.emotion_logs (user_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- Triggers, RLS, grants, realtime (identical for both tables)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['decision_logs', 'emotion_logs'] LOOP
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

INSERT INTO public.decision_logs (
  user_id, id, title, rationale, expected_outcome, revisit_date,
  reflection, is_reflected, created_at, updated_at
)
SELECT
  ud.user_id,
  e->>'id',
  coalesce(e->>'title', ''),
  coalesce(e->>'rationale', ''),
  coalesce(e->>'expectedOutcome', ''),
  (e->>'revisitDate')::date,
  e->>'reflection',
  coalesce((e->>'isReflected')::boolean, false),
  (e->>'createdAt')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(coalesce(ud.state->'decisionLogs', '[]'::jsonb)) e
WHERE coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.emotion_logs (
  user_id, id, logged_at, emotion, intensity, context, points_awarded,
  created_at, updated_at
)
SELECT
  ud.user_id,
  e->>'id',
  coalesce(e->>'date', e->>'createdAt')::timestamptz,
  coalesce(e->>'emotion', ''),
  least(10, greatest(1, coalesce((e->>'intensity')::numeric, 1)))::smallint,
  coalesce(e->>'context', ''),
  coalesce((e->>'pointsAwarded')::numeric, 0)::integer,
  coalesce(e->>'createdAt', e->>'date')::timestamptz,
  coalesce(e->>'updatedAt', e->>'createdAt', e->>'date')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(coalesce(ud.state->'emotionLogs', '[]'::jsonb)) e
WHERE coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

COMMIT;
