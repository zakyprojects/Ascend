-- Weekly goal completion time is never before the goal existed in its current form
-- (knowledge/mode-a-weekly-goals-linking-2026-10-19.md gap 4; Zakria 2026-10-19).
--
-- A linked goal created, re-linked or re-targeted after its week's logs already met the target was
-- stamped with the earlier log's time, so its 5 pts landed (and were held) on an earlier day.
-- Progress counting is unchanged: earlier logs of the same week still count. Only the instant used
-- for points moves: completion = the latest of completedAt (createdAt when missing), createdAt and
-- linkEditedAt (set by the app whenever a goal's link, item, Count or target changes).
-- Goals counted on an earlier day keep their held time (ascend_recompute_weekly_goal_awards takes
-- the earlier of the held time and this one), so nothing already earned moves or drops.
-- CREATE OR REPLACE from the LIVE definition (read 2026-10-19); signature, ACL and search_path unchanged.
-- Client mirror: getWeeklyGoalCompletionTime in src/lib/pointsConfig.ts.
-- Run order: BEFORE the studio test (after 20261019200000). Older app builds never write
-- linkEditedAt, so their goals get the createdAt floor only.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_goal_completion_time(p_goal jsonb)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT coalesce(
    greatest(
      CASE
        WHEN coalesce(p_goal->>'completedAt', '') <> '' THEN public.ascend_instant(p_goal->>'completedAt')
        WHEN coalesce(p_goal->>'createdAt', '') <> '' THEN public.ascend_instant(p_goal->>'createdAt')
        ELSE timestamptz '1970-01-01 00:00:00+00'
      END,
      public.ascend_instant(p_goal->>'createdAt'),
      public.ascend_instant(p_goal->>'linkEditedAt')
    ),
    timestamptz '1970-01-01 00:00:00+00');
$function$;

COMMIT;
