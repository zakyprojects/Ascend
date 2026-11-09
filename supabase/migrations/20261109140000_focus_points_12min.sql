-- Deep Focus points rule 2: 12 active minutes = 1 pt, the minutes of all of a day's sessions added
-- up (Zakria 2026-11-09, knowledge/mode-a-focus-points-12min-2026-11-09.md,
-- knowledge/mode-b-focus-points-12min-2026-11-09.md). NOT APPLIED: needs Zakria's go.
-- Apply it right BEFORE the production push of the app change (same sitting), never after: a new
-- app that runs before this file previews rule 2 while the server still pays R1.
--
-- What changes
--   * focus_logs.points_rule (smallint, NULL or 2), written by the server only
--     (focus_logs_stamp_rule): every row an app inserts (anon / authenticated) is stamped 2,
--     whatever it sent; an app UPDATE (reflection edit, re-upload, delete) keeps the row's stamp.
--     Other roles (a pg_dump restore, service_role, the SQL editor) keep what they write, so a
--     restore never turns old rows into rule 2. Existing rows stay NULL = the rule they were
--     logged under (R1 with planned_minutes, the old tiers without). No data changes.
--   * Rule-2 rows (src/lib/focusPoints.ts, mirror src/lib/focusAwards.ts):
--       credited = the same minutes as R1 (least(duration, planned, whole minutes from started_at
--         to least(created_at, server_updated_at))); without planned_minutes: duration_minutes.
--       A session under 25 credited minutes adds nothing (25-min rule on the whole session).
--       Its credited minutes count on log_date, except for a session that started on the local day
--       before log_date: the minutes done before midnight count on that day, read from its
--       checkpoints (start, each 25/35 ... 85 crossing that fits, end): the last checkpoint at or
--       before midnight plus the whole minutes from it to midnight, at most up to the next
--       checkpoint. The two parts always add up to the credited minutes.
--   * A day earns least(10, old-rule points of the day + floor(rule-2 minutes of the day / 12)).
--     Days whose rows are all NULL earn exactly what they earn today (same items, same order).
--     No finish bonus for rule-2 rows. The first stamp time is the earliest part that earns.
--   * Only today is recomputed, plus yesterday in floor mode (only up) as since 20261104160000;
--     a rule-2 row raises yesterday when it has minutes there. Days before yesterday never move.
--   * Unchanged: ascend_focus_log_items, ascend_focus_r1_points, ascend_focus_session_points,
--     the cross-device RPCs (marks stay 25 .. 85), ascend_member_card, the guards.
--
-- Old production clients (9ce3e5b) after this file: their inserts are stamped 2, so their real
-- award follows rule 2; their own preview still shows R1 until the server row is pulled (display
-- only). Hence the prod push right after.
--
-- Rollback (only after the app is reverted): work/f12/rollback.sql (drops the stamp trigger and
-- function, restores the 20261104140000 recompute body and the 20261104160000 trigger body, drops
-- ascend_focus_log_parts and the column). Snapshot of the replaced bodies: work/snapshots/focus-12min-<date>/.

BEGIN;

-- 1. The column (nullable, no default: existing rows stay NULL = their old rule).
ALTER TABLE public.focus_logs ADD COLUMN IF NOT EXISTS points_rule smallint;
ALTER TABLE public.focus_logs DROP CONSTRAINT IF EXISTS focus_logs_points_rule_valid;
ALTER TABLE public.focus_logs
  ADD CONSTRAINT focus_logs_points_rule_valid CHECK (points_rule IS NULL OR points_rule = 2);

-- 2. Stamp: an app insert is rule 2; an app update keeps the row's rule.
--    Named *_stamp_rule so it fires after focus_logs_keep_newer / focus_logs_stamp (name order).
CREATE OR REPLACE FUNCTION public.focus_logs_stamp_rule()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.points_rule := 2;
    ELSE
      NEW.points_rule := OLD.points_rule;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS focus_logs_stamp_rule ON public.focus_logs;
CREATE TRIGGER focus_logs_stamp_rule BEFORE INSERT OR UPDATE ON public.focus_logs
  FOR EACH ROW EXECUTE FUNCTION public.focus_logs_stamp_rule();

-- 3. What one row brings to each day (focusLogParts): old-rule rows = their points items
--    (part_minutes 0); rule-2 rows = 1 or 2 minute parts (part_points 0).
--    part_ord: old rows = item_ord; rule 2: 0 = before midnight, 1 = the rest.
CREATE OR REPLACE FUNCTION public.ascend_focus_log_parts(p_tz text, p_log public.focus_logs)
 RETURNS TABLE(part_points integer, part_minutes integer, part_at timestamptz, part_day date, part_ord integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_end     timestamptz;
  v_credit  integer;
  v_mid     timestamptz;
  v_minutes integer;
  v_at      timestamptz;
  v_prev    timestamptz;
  v_a       integer := 0;
  v_ta      timestamptz;
  v_b       integer;
  v_before  integer;
  i         integer;
BEGIN
  IF p_log.points_rule IS DISTINCT FROM 2 THEN
    RETURN QUERY
      SELECT it.item_points, 0, it.item_at, it.item_day, it.item_ord
      FROM public.ascend_focus_log_items(p_tz, p_log) it;
    RETURN;
  END IF;

  IF p_log.planned_minutes IS NULL THEN
    v_credit := greatest(coalesce(p_log.duration_minutes, 0), 0);
    IF v_credit >= 25 THEN
      part_points := 0; part_minutes := v_credit; part_at := p_log.created_at; part_day := p_log.log_date; part_ord := 1;
      RETURN NEXT;
    END IF;
    RETURN;
  END IF;

  v_end := least(p_log.created_at, p_log.server_updated_at);
  IF p_log.started_at IS NULL OR v_end IS NULL OR p_log.started_at > v_end THEN
    RETURN;
  END IF;
  v_credit := greatest(0, least(
    greatest(p_log.duration_minutes, 0),
    p_log.planned_minutes,
    floor(extract(epoch FROM (v_end - p_log.started_at)) / 60)::integer));
  IF v_credit < 25 THEN
    RETURN;
  END IF;

  IF (p_log.started_at AT TIME ZONE p_tz)::date IS DISTINCT FROM p_log.log_date - 1 THEN
    part_points := 0; part_minutes := v_credit; part_at := v_end; part_day := p_log.log_date; part_ord := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Started the day before: checkpoints (0, start), valid marks, (credited, end).
  v_mid := p_log.log_date::timestamp AT TIME ZONE p_tz;
  v_ta := p_log.started_at;
  v_prev := p_log.started_at;
  FOR i IN 1..7 LOOP
    v_minutes := 25 + 10 * (i - 1);
    EXIT WHEN v_minutes > v_credit;
    v_at := CASE WHEN p_log.milestones_at IS NOT NULL AND cardinality(p_log.milestones_at) >= i
                 THEN p_log.milestones_at[i] END;
    CONTINUE WHEN v_at IS NULL OR v_at < p_log.started_at + make_interval(mins => v_minutes) OR v_at > v_end OR v_at < v_prev;
    v_prev := v_at;
    IF v_at <= v_mid THEN
      v_a := v_minutes;
      v_ta := v_at;
    ELSE
      v_b := v_minutes; -- the first checkpoint after midnight
      EXIT;
    END IF;
  END LOOP;
  IF v_b IS NULL THEN
    IF v_end <= v_mid THEN
      v_a := v_credit;
      v_ta := v_end;
    ELSE
      v_b := v_credit;
    END IF;
  END IF;
  v_before := v_a + CASE WHEN v_b IS NULL THEN 0
                         ELSE least(v_b - v_a, floor(extract(epoch FROM (v_mid - v_ta)) / 60)::integer) END;

  IF v_before > 0 THEN
    part_points := 0; part_minutes := v_before; part_at := p_log.started_at + make_interval(mins => v_before);
    part_day := p_log.log_date - 1; part_ord := 0;
    RETURN NEXT;
  END IF;
  IF v_credit - v_before > 0 THEN
    part_points := 0; part_minutes := v_credit - v_before; part_at := v_end; part_day := p_log.log_date; part_ord := 1;
    RETURN NEXT;
  END IF;
END;
$function$;

-- 4. The award row of one user's local day (computeFocusAwards):
--    least(10, old-rule points + floor(rule-2 minutes / 12)). Same skeleton as 20261104140000.
CREATE OR REPLACE FUNCTION public.ascend_recompute_focus_awards_day(p_user uuid, p_day date, p_tz text, p_floor boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_day_end   timestamptz := (p_day + 1)::timestamp AT TIME ZONE p_tz;
  v_cap       integer     := 10; -- PFC_POINTS.focus.dailyCap
  v_per_point integer     := 12; -- PFC_POINTS.focus.minutesPerPoint
  v_fixed     integer     := 0;
  v_minutes   integer     := 0;
  v_used      integer     := 0;
  v_count     int         := 0;
  v_first     timestamptz;
  v_kept      text;
  v_kept_amt  integer;
  v_at        timestamptz;
  v_id        text        := 'focus_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_part      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('focus_awards:' || p_user::text || ':' || v_key));

  -- Sessions of the day: rows dated that day, and R1 / rule-2 rows of the next day with a part on it.
  SELECT count(*) INTO v_count
  FROM public.focus_logs f
  WHERE f.user_id = p_user
    AND f.deleted_at IS NULL
    AND (f.log_date = p_day
         OR ((f.planned_minutes IS NOT NULL OR f.points_rule = 2) AND f.log_date = p_day + 1
             AND EXISTS (SELECT 1 FROM public.ascend_focus_log_parts(p_tz, f) p WHERE p.part_day = p_day)));

  -- Old-rule rows only ever have parts on their own date (or the day before for R1), so one
  -- window covers every kind.
  FOR v_part IN
    SELECT p.part_points AS points, p.part_minutes AS minutes, p.part_at AS at
    FROM public.focus_logs f
    CROSS JOIN LATERAL public.ascend_focus_log_parts(p_tz, f) p
    WHERE f.user_id = p_user
      AND f.deleted_at IS NULL
      AND f.log_date BETWEEN p_day AND p_day + 1
      AND p.part_day = p_day
    ORDER BY p.part_at, f.id COLLATE "C", p.part_ord
  LOOP
    v_fixed := v_fixed + v_part.points;
    v_minutes := v_minutes + v_part.minutes;
    v_used := least(v_cap, v_fixed + v_minutes / v_per_point);
    IF v_first IS NULL AND v_used > 0 THEN
      v_first := coalesce(v_part.at, now());
    END IF;
  END LOOP;

  SELECT pe.data->>'timestamp', CASE WHEN (pe.data->>'amount') ~ '^-?[0-9]+$' THEN (pe.data->>'amount')::integer END
  INTO v_kept, v_kept_amt
  FROM public.point_entries pe
  WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;

  IF p_floor AND v_used <= coalesce(v_kept_amt, 0) THEN
    RETURN; -- an earlier day never drops
  END IF;

  IF v_used > 0 THEN
    v_at := least(greatest(v_first, v_day_start), now());
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_used,
      'reason', 'Focus sessions (' || v_count || ')',
      'source', 'focus',
      'timestamp', coalesce(v_kept, to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      'metadata', jsonb_build_object('date', v_key, 'sessions', v_count)
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  ELSE
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
  END IF;

  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.id NOT LIKE 'focus\_award\_%'
    AND pe.data->>'source' = 'focus'
    AND public.ascend_instant(pe.data->>'timestamp') >= v_day_start
    AND public.ascend_instant(pe.data->>'timestamp') < v_day_end;
END;
$function$;

-- 5. Trigger: today as before; yesterday (floor) when the row has a part there (points or minutes).
--    Same window and 48-hour guard as 20261104160000.
CREATE OR REPLACE FUNCTION public.focus_logs_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz    text := public.ascend_user_timezone(NEW.user_id);
  v_today date := (now() AT TIME ZONE v_tz)::date;
BEGIN
  PERFORM public.ascend_recompute_focus_awards_day(NEW.user_id, v_today, v_tz, false);
  IF NEW.deleted_at IS NULL
     AND (NEW.planned_minutes IS NOT NULL OR NEW.points_rule = 2)
     AND NEW.log_date BETWEEN v_today - 1 AND v_today
     AND ((v_today - 1)::timestamp AT TIME ZONE v_tz) > now() - interval '48 hours'
     AND EXISTS (SELECT 1 FROM public.ascend_focus_log_parts(v_tz, NEW) p
                 WHERE p.part_day = v_today - 1 AND (p.part_points > 0 OR p.part_minutes > 0)) THEN
    PERFORM public.ascend_recompute_focus_awards_day(NEW.user_id, v_today - 1, v_tz, true);
  END IF;
  RETURN NULL;
END;
$function$;

-- 6. Grants: server-only functions. The table keeps its owner policies and table-level grant
--    (authenticated = SELECT, INSERT, UPDATE); the stamp trigger decides points_rule.
REVOKE ALL ON FUNCTION public.focus_logs_stamp_rule() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_focus_log_parts(text, public.focus_logs) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_focus_awards_day(uuid, date, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.focus_logs_award_points() FROM PUBLIC, anon, authenticated;

-- No recompute and no backfill: every existing row is NULL (old rule), so each day's award is
-- unchanged (work/f12/pglite-test.mjs; read-only check work/f12/verify-after.sql).

COMMIT;
