-- Weekly goals: two copies of a week merge goal by goal (knowledge/mode-a-weekly-goals-linking-2026-10-19.md
-- gap 8; Zakria 2026-10-19). A week is one weekly_goals row, so far kept whole by sync_keep_newer_row
-- (the newer updated_at wins): two devices changing DIFFERENT goals of one week lost one side's change.
--
-- weekly_goals_merge_row replaces sync_keep_newer_row on this table only (same trigger name, so it
-- still fires before weekly_goals_stamp). For a write from this app version (its doc carries
-- deletedGoalIds, see withDeletedGoalIds in src/lib/store.ts):
--   * goals merge by id: the copy with the later updatedAt (createdAt for goals saved before it
--     existed) wins; on a tie the newer row's fields go over the older copy's;
--   * a goal only one copy has is kept, unless either copy lists it in deletedGoalIds (the lists
--     are united, so a deleted goal never comes back);
--   * everything else in the doc (reflections, createdAt) comes from the newer row, as before;
--   * a stale write still never wins the row: the result keeps the newer updated_at, and when the
--     merge changes nothing it is dropped like before.
-- Writes without deletedGoalIds (older app builds), deletes and revivals keep the old row rule
-- exactly. Client mirror: mergeWeeklyGoals in src/lib/stateMerger.ts.
-- Run order: BEFORE the studio test. Safe for the production app (its writes have no deletedGoalIds).

BEGIN;

CREATE OR REPLACE FUNCTION public.weekly_goals_merge_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_new_wins boolean;
  v_newer    jsonb;
  v_older    jsonb;
  v_deleted  jsonb;
  v_goals    jsonb;
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  -- Deletes and older app builds: the row-level rule of sync_keep_newer_row.
  IF NEW.deleted_at IS NOT NULL OR jsonb_typeof(NEW.data->'deletedGoalIds') IS DISTINCT FROM 'array' THEN
    IF NEW.deleted_at IS NULL AND NEW.updated_at < OLD.updated_at THEN
      RETURN NULL;
    END IF;
    RETURN NEW;
  END IF;

  v_new_wins := NEW.updated_at >= OLD.updated_at;
  v_newer := CASE WHEN v_new_wins THEN NEW.data ELSE OLD.data END;
  v_older := CASE WHEN v_new_wins THEN OLD.data ELSE NEW.data END;

  SELECT coalesce(jsonb_agg(d.id ORDER BY d.id), '[]'::jsonb)
  INTO v_deleted
  FROM (
    SELECT jsonb_array_elements_text(NEW.data->'deletedGoalIds') AS id
    UNION
    SELECT jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(OLD.data->'deletedGoalIds') = 'array' THEN OLD.data->'deletedGoalIds' ELSE '[]'::jsonb END)
  ) d;

  WITH rows AS (
    SELECT x.value AS goal, x.ord, 0 AS side
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_newer->'goals') = 'array' THEN v_newer->'goals' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(value, ord)
    UNION ALL
    SELECT x.value, x.ord, 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_older->'goals') = 'array' THEN v_older->'goals' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(value, ord)
  ), keyed AS (
    SELECT r.goal, r.ord, r.side,
           CASE WHEN jsonb_typeof(r.goal) = 'object' AND coalesce(r.goal->>'id', '') <> '' THEN r.goal->>'id' END AS id,
           coalesce(
             public.ascend_instant(CASE WHEN jsonb_typeof(r.goal) = 'object'
                                        THEN coalesce(nullif(r.goal->>'updatedAt', ''), r.goal->>'createdAt') END),
             '-infinity'::timestamptz) AS changed
    FROM rows r
  ), live AS (
    -- A goal without an id is kept only from the newer row; a deleted id from neither.
    SELECT k.* FROM keyed k
    WHERE (k.id IS NULL AND k.side = 0) OR (k.id IS NOT NULL AND NOT (v_deleted ? k.id))
  ), merged AS (
    SELECT coalesce(n.ord, 1000000 + o.ord) AS ord,
           CASE
             WHEN n.goal IS NULL THEN o.goal
             WHEN o.goal IS NULL THEN n.goal
             WHEN o.changed > n.changed THEN o.goal
             WHEN n.changed > o.changed THEN n.goal
             ELSE o.goal || n.goal
           END AS goal
    FROM (SELECT * FROM live WHERE side = 0) n
    FULL JOIN (SELECT * FROM live WHERE side = 1 AND id IS NOT NULL) o ON o.id = n.id
  )
  SELECT coalesce(jsonb_agg(m.goal ORDER BY m.ord), '[]'::jsonb)
  INTO v_goals
  FROM merged m;

  NEW.data := v_newer || jsonb_build_object('goals', v_goals, 'deletedGoalIds', v_deleted);
  IF NOT v_new_wins THEN
    IF NEW.data = OLD.data THEN
      RETURN NULL;
    END IF;
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$function$;

-- A trigger function needs no grant to fire.
REVOKE EXECUTE ON FUNCTION public.weekly_goals_merge_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS weekly_goals_keep_newer ON public.weekly_goals;
CREATE TRIGGER weekly_goals_keep_newer BEFORE UPDATE ON public.weekly_goals
  FOR EACH ROW EXECUTE FUNCTION public.weekly_goals_merge_row();

COMMIT;
