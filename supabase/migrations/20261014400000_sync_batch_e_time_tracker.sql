-- DB normalization, batch E (knowledge/db-normalization-plan.md)
-- The time tracker moves out of the user_data blob into three jsonb document
-- tables: activities, templates, and one row per day (blocks + cleared flag,
-- last writer wins per day). Activities and templates use the revivable rule
-- of point_entries (default templates and activities are restored under their
-- fixed ids); days are never deleted and use the standard rule.
-- Requires batch D (sync_keep_newer_revivable_row).

BEGIN;

CREATE TABLE public.time_tracker_activities (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);
CREATE TABLE public.time_tracker_templates (LIKE public.time_tracker_activities INCLUDING ALL);
CREATE TABLE public.time_tracker_days (LIKE public.time_tracker_activities INCLUDING ALL);
ALTER TABLE public.time_tracker_templates
  ADD FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.time_tracker_days
  ADD FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX time_tracker_activities_user_cursor_idx ON public.time_tracker_activities (user_id, server_updated_at);
CREATE INDEX time_tracker_templates_user_cursor_idx ON public.time_tracker_templates (user_id, server_updated_at);
CREATE INDEX time_tracker_days_user_cursor_idx ON public.time_tracker_days (user_id, server_updated_at);

CREATE TRIGGER time_tracker_activities_keep_newer BEFORE UPDATE ON public.time_tracker_activities
  FOR EACH ROW EXECUTE FUNCTION public.sync_keep_newer_revivable_row();
CREATE TRIGGER time_tracker_templates_keep_newer BEFORE UPDATE ON public.time_tracker_templates
  FOR EACH ROW EXECUTE FUNCTION public.sync_keep_newer_revivable_row();
CREATE TRIGGER time_tracker_days_keep_newer BEFORE UPDATE ON public.time_tracker_days
  FOR EACH ROW EXECUTE FUNCTION public.sync_keep_newer_row();
-- Stamp runs after keep_newer (triggers fire in name order).
CREATE TRIGGER time_tracker_activities_stamp BEFORE INSERT OR UPDATE ON public.time_tracker_activities
  FOR EACH ROW EXECUTE FUNCTION public.sync_stamp_row();
CREATE TRIGGER time_tracker_templates_stamp BEFORE INSERT OR UPDATE ON public.time_tracker_templates
  FOR EACH ROW EXECUTE FUNCTION public.sync_stamp_row();
CREATE TRIGGER time_tracker_days_stamp BEFORE INSERT OR UPDATE ON public.time_tracker_days
  FOR EACH ROW EXECUTE FUNCTION public.sync_stamp_row();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['time_tracker_activities', 'time_tracker_templates', 'time_tracker_days'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Owner can read" ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id)', t);
    EXECUTE format('CREATE POLICY "Owner can insert" ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id)', t);
    EXECUTE format('CREATE POLICY "Owner can update" ON public.%I FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id)', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
  END LOOP;
END $$;

-- Backfill from the blob. Tombstoned activities, templates and blocks are skipped,
-- as the client's load sweep does. Missing or malformed times become the epoch.
CREATE FUNCTION pg_temp.iso_or_null(v text) RETURNS timestamptz LANGUAGE plpgsql AS $f$
BEGIN
  RETURN CASE WHEN v ~ '^\d{4}-\d{2}-\d{2}T' THEN v::timestamptz END;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$f$;

INSERT INTO public.time_tracker_activities (user_id, id, data, created_at, updated_at)
SELECT ud.user_id, a->>'id', a,
  coalesce(pg_temp.iso_or_null(a->>'createdAt'), 'epoch'),
  coalesce(pg_temp.iso_or_null(a->>'updatedAt'), pg_temp.iso_or_null(a->>'createdAt'), 'epoch')
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'timeTracker'->'activities') = 'array' THEN ud.state->'timeTracker'->'activities' ELSE '[]'::jsonb END
) a
WHERE jsonb_typeof(a) = 'object'
  AND coalesce(a->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (a->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

INSERT INTO public.time_tracker_templates (user_id, id, data, created_at, updated_at)
SELECT ud.user_id, t->>'id', t,
  coalesce(pg_temp.iso_or_null(t->>'createdAt'), 'epoch'),
  coalesce(pg_temp.iso_or_null(t->>'updatedAt'), pg_temp.iso_or_null(t->>'createdAt'), 'epoch')
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'timeTracker'->'templates') = 'array' THEN ud.state->'timeTracker'->'templates' ELSE '[]'::jsonb END
) t
WHERE jsonb_typeof(t) = 'object'
  AND coalesce(t->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (t->>'id')
ON CONFLICT (user_id, id) DO NOTHING;

WITH tt AS (
  SELECT ud.user_id,
    CASE WHEN jsonb_typeof(ud.state->'timeTracker'->'dailyLogs') = 'object' THEN ud.state->'timeTracker'->'dailyLogs' ELSE '{}'::jsonb END AS logs,
    CASE WHEN jsonb_typeof(ud.state->'timeTracker'->'clearedDates') = 'array' THEN ud.state->'timeTracker'->'clearedDates' ELSE '[]'::jsonb END AS cleared,
    coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) AS tombstones
  FROM public.user_data ud
  WHERE ud.state ? 'timeTracker'
),
dates AS (
  SELECT DISTINCT tt.user_id, d.date, tt.logs, tt.cleared, tt.tombstones
  FROM tt
  CROSS JOIN LATERAL (
    SELECT jsonb_object_keys(tt.logs) AS date
    UNION
    SELECT jsonb_array_elements_text(tt.cleared)
  ) d
  WHERE d.date ~ '^\d{4}-\d{2}-\d{2}$'
),
days AS (
  SELECT dates.user_id, dates.date,
    CASE WHEN jsonb_typeof(dates.logs->dates.date) = 'array' THEN (
      SELECT coalesce(jsonb_agg(b ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(dates.logs->dates.date) WITH ORDINALITY AS x(b, ord)
      WHERE NOT (coalesce(b->>'id', '') <> '' AND dates.tombstones ? (b->>'id'))
    ) END AS blocks,
    dates.cleared ? dates.date AS is_cleared
  FROM dates
)
INSERT INTO public.time_tracker_days (user_id, id, data, created_at, updated_at)
SELECT days.user_id, days.date,
  jsonb_build_object('date', days.date)
    || CASE WHEN days.blocks IS NOT NULL THEN jsonb_build_object('blocks', days.blocks) ELSE '{}'::jsonb END
    || CASE WHEN days.is_cleared THEN jsonb_build_object('cleared', true) ELSE '{}'::jsonb END,
  (days.date || 'T00:00:00Z')::timestamptz,
  coalesce((
    SELECT max(pg_temp.iso_or_null(b->>f))
    FROM jsonb_array_elements(coalesce(days.blocks, '[]'::jsonb)) b
    CROSS JOIN unnest(ARRAY['updatedAt', 'completedAt', 'skippedAt', 'breakStartedAt', 'breakEndedAt', 'createdAt']) f
  ), (days.date || 'T00:00:00Z')::timestamptz)
FROM days
ON CONFLICT (user_id, id) DO NOTHING;

COMMIT;
