-- DB normalization, batch F (knowledge/db-normalization-plan.md)
-- League archives (leagueArchives) move out of the user_data blob into
-- league_archives, one jsonb document per archive keyed by its period id
-- (W:<week>, M:<month>, S:<season>). Same template as point_entries: the
-- client trims each type to its newest 12 without a tombstone and re-creates
-- a period under the same id, so a newer write may bring a deleted row back.
-- Archived standings are slimmed to final standings only: a competitor
-- snapshot no longer keeps another member's stats, habits or season history.
-- The client slims the same fields (lib/leagues.ts ARCHIVED_COMPETITOR_FIELDS).

BEGIN;

CREATE TABLE public.league_archives (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX league_archives_user_cursor_idx ON public.league_archives (user_id, server_updated_at);

CREATE TRIGGER league_archives_keep_newer BEFORE UPDATE ON public.league_archives
  FOR EACH ROW EXECUTE FUNCTION public.sync_keep_newer_revivable_row();
-- Runs after keep_newer (triggers fire in name order: keep_newer < stamp).
CREATE TRIGGER league_archives_stamp BEFORE INSERT OR UPDATE ON public.league_archives
  FOR EACH ROW EXECUTE FUNCTION public.sync_stamp_row();

ALTER TABLE public.league_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can read" ON public.league_archives FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can insert" ON public.league_archives FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can update" ON public.league_archives FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.league_archives FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.league_archives TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.league_archives;

-- Backfill from the blob: archives with an id (the client drops the rest on load),
-- standings slimmed, the first copy of a duplicated id kept.
INSERT INTO public.league_archives (user_id, id, data, created_at, updated_at)
SELECT
  ud.user_id,
  a->>'id',
  a || jsonb_build_object(
    'competitors',
    coalesce((
      SELECT jsonb_agg(
        (SELECT coalesce(jsonb_object_agg(f.key, f.value), '{}'::jsonb)
         FROM jsonb_each(c.value) f
         WHERE f.key IN ('id', 'uid', 'name', 'avatar', 'points', 'totalPoints', 'isUser', 'isRealUser'))
        ORDER BY c.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(a->'competitors') = 'array' THEN a->'competitors' ELSE '[]'::jsonb END
      ) WITH ORDINALITY c
      WHERE jsonb_typeof(c.value) = 'object'
    ), '[]'::jsonb)
  ),
  coalesce((a->>'archivedAt')::timestamptz, now()),
  coalesce((a->>'archivedAt')::timestamptz, now())
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ud.state->'leagueArchives') = 'array' THEN ud.state->'leagueArchives' ELSE '[]'::jsonb END
) a
WHERE jsonb_typeof(a) = 'object'
  AND coalesce(a->>'id', '') <> ''
ON CONFLICT (user_id, id) DO NOTHING;

COMMIT;
