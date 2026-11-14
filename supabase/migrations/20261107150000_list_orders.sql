-- User-set order of lists (knowledge/mode-a-reorder-items-2026-11-07.md, Zakria's go 2026-11-07).
--
-- One jsonb document per list: row id = list key ('habits', 'goals', 'tasks', 'skills',
-- 'badHabits', 'books:toRead', 'plans', 'tt:activities', 'tt:templates', 'weeklyGoals:<week>',
-- 'drills:<skill id>'), data = { id, ids: [item ids in order], createdAt, updatedAt }.
-- A reorder writes this one row and never a module row, so no award trigger runs and points
-- cannot change. Projects keep their own projects.sort_order (it is the unlock order).
--
-- Same sync template as the other document tables (20261014200000_sync_batch_c.sql):
--   * PK (user_id, id), updated_at last-writer-wins, deleted_at soft delete, server_updated_at cursor
--   * sync_keep_newer_row + sync_stamp_row (names sort keep_newer < stamp; the stamp caps a future updated_at)
--   * owner RLS for select/insert/update, no DELETE policy or grant
--   * explicit grants (Supabase no longer auto-grants new tables since 2026-10-30)
--   * realtime publication
--   * size limit; ids must be an array of strings (checked by type and size, not item by item)
-- The 30-day soft-delete purge gains the table (its list is otherwise unchanged; keep
-- PURGE_AFTER_DAYS in src/lib/sync/pull.ts equal to the interval).
-- Account deletion and guest cleanup delete auth.users, and the FK cascades the rows.
-- Older apps never read or write this table, so it is safe to apply before the app ships.

BEGIN;

CREATE TABLE public.list_orders (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT list_orders_ids_array CHECK (jsonb_typeof(data->'ids') = 'array'),
  -- ~2,000 ids of ~20 characters; a list never comes close.
  CONSTRAINT list_orders_data_size CHECK (octet_length(data::text) <= 65536)
);

CREATE INDEX list_orders_user_cursor_idx ON public.list_orders (user_id, server_updated_at);

CREATE TRIGGER list_orders_keep_newer BEFORE UPDATE ON public.list_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_keep_newer_row();
CREATE TRIGGER list_orders_stamp BEFORE INSERT OR UPDATE ON public.list_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_stamp_row();

ALTER TABLE public.list_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can read" ON public.list_orders FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can insert" ON public.list_orders FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can update" ON public.list_orders FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.list_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.list_orders TO authenticated;
GRANT ALL ON public.list_orders TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.list_orders;

-- Soft-delete purge: the live body (20261017090000) plus list_orders.
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
    'addiction_trackers', 'lesson_reads', 'list_orders'
  ] LOOP
    EXECUTE format('DELETE FROM public.%I WHERE deleted_at IS NOT NULL AND deleted_at < $1', v_table)
      USING v_cutoff;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_purge_soft_deleted_rows() FROM PUBLIC, anon, authenticated;

COMMIT;
