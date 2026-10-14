-- Data repair: weekly reflection awards lost to a merge tie-break.
-- Load consolidation turned a legacy reflection award into weekly_review_<week>; the
-- merger then tombstoned that canonical entry (id tie-break), and the legacy row was
-- deleted from point_entries. The week kept no award on the server.
-- Revive the legacy award for every week whose entries still net positive but have no
-- live entry left. The client then consolidates it into weekly_review_<week> at its
-- original amount and timestamp (Zakria, 2026-10-14: a 20-point award stays 20).
-- Idempotent: a repaired week has a live entry and is skipped on a second run.

BEGIN;

WITH reviews AS (
  SELECT user_id, id, deleted_at, (data->>'amount')::numeric AS amount,
    coalesce(data->'metadata'->>'weekKey', substring(data->>'reason' FROM '\d{4}-W\d{2}')) AS week_key
  FROM public.point_entries
  WHERE data->>'source' = 'weekly_review'
),
lost_weeks AS (
  SELECT user_id, week_key
  FROM reviews
  WHERE week_key IS NOT NULL
  GROUP BY user_id, week_key
  HAVING sum(amount) > 0 AND NOT bool_or(deleted_at IS NULL)
)
UPDATE public.point_entries pe
SET deleted_at = NULL,
    updated_at = clock_timestamp()
FROM reviews r
JOIN lost_weeks w USING (user_id, week_key)
WHERE pe.user_id = r.user_id
  AND pe.id = r.id
  AND r.deleted_at IS NOT NULL
  AND r.amount > 0;

COMMIT;
