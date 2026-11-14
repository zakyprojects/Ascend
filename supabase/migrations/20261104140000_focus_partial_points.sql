-- Focus timer: partial points (rule R1) and the day each point counts on (Zakria 2026-11-04,
-- knowledge/mode-b-focus-partial-points-2026-11-04.md). NOT APPLIED: needs Zakria's go.
-- Must run BEFORE the studio browser test and before the app change reaches production: the new
-- app uploads planned_minutes / started_at / milestones_at for every session it logs, and an
-- upload naming a column the table lacks is refused.
--
-- What changes
--   * focus_logs gets three nullable columns, written by the new timer only:
--       planned_minutes  the planned length (duration_minutes is now the ACTIVE minutes, pauses excluded)
--       started_at       when the session first started
--       milestones_at    when each milestone (25, 35, 45, 55, 65, 75, 85 active minutes) was crossed
--   * Rows WITHOUT planned_minutes (every existing row, and rows old app builds keep writing) earn
--     exactly as before: ascend_focus_session_points(duration_minutes) on their log_date, in
--     created_at, id order, cap 10. No data changes.
--   * Rows WITH planned_minutes earn R1 (src/lib/focusPoints.ts, mirror src/lib/focusAwards.ts):
--       credited = least(duration_minutes, planned_minutes, whole minutes from started_at to the end),
--         end = least(created_at, server_updated_at), so a row can never earn for time that had not
--         passed when the server received it; a start after the end credits 0.
--       2 pts at 25 credited minutes, +1 at 35, 45, 55, 65, 75, 85; finish bonus at the end when
--         credited >= planned: +1 for plans of 50-89, +2 for 90+.
--       Each milestone counts on the local day it was crossed (milestones_at[i]); a crossing that
--         does not fit (missing, earlier than start + its minutes, after the end, out of order) counts
--         at the end; a day older than the day before log_date (or after it) counts on log_date.
--   * Only today is recomputed, as before. One exception: a row of today whose session started on
--     an earlier local day also recomputes yesterday in "floor" mode (the amount can only go up,
--     never down, never removed), so the points crossed before midnight land on that day.
--   * Daily cap 10 per local day across both kinds of rows, in time order (created_at for old rows,
--     crossing time for milestones), ties by id then milestone.
--
-- Known limits (accepted): started_at is the app's claim, so a forged row can still claim up to
-- the time between a backdated start and its upload (bounded by the cap of 10 a day, as today's
-- "claim 90 minutes" hole). A late row dated an earlier day earns nothing, as before.

BEGIN;

-- 1. Columns (nullable, no default: existing rows and old app inserts stay NULL = old rule).
ALTER TABLE public.focus_logs
  ADD COLUMN IF NOT EXISTS planned_minutes integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS milestones_at timestamptz[];

ALTER TABLE public.focus_logs
  ADD CONSTRAINT focus_logs_planned_minutes_range CHECK (planned_minutes IS NULL OR planned_minutes BETWEEN 1 AND 100000),
  ADD CONSTRAINT focus_logs_milestones_at_size CHECK (milestones_at IS NULL OR cardinality(milestones_at) <= 7);

-- 2. R1 points of one session before the cap (focusR1Points; change both together).
CREATE OR REPLACE FUNCTION public.ascend_focus_r1_points(p_active integer, p_planned integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_planned IS NULL OR p_active IS NULL OR least(p_active, p_planned) < 25 THEN 0
    ELSE least(8, 2 + (least(p_active, p_planned) - 25) / 10)
         + CASE WHEN p_active >= p_planned THEN
             CASE WHEN p_planned >= 90 THEN 2 WHEN p_planned >= 50 THEN 1 ELSE 0 END
           ELSE 0 END
  END;
$function$;

-- 3. What one row earns, item by item, with the local day each item counts on (focusLogItems).
--    item_ord 0 = a whole old-rule session, 1..7 = milestones, 8 = finish bonus.
CREATE OR REPLACE FUNCTION public.ascend_focus_log_items(p_tz text, p_log public.focus_logs)
 RETURNS TABLE(item_points integer, item_at timestamptz, item_day date, item_ord integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_end     timestamptz;
  v_credit  integer;
  v_minutes integer;
  v_at      timestamptz;
  v_prev    timestamptz := '-infinity';
  v_day     date;
  v_bonus   integer;
  i         integer;
BEGIN
  IF p_log.planned_minutes IS NULL THEN
    item_points := public.ascend_focus_session_points(p_log.duration_minutes);
    item_at := p_log.created_at;
    item_day := p_log.log_date;
    item_ord := 0;
    RETURN NEXT;
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

  FOR i IN 1..7 LOOP
    v_minutes := 25 + 10 * (i - 1);
    EXIT WHEN v_credit < v_minutes;
    v_at := CASE WHEN p_log.milestones_at IS NOT NULL AND cardinality(p_log.milestones_at) >= i
                 THEN p_log.milestones_at[i] END;
    IF v_at IS NULL OR v_at < p_log.started_at + make_interval(mins => v_minutes) OR v_at > v_end OR v_at < v_prev THEN
      v_at := v_end;
    END IF;
    v_prev := v_at;
    v_day := (v_at AT TIME ZONE p_tz)::date;
    IF v_day < p_log.log_date - 1 OR v_day > p_log.log_date THEN
      v_day := p_log.log_date;
    END IF;
    item_points := CASE WHEN i = 1 THEN 2 ELSE 1 END;
    item_at := v_at;
    item_day := v_day;
    item_ord := i;
    RETURN NEXT;
  END LOOP;

  v_bonus := CASE WHEN v_credit >= 25 AND v_credit >= p_log.planned_minutes THEN
               CASE WHEN p_log.planned_minutes >= 90 THEN 2 WHEN p_log.planned_minutes >= 50 THEN 1 ELSE 0 END
             ELSE 0 END;
  IF v_bonus > 0 THEN
    v_day := (v_end AT TIME ZONE p_tz)::date;
    IF v_day < p_log.log_date - 1 OR v_day > p_log.log_date THEN
      v_day := p_log.log_date;
    END IF;
    item_points := v_bonus;
    item_at := v_end;
    item_day := v_day;
    item_ord := 8;
    RETURN NEXT;
  END IF;
END;
$function$;

-- 4. The award row of one user's local day (computeFocusAwards). p_floor (the day before today,
--    for a session across midnight): the amount only goes up and the row is never removed.
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
  v_used      integer     := 0;
  v_count     int         := 0;
  v_first     timestamptz;
  v_kept      text;
  v_kept_amt  integer;
  v_at        timestamptz;
  v_id        text        := 'focus_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_item      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('focus_awards:' || p_user::text || ':' || v_key));

  -- Sessions of the day: old-rule rows dated that day, new rows dated that day, and new rows of
  -- the next day with a milestone on it.
  SELECT count(*) INTO v_count
  FROM public.focus_logs f
  WHERE f.user_id = p_user
    AND f.deleted_at IS NULL
    AND (f.log_date = p_day
         OR (f.planned_minutes IS NOT NULL AND f.log_date = p_day + 1
             AND EXISTS (SELECT 1 FROM public.ascend_focus_log_items(p_tz, f) it WHERE it.item_day = p_day)));

  FOR v_item IN
    SELECT it.item_points AS points, it.item_at AS at
    FROM public.focus_logs f
    CROSS JOIN LATERAL public.ascend_focus_log_items(p_tz, f) it
    WHERE f.user_id = p_user
      AND f.deleted_at IS NULL
      AND ((f.planned_minutes IS NULL AND f.log_date = p_day)
           OR (f.planned_minutes IS NOT NULL AND f.log_date BETWEEN p_day AND p_day + 1))
      AND it.item_day = p_day
    ORDER BY it.item_at, f.id COLLATE "C", it.item_ord
  LOOP
    v_used := v_used + least(v_item.points, greatest(v_cap - v_used, 0));
    IF v_first IS NULL AND v_used > 0 THEN
      v_first := coalesce(v_item.at, now());
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

-- 5. The old entry point keeps its signature (normal mode).
CREATE OR REPLACE FUNCTION public.ascend_recompute_focus_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.ascend_recompute_focus_awards_day(p_user, p_day, p_tz, false);
END;
$function$;

-- 6. Any session change recomputes the owner's current local day; a live row of today whose
--    session started on an earlier day also raises yesterday.
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
     AND NEW.planned_minutes IS NOT NULL
     AND NEW.log_date = v_today
     AND NEW.started_at IS NOT NULL
     AND (NEW.started_at AT TIME ZONE v_tz)::date < v_today THEN
    PERFORM public.ascend_recompute_focus_awards_day(NEW.user_id, v_today - 1, v_tz, true);
  END IF;
  RETURN NULL;
END;
$function$;

-- 7. Grants: server-only functions; the table keeps its owner policies and table-level grant
--    (authenticated = SELECT, INSERT, UPDATE), which covers the new columns.
REVOKE ALL ON FUNCTION public.ascend_focus_r1_points(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_focus_log_items(text, public.focus_logs) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_focus_awards_day(uuid, date, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_focus_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.focus_logs_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_focus_session_points(integer) FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.focus_logs TO authenticated;

-- No recompute here: every existing row has planned_minutes NULL, so each day's award is
-- unchanged (work/verify-focus-partial-points-2026-11-04.sql: 0 differences).

COMMIT;
