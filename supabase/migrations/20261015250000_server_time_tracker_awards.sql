-- Time tracker points from the server, and no app writes to the points ledger at all
-- (knowledge/server-side-plan.md, Part 2 #2, Option C module 11 and its final step)
-- Until now the guard only dropped app writes of the sources the server already owned, so a
-- console write with any other source (time_tracker, or an invented one) still landed. Now:
--   * The database writes one row per local day, id time_tracker_<YYYY-MM-DD>, from that day's
--     routine blocks in time_tracker_days (calculateTimeTrackerDailyPoints in
--     src/lib/pointsConfig.ts: a few skipped blocks leave the count, 80% done = 5, 50% = 3).
--     Only the user's current local day is (re)computed, so a day's points freeze at its
--     midnight (Zakria 2026-10-15: no 7-day look-back). Blocks of any day may still be written,
--     so a day saved late from offline keeps its blocks; it just earns nothing.
--   * Every app write (insert or update) to point_entries is dropped without an error, so older
--     app builds keep syncing (Zakria 2026-10-15). Only server functions write the ledger.
-- Known limit: whether a block is done comes from the app; the tiers bound a false claim to
-- 5 points a day, as before.
-- Point values are unchanged. Older time_tracker rows stay as they are; today's row is rewritten
-- by the server under the same id. src/lib/timeTrackerAwards.ts must stay identical to
-- ascend_recompute_time_tracker_award.

BEGIN;

-- 1. The award row of one user's local day, recomputed from the day's blocks.
CREATE OR REPLACE FUNCTION public.ascend_recompute_time_tracker_award(p_user uuid, p_day date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text := to_char(p_day, 'YYYY-MM-DD');
  v_id        text := 'time_tracker_' || to_char(p_day, 'YYYY-MM-DD');
  v_blocks    jsonb;
  v_total     integer := 0;
  v_skipped   integer := 0;
  v_completed integer := 0;
  v_excluded  integer := 0;
  v_denom     integer;
  v_points    integer := 0;
  v_percent   integer := 0;
  v_metadata  jsonb;
  v_current   jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('time_tracker_awards:' || p_user::text || ':' || v_key));

  SELECT d.data->'blocks' INTO v_blocks
  FROM public.time_tracker_days d
  WHERE d.user_id = p_user AND d.id = v_key AND d.deleted_at IS NULL;

  IF jsonb_typeof(v_blocks) = 'array' THEN
    SELECT count(*),
           count(*) FILTER (WHERE b->'skipped' = 'true'::jsonb),
           count(*) FILTER (WHERE b->'completed' = 'true'::jsonb)
    INTO v_total, v_skipped, v_completed
    FROM jsonb_array_elements(v_blocks) AS b;
  END IF;

  -- TIME_TRACKER_POINTS: up to 30% of skipped blocks (at most 3) leave the count on routines
  -- of more than 3 blocks; 80% done = 5 points, 50% = 3.
  IF v_total > 0 THEN
    IF v_total > 3 THEN
      v_excluded := least(v_skipped, least((3 * v_total) / 10, 3));
    END IF;
    v_denom := v_total - v_excluded;
    IF v_denom > 0 THEN
      v_points := CASE WHEN v_completed * 100 >= 80 * v_denom THEN 5
                       WHEN v_completed * 100 >= 50 * v_denom THEN 3
                       ELSE 0 END;
      v_percent := (200 * v_completed + v_denom) / (2 * v_denom);
    END IF;
  END IF;

  IF v_points > 0 THEN
    v_metadata := jsonb_build_object('date', v_key, 'percentage', v_percent, 'pointsAwarded', v_points);
    SELECT pe.data INTO v_current
    FROM public.point_entries pe
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
    -- The same score keeps its row (and its time); a changed score is stamped now.
    IF v_current IS NOT NULL
       AND v_current->'amount' = to_jsonb(v_points)
       AND v_current->'metadata' = v_metadata THEN
      RETURN;
    END IF;
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_points,
      'reason', 'Time Tracker daily routine completed (' || v_percent || '%): ' || v_points || ' pts',
      'source', 'time_tracker',
      'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', v_metadata
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at);
  ELSE
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
  END IF;
END;
$function$;

-- 2. Any day change recomputes the owner's current local day.
CREATE OR REPLACE FUNCTION public.time_tracker_days_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.ascend_recompute_time_tracker_award(
    NEW.user_id, (now() AT TIME ZONE public.ascend_user_timezone(NEW.user_id))::date);
  RETURN NULL;
END;
$function$;

-- 3. Only the server writes the points ledger: every app write is dropped.
CREATE OR REPLACE FUNCTION public.point_entries_guard_server_owned()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_recompute_time_tracker_award(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.time_tracker_days_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_entries_guard_server_owned() FROM PUBLIC, anon, authenticated;

-- 4. Today's row for everyone with a routine today; earlier days are left as they are.
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN SELECT DISTINCT d.user_id FROM public.time_tracker_days d LOOP
    PERFORM public.ascend_recompute_time_tracker_award(
      v_row.user_id, (now() AT TIME ZONE public.ascend_user_timezone(v_row.user_id))::date);
  END LOOP;
END $$;

CREATE TRIGGER time_tracker_days_award_points AFTER INSERT OR UPDATE ON public.time_tracker_days
  FOR EACH ROW EXECUTE FUNCTION public.time_tracker_days_award_points();

COMMIT;
