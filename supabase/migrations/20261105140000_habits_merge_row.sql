-- Habits: two copies of a habit merge completion by completion (fix 6 of
-- knowledge/mode-a-sync-scenarios-2026-11-05.md, design in knowledge/mode-a-sync-remaining-2026-11-05.md;
-- Zakria's go 2026-11-05, "sab fixes and sql ke liye go").
--
-- Why: a habit is one row whose jsonb doc holds every tick (data.completions, keyed by day/period).
-- sync_keep_newer_row kept the whole newer row, so two devices ticking different days of one habit
-- within seconds, or one ticking while the other renamed it, lost one side's change.
--
-- habits_merge_row replaces sync_keep_newer_row on this table only (same trigger name
-- habits_keep_newer, BEFORE UPDATE as before, so it still runs after habits_guard_future and before
-- habits_normalize_points / habits_stamp). For two live rows whose completions are both objects:
--   * completions: every key of both; a key in both takes the entry with the later updatedAt (an
--     untick is done:false with its time, so the later of tick/untick wins); on a tie, or an entry
--     without a time, the newer row's entry. Same rule as the client's mergeHabitCompletions.
--   * missedPeriods (penalty memory): the newer row's list, then the older row's entries it lacks.
--   * everything else (name, frequency, points, ...) from the newer row (later updated_at), as before.
--   * a stale write still never wins the row: the result keeps the newer updated_at, and a merge that
--     changes nothing is dropped as before (RETURN NULL).
-- Deletes, writes to a deleted row, and docs with legacy array completions keep the old row rule
-- exactly. habits_award_points (AFTER) recomputes today's awards from the stored, merged row, so the
-- server counts every tick the user made; no points function changes. Old app versions write the
-- same doc shape and get the same merge.
--
-- Rollback: work/snapshots/sync-remaining-2026-11-05/ROLLBACK.md.

BEGIN;

CREATE OR REPLACE FUNCTION public.habits_merge_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_new_wins    boolean;
  v_newer       jsonb;
  v_older       jsonb;
  v_completions jsonb;
  v_newer_miss  jsonb;
  v_older_miss  jsonb;
  v_missed      jsonb;
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  -- Deletes and legacy docs: the row-level rule of sync_keep_newer_row.
  IF NEW.deleted_at IS NOT NULL
     OR jsonb_typeof(NEW.data->'completions') IS DISTINCT FROM 'object'
     OR jsonb_typeof(OLD.data->'completions') IS DISTINCT FROM 'object'
  THEN
    IF NEW.deleted_at IS NULL AND NEW.updated_at < OLD.updated_at THEN
      RETURN NULL;
    END IF;
    RETURN NEW;
  END IF;

  v_new_wins := NEW.updated_at >= OLD.updated_at;
  v_newer := CASE WHEN v_new_wins THEN NEW.data ELSE OLD.data END;
  v_older := CASE WHEN v_new_wins THEN OLD.data ELSE NEW.data END;

  SELECT coalesce(jsonb_object_agg(k.key,
           CASE
             WHEN o.value IS NULL THEN n.value
             WHEN n.value IS NULL THEN o.value
             WHEN coalesce(public.ascend_instant(CASE WHEN jsonb_typeof(o.value) = 'object' THEN o.value->>'updatedAt' END), '-infinity'::timestamptz)
                > coalesce(public.ascend_instant(CASE WHEN jsonb_typeof(n.value) = 'object' THEN n.value->>'updatedAt' END), '-infinity'::timestamptz)
               THEN o.value
             ELSE n.value
           END), '{}'::jsonb)
  INTO v_completions
  FROM (
    SELECT jsonb_object_keys(v_newer->'completions') AS key
    UNION
    SELECT jsonb_object_keys(v_older->'completions')
  ) k
  LEFT JOIN jsonb_each(v_newer->'completions') n ON n.key = k.key
  LEFT JOIN jsonb_each(v_older->'completions') o ON o.key = k.key;

  v_newer_miss := CASE WHEN jsonb_typeof(v_newer->'missedPeriods') = 'array' THEN v_newer->'missedPeriods' END;
  v_older_miss := CASE WHEN jsonb_typeof(v_older->'missedPeriods') = 'array' THEN v_older->'missedPeriods' END;
  IF v_newer_miss IS NOT NULL OR v_older_miss IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(e.v ORDER BY e.side, e.ord), '[]'::jsonb)
    INTO v_missed
    FROM (
      SELECT x.v, x.ord, 0 AS side
      FROM jsonb_array_elements(coalesce(v_newer_miss, '[]'::jsonb)) WITH ORDINALITY AS x(v, ord)
      UNION ALL
      SELECT x.v, x.ord, 1
      FROM jsonb_array_elements(coalesce(v_older_miss, '[]'::jsonb)) WITH ORDINALITY AS x(v, ord)
      WHERE NOT (coalesce(v_newer_miss, '[]'::jsonb) @> jsonb_build_array(x.v))
    ) e;
  END IF;

  NEW.data := v_newer
    || jsonb_build_object('completions', v_completions)
    || CASE WHEN v_missed IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('missedPeriods', v_missed) END;
  IF NOT v_new_wins THEN
    IF NEW.data = OLD.data THEN
      RETURN NULL;
    END IF;
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger function only (SECURITY DEFINER for ascend_instant, like weekly_goals_merge_row).
REVOKE EXECUTE ON FUNCTION public.habits_merge_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS habits_keep_newer ON public.habits;
CREATE TRIGGER habits_keep_newer BEFORE UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.habits_merge_row();

COMMIT;
