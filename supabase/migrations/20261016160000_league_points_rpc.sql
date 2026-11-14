-- League points from the server (knowledge/mode-a-season-server-2026-10-16.md, S2)
--
-- Weekly and monthly league standings used to be worked out on every device from each member's
-- profiles.points_history: the last 500 point entries, reasons included, readable by everyone.
-- That capped very active members (more than 500 entries in a month undercounts them) and
-- published what each point was for. This RPC returns only numbers: each member's net points in
-- each requested period, from the full ledger, with the same maths as calculatePeriodPoints
-- (src/lib/leagues.ts; change both together):
--   * entries with start <= timestamp <= end, in time order,
--   * 'system' entries and 'System: Debt Forgiveness' skipped,
--   * the running total never drops below 0.
-- Members with 0 points in a period are left out (the app reads a missing member as 0).
-- The bounds come from the app's shared league calendar (season start already applied); they
-- only choose which window is summed, so they need no trust.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_league_points(p_starts timestamptz[], p_ends timestamptz[])
 RETURNS TABLE(period integer, user_id uuid, points integer)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_count  int := coalesce(array_length(p_starts, 1), 0);
  v_user   uuid;
  v_total  numeric;
  r        record;
BEGIN
  IF v_count <> coalesce(array_length(p_ends, 1), 0) OR v_count > 40 THEN
    RAISE EXCEPTION 'ascend_league_points: give up to 40 matching start/end pairs';
  END IF;

  FOR i IN 1..v_count LOOP
    v_user := NULL;
    v_total := 0;
    FOR r IN
      SELECT pe.user_id AS uid, coalesce((pe.data->>'amount')::numeric, 0) AS amount
      FROM public.point_entries pe
      WHERE pe.deleted_at IS NULL
        AND coalesce(pe.data->>'source', '') <> 'system'
        AND coalesce(pe.data->>'reason', '') <> 'System: Debt Forgiveness'
        AND public.ascend_instant(pe.data->>'timestamp') >= p_starts[i]
        AND public.ascend_instant(pe.data->>'timestamp') <= p_ends[i]
      ORDER BY pe.user_id, public.ascend_instant(pe.data->>'timestamp'), pe.id
    LOOP
      IF v_user IS DISTINCT FROM r.uid THEN
        IF v_user IS NOT NULL AND round(v_total) > 0 THEN
          period := i; user_id := v_user; points := round(v_total)::int;
          RETURN NEXT;
        END IF;
        v_user := r.uid;
        v_total := 0;
      END IF;
      v_total := greatest(v_total + r.amount, 0);
    END LOOP;
    IF v_user IS NOT NULL AND round(v_total) > 0 THEN
      period := i; user_id := v_user; points := round(v_total)::int;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_league_points(timestamptz[], timestamptz[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ascend_league_points(timestamptz[], timestamptz[]) TO anon, authenticated;

COMMIT;
