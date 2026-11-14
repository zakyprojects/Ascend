-- Purge soft-deleted rows 30 days after their delete.
-- Synced tables soft-delete (deleted_at) so other devices learn about a delete on their next
-- pull. After 30 days every device that syncs at least monthly has seen it, so the row is
-- removed for good. A device that last synced longer ago drops its stale copies on its next
-- full pull (src/lib/sync/pull.ts, PURGE_AFTER_DAYS: keep the two values equal).
--
-- Not purged:
-- - point_entries: a deleted points row is the memory that an award was revoked (for example
--   the one-per-book reading bonus), so purging it could let the award come back.
-- - league_archives: server-owned history.
-- Account deletion is unaffected: delete_own_account already removes every row by cascade.
-- No DELETE triggers exist on these tables (checked 2026-10-17), so a purge recomputes nothing.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_purge_soft_deleted_rows()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_cutoff timestamptz := now() - interval '30 days';
  v_table  text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'decision_logs', 'emotion_logs', 'craving_logs', 'journal_entries', 'focus_logs',
    'goals', 'projects', 'tasks', 'habits', 'workouts', 'reading_books', 'reading_logs',
    'skills', 'skill_logs', 'bad_habits', 'bad_habit_logs', 'weekly_goals',
    'time_tracker_activities', 'time_tracker_templates', 'time_tracker_days',
    'addiction_trackers', 'lesson_reads'
  ] LOOP
    EXECUTE format('DELETE FROM public.%I WHERE deleted_at IS NOT NULL AND deleted_at < $1', v_table)
      USING v_cutoff;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_purge_soft_deleted_rows() FROM PUBLIC, anon, authenticated;

-- Daily at 21:40 UTC (02:40 PKT), away from the hourly jobs at :00 to :15.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ascend-purge-soft-deleted-daily';
SELECT cron.schedule('ascend-purge-soft-deleted-daily', '40 21 * * *', 'SELECT public.ascend_purge_soft_deleted_rows()');

COMMIT;
