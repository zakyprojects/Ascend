-- DB normalization, batch H (knowledge/db-normalization-plan.md)
-- The sobriety tracker (addictionTracker) moves out of the user_data blob into
-- addiction_trackers, one jsonb document per tracker id. It was the last blob
-- entity whose delete reached other devices only through the blob's
-- deletedEntityIds; with its own row, a delete travels as deleted_at like every
-- synced table, and the tombstone lists become device-local.
-- A new tracker always gets a new id, so a deleted row is never revived
-- (sync_keep_newer_row, the habits template).

BEGIN;

CREATE TABLE public.addiction_trackers (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX addiction_trackers_user_cursor_idx ON public.addiction_trackers (user_id, server_updated_at);

CREATE TRIGGER addiction_trackers_keep_newer BEFORE UPDATE ON public.addiction_trackers
  FOR EACH ROW EXECUTE FUNCTION public.sync_keep_newer_row();
-- Runs after keep_newer (triggers fire in name order: keep_newer < stamp).
CREATE TRIGGER addiction_trackers_stamp BEFORE INSERT OR UPDATE ON public.addiction_trackers
  FOR EACH ROW EXECUTE FUNCTION public.sync_stamp_row();

ALTER TABLE public.addiction_trackers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can read" ON public.addiction_trackers FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can insert" ON public.addiction_trackers FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can update" ON public.addiction_trackers FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.addiction_trackers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.addiction_trackers TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.addiction_trackers;

-- Backfill from the blob: the current tracker, when it has an id. updated_at is the
-- later of createdAt and startDate (a relapse moves startDate), so a device
-- re-uploading the same tracker with its own time does not overwrite it.
INSERT INTO public.addiction_trackers (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  t->>'id',
  t,
  coalesce((t->>'createdAt')::timestamptz, (t->>'startDate')::timestamptz, now()),
  greatest(
    coalesce((t->>'createdAt')::timestamptz, now()),
    coalesce((t->>'startDate')::timestamptz, (t->>'createdAt')::timestamptz, now())
  )
FROM public.user_data ud
CROSS JOIN LATERAL (SELECT ud.state->'addictionTracker' AS t) x
WHERE jsonb_typeof(t) = 'object'
  AND coalesce(t->>'id', '') <> ''
ON CONFLICT (user_id, id) DO NOTHING;

COMMIT;
