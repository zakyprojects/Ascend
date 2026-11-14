-- DB normalization, batch D (knowledge/db-normalization-plan.md)
-- The points ledger (pointsHistory) moves out of the user_data blob into
-- point_entries, one jsonb document per entry, complete (the client's
-- 500-entry cap is retired). Same sync template as the other tables, except
-- for the update rule: a points entry with a deterministic id can be excised
-- and later re-awarded, so a newer write may bring a deleted row back.
-- Entries the old cap already moved into this season's evicted counters are
-- not backfilled: their points are counted by those counters.

BEGIN;

CREATE TABLE public.point_entries (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX point_entries_user_cursor_idx ON public.point_entries (user_id, server_updated_at);

-- Last writer wins for deletes and revivals alike; an older write never applies.
CREATE OR REPLACE FUNCTION public.sync_keep_newer_revivable_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.updated_at < OLD.updated_at THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER point_entries_keep_newer BEFORE UPDATE ON public.point_entries
  FOR EACH ROW EXECUTE FUNCTION public.sync_keep_newer_revivable_row();
-- Runs after keep_newer (triggers fire in name order: keep_newer < stamp).
CREATE TRIGGER point_entries_stamp BEFORE INSERT OR UPDATE ON public.point_entries
  FOR EACH ROW EXECUTE FUNCTION public.sync_stamp_row();

ALTER TABLE public.point_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can read" ON public.point_entries FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can insert" ON public.point_entries FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can update" ON public.point_entries FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.point_entries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.point_entries TO authenticated;
REVOKE ALL ON FUNCTION public.sync_keep_newer_revivable_row() FROM PUBLIC, anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.point_entries;

-- Backfill from the blob (skips tombstoned ids and ids already in the evicted counters)
INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  e->>'id',
  e,
  (e->>'timestamp')::timestamptz,
  (e->>'timestamp')::timestamptz
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'pointsHistory') = 'array' THEN ud.state->'pointsHistory' ELSE '[]'::jsonb END
) e
WHERE jsonb_typeof(e) = 'object'
  AND coalesce(e->>'id', '') <> ''
  AND NOT coalesce(ud.state->'deletedEntityIds', '[]'::jsonb) ? (e->>'id')
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(ud.state->'evictedEntryIds') = 'array' THEN ud.state->'evictedEntryIds' ELSE '[]'::jsonb END
    ) r
    WHERE r->>'id' = e->>'id'
  )
ON CONFLICT (user_id, id) DO NOTHING;

COMMIT;
