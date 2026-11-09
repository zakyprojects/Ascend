-- Recovery points from a daily "Clean today" check-in (knowledge/mode-a-recovery-points-2026-11-09.md,
-- final rules from Zakria 2026-11-09). Replaces the 1 week / 1 month / 90 days milestone awards.
--
-- Rules (server-authoritative; src/lib/recoveryAwards.ts mirrors them):
--   * One check-in per user per local day (00:00-24:00 in the user's timezone), across all trackers:
--     table recovery_checkins, row id = the day 'YYYY-MM-DD'. A check-in earns 1 point
--     (point_entries 'recovery_day_<day>', source 'recovery_checkin').
--   * The app can add today's check-in, or yesterday's when it was missed (late tap). Anything else
--     (two or more days ago, tomorrow, an edit of an existing row) is dropped silently, like the
--     reading/skill late-day guards. A second device's tap on the same day is a no-op.
--   * Undo (the tick on the done card): the app may soft-delete (deleted_at) TODAY's check-in only,
--     today in the writer's timezone. That also soft-deletes today's point (recovery_day_<today>),
--     only while that day is still the user's current local day. A delete of yesterday's or an older
--     check-in is dropped and never touches a point. After an undo the app may tap Clean today again
--     (the deleted row comes back, today or yesterday only); the same single point comes back once
--     (same id, never a second one), so undo + re-tap cannot farm points.
--   * No tap = no point; the streak itself is not affected (it runs from the tracker's startDate).
--   * The day the tracker was created (local day of the new server-stamped
--     addiction_trackers.server_created_at, never the client's created_at) earns 0; points start on
--     the next local day. A day the streak (re)started in (startDate inside the day) earns 0.
--   * Season cap: at most 90 recovery points per season (check-ins plus the old milestone rows of
--     that season), enforced here. The streak carries across seasons; each season allows 90 again.
--   * No bonuses. Earned points are never taken back: a relapse or a deleted tracker changes nothing
--     already written; the only exception is the user's own undo of today's check-in (above), on the
--     same day. Old milestone rows stay exactly as they are.
--   * The award is dated at the check-in's server receipt, clamped inside its day (a late tap is
--     dated yesterday 23:59:59.999 local), and only while the day started less than 48 h ago, so a
--     final league archive never changes.
--   * A check-in counts as activity for ascend_user_active_between (source 'recovery_checkin' is
--     not excluded there; accepted by Zakria). That function is not changed.
--
-- Removed: the milestone award + take-back function ascend_recompute_recovery_awards, its tracker
-- trigger (addiction_trackers_award_points) and the hourly job 'ascend-recovery-awards-hourly'
-- (ascend_run_recovery_awards). Rollback bodies: work/rcc/*.live.sql (dumped 2026-11-09).
--
-- Table follows the S1 sync template (20261107150000_list_orders.sql): PK (user_id, id),
-- keep_newer (revivable variant: an undone day can be checked in again) + stamp triggers, owner RLS select/insert/update (no DELETE), explicit grants,
-- realtime, size limit, the 30-day soft-delete purge list. The FK cascades on account deletion.
-- Older app versions never read or write recovery_checkins (they simply cannot check in); their
-- tracker writes keep working (server_created_at is never sent by any app and is pinned here).
--
-- Apply right before the production push of the app that ships the Check-in button.

BEGIN;

-- 1. Stop the milestone awards first, so nothing below can award or take back.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.command ILIKE '%ascend_run_recovery_awards%';
  END IF;
END $$;
DROP TRIGGER IF EXISTS addiction_trackers_award_points ON public.addiction_trackers;
DROP FUNCTION IF EXISTS public.addiction_trackers_award_points();
DROP FUNCTION IF EXISTS public.ascend_run_recovery_awards();
DROP FUNCTION IF EXISTS public.ascend_recompute_recovery_awards(uuid);

-- 2. Server-stamped tracker creation time (the first local day earns nothing).
ALTER TABLE public.addiction_trackers ADD COLUMN server_created_at timestamptz;
-- Existing trackers (all created 2026-11-01..03) keep their own creation time.
UPDATE public.addiction_trackers SET server_created_at = created_at;
ALTER TABLE public.addiction_trackers
  ALTER COLUMN server_created_at SET DEFAULT clock_timestamp(),
  ALTER COLUMN server_created_at SET NOT NULL;

CREATE FUNCTION public.addiction_trackers_pin_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.server_created_at := OLD.server_created_at;
  ELSIF current_user IN ('anon', 'authenticated') OR NEW.server_created_at IS NULL THEN
    -- The app can never choose its own creation time.
    NEW.server_created_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$function$;

-- BEFORE triggers run by name: guard_start, keep_newer, pin_created, stamp.
CREATE TRIGGER addiction_trackers_pin_created BEFORE INSERT OR UPDATE ON public.addiction_trackers
  FOR EACH ROW EXECUTE FUNCTION public.addiction_trackers_pin_created();

-- 3. The check-in table: one row per user per local day, data = { id, trackerId, createdAt }.
CREATE TABLE public.recovery_checkins (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL CHECK (id ~ '^\d{4}-\d{2}-\d{2}$'),
  data              jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Server receipt time (set by the guard); the award is dated from it, never from the device.
  received_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT recovery_checkins_tracker CHECK (jsonb_typeof(data->'trackerId') = 'string'),
  CONSTRAINT recovery_checkins_data_size CHECK (octet_length(data::text) <= 2048)
);

CREATE INDEX recovery_checkins_user_cursor_idx ON public.recovery_checkins (user_id, server_updated_at);

-- App writes (writer's timezone): a NEW row of today or yesterday; the undo of TODAY's live row
-- (deleted_at set, data kept); a re-tap that brings an undone row of today or yesterday back. Every
-- other app write is dropped: an upsert on a live day (second device), an edit, a delete of
-- yesterday or older, a new row born deleted. Service roles pass.
CREATE FUNCTION public.recovery_checkins_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_day   date;
  v_today text;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.received_at := OLD.received_at;
    END IF;
    RETURN NEW;
  END IF;
  v_day := (now() AT TIME ZONE coalesce(public.ascend_own_timezone(NEW.user_id), 'Asia/Karachi'))::date;
  v_today := to_char(v_day, 'YYYY-MM-DD');
  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      -- Undo: today's check-in only; the row keeps what it was.
      IF OLD.id <> v_today THEN
        RETURN NULL;
      END IF;
      NEW.data := OLD.data;
      NEW.received_at := OLD.received_at;
      RETURN NEW;
    END IF;
    IF NOT (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
      RETURN NULL; -- an edit or a second tap of a live day, or a write to an undone row
    END IF;
    -- Re-tap after an undo: falls through to the same checks as a new row.
  ELSIF NEW.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF NEW.id NOT IN (v_today, to_char(v_day - 1, 'YYYY-MM-DD'))
     OR NEW.data->>'id' IS DISTINCT FROM NEW.id
  THEN
    RETURN NULL; -- a future day, an older day, or a mismatched document
  END IF;
  NEW.received_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

-- BEFORE triggers run by name: guard, keep_newer, stamp.
CREATE TRIGGER recovery_checkins_guard BEFORE INSERT OR UPDATE ON public.recovery_checkins
  FOR EACH ROW EXECUTE FUNCTION public.recovery_checkins_guard();
CREATE TRIGGER recovery_checkins_keep_newer BEFORE UPDATE ON public.recovery_checkins
  FOR EACH ROW EXECUTE FUNCTION public.sync_keep_newer_revivable_row();
CREATE TRIGGER recovery_checkins_stamp BEFORE INSERT OR UPDATE ON public.recovery_checkins
  FOR EACH ROW EXECUTE FUNCTION public.sync_stamp_row();

ALTER TABLE public.recovery_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can read" ON public.recovery_checkins FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can insert" ON public.recovery_checkins FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can update" ON public.recovery_checkins FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.recovery_checkins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.recovery_checkins TO authenticated;
GRANT ALL ON public.recovery_checkins TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.recovery_checkins;

-- 4. The point for one check-in day (idempotent; never lowers anything). A point row an undo
--    soft-deleted comes back as the same single row on the re-tap.
CREATE FUNCTION public.ascend_award_recovery_checkin(p_user uuid, p_day text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cap       int  := 90; -- RECOVERY_POINTS.seasonCap
  v_id        text := 'recovery_day_' || p_day;
  v_tz        text := public.ascend_user_timezone(p_user);
  v_day       date;
  v_day_start timestamptz;
  v_day_end   timestamptz;
  v_received  timestamptz;
  v_tid       text;
  v_tdata     jsonb;
  v_created   timestamptz;
  v_start     timestamptz;
  v_at        timestamptz;
  v_ss        timestamptz;
  v_held      numeric;
  v_amount    int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('recovery_checkin:' || p_user::text));

  SELECT c.received_at, c.data->>'trackerId' INTO v_received, v_tid
  FROM public.recovery_checkins c
  WHERE c.user_id = p_user AND c.id = p_day AND c.deleted_at IS NULL;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.point_entries pe WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  v_day := p_day::date;
  v_day_start := v_day::timestamp AT TIME ZONE v_tz;
  v_day_end := (v_day + 1)::timestamp AT TIME ZONE v_tz;
  -- Today or yesterday only (48 h covers DST days), so a final league archive never changes.
  IF v_day_start > now() OR v_day_start <= now() - interval '48 hours' THEN
    RETURN;
  END IF;

  SELECT t.data, t.server_created_at INTO v_tdata, v_created
  FROM public.addiction_trackers t
  WHERE t.user_id = p_user AND t.id = v_tid AND t.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN; -- no live tracker
  END IF;
  v_start := public.ascend_instant(v_tdata->>'startDate');
  IF v_start IS NULL
     OR (v_created AT TIME ZONE v_tz)::date >= v_day            -- the tracker's first day earns 0
     OR (v_start >= v_day_start AND v_start < v_day_end)        -- the streak (re)started this day
  THEN
    RETURN;
  END IF;

  v_at := least(greatest(coalesce(v_received, now()), v_day_start), v_day_end - interval '1 millisecond', now());
  v_ss := public.ascend_season_start(v_at);

  SELECT coalesce(sum(CASE WHEN jsonb_typeof(pe.data->'amount') = 'number' THEN (pe.data->>'amount')::numeric END), 0)
  INTO v_held
  FROM public.point_entries pe
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.data->>'source' IN ('recovery_checkin', 'recovery_milestone', 'addiction_recovery')
    AND pe.awarded_at >= v_ss
    AND pe.awarded_at < v_ss + public.ascend_season_length();
  v_amount := floor(least(1, greatest(v_cap - v_held, 0)))::int;
  IF v_amount <= 0 THEN
    RETURN; -- season cap reached
  END IF;

  INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
  VALUES (p_user, v_id, jsonb_build_object(
    'id', v_id,
    'amount', v_amount,
    'reason', 'Clean day check-in',
    'source', 'recovery_checkin',
    'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'metadata', jsonb_build_object('date', p_day, 'trackerId', v_tid)
  ), now(), now())
  ON CONFLICT (user_id, id) DO UPDATE
    SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
    WHERE pe.deleted_at IS NOT NULL;
END;
$function$;

-- 4b. Undo of today's check-in: soft-deletes today's point, only while p_day is still the user's
--     current local day. Any other day (yesterday's late tap, an undo arriving after midnight)
--     changes nothing.
CREATE FUNCTION public.ascend_revoke_recovery_checkin(p_user uuid, p_day text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('recovery_checkin:' || p_user::text));
  IF p_day IS DISTINCT FROM to_char((now() AT TIME ZONE public.ascend_user_timezone(p_user))::date, 'YYYY-MM-DD') THEN
    RETURN;
  END IF;
  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.id = 'recovery_day_' || p_day
    AND pe.deleted_at IS NULL
    AND pe.data->>'source' = 'recovery_checkin';
END;
$function$;

CREATE FUNCTION public.recovery_checkins_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL THEN
      PERFORM public.ascend_award_recovery_checkin(NEW.user_id, NEW.id);
    END IF;
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    PERFORM public.ascend_award_recovery_checkin(NEW.user_id, NEW.id); -- re-tap after an undo
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM public.ascend_revoke_recovery_checkin(NEW.user_id, NEW.id); -- undo
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER recovery_checkins_award_points AFTER INSERT OR UPDATE ON public.recovery_checkins
  FOR EACH ROW EXECUTE FUNCTION public.recovery_checkins_award_points();

REVOKE ALL ON FUNCTION public.addiction_trackers_pin_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recovery_checkins_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_award_recovery_checkin(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_revoke_recovery_checkin(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recovery_checkins_award_points() FROM PUBLIC, anon, authenticated;

-- 5. Soft-delete purge: the live body (20261107150000) plus recovery_checkins.
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
    'addiction_trackers', 'lesson_reads', 'list_orders', 'recovery_checkins'
  ] LOOP
    EXECUTE format('DELETE FROM public.%I WHERE deleted_at IS NOT NULL AND deleted_at < $1', v_table)
      USING v_cutoff;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_purge_soft_deleted_rows() FROM PUBLIC, anon, authenticated;

COMMIT;
