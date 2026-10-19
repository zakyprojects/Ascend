-- Security B1: ascend_league_points only for members, only for real league windows
-- (knowledge/mode-a-security-idor-db-2026-10-19.md M1)
--
-- Before: anon could call it, with up to 40 windows of any width (one second works), which
-- rebuilt when each member earned points (private profiles too) and cost ~1 s per call.
--
-- Now:
-- - EXECUTE for authenticated only (guests are authenticated too). The app asks only after a
--   session exists (leagueStandingsRefresh: no session, no fetch); a refused call returns null
--   and the league view keeps what it shows.
-- - At most 26 windows: the app sends this week and month plus the 12 before each
--   (src/lib/leagues.ts getLeaguePointsPeriods, LEAGUE_POINTS_LOOKBACK = 12). Change together.
-- - A window counts only when it is a UTC week [Monday, Monday + 7 d) or UTC month, or the part
--   of one from a season start inside it (the app clamps to the season start), and ends no
--   later than the running month. Any other window, or an empty one (start >= end, e.g. a week
--   before Season 1), returns no rows for that period instead of failing the whole call.
-- Same signature; the body is the live definition plus the window check.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_league_points(p_starts timestamp with time zone[], p_ends timestamp with time zone[])
 RETURNS TABLE(period integer, user_id uuid, points integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := coalesce(array_length(p_starts, 1), 0);
  v_start timestamptz;
  v_end timestamptz;
  v_end_utc timestamp;
  v_week_start timestamptz;
  v_month_start timestamptz;
BEGIN
  IF v_count <> coalesce(array_length(p_ends, 1), 0) OR v_count > 26 THEN
    RAISE EXCEPTION 'ascend_league_points: give up to 26 matching start/end pairs';
  END IF;

  FOR i IN 1..v_count LOOP
    v_start := p_starts[i];
    v_end := p_ends[i];
    CONTINUE WHEN v_start IS NULL OR v_end IS NULL OR v_start >= v_end
      OR v_end > now() + interval '32 days';

    v_end_utc := v_end AT TIME ZONE 'UTC';
    v_week_start := (v_end_utc - interval '7 days') AT TIME ZONE 'UTC';
    v_month_start := (v_end_utc - interval '1 month') AT TIME ZONE 'UTC';
    CONTINUE WHEN NOT (
      (v_end_utc = date_trunc('week', v_end_utc)
        AND (v_start = v_week_start
             OR (v_start > v_week_start AND public.ascend_season_start(v_start) = v_start)))
      OR (v_end_utc = date_trunc('month', v_end_utc)
        AND (v_start = v_month_start
             OR (v_start > v_month_start AND public.ascend_season_start(v_start) = v_start)))
    );

    RETURN QUERY
    SELECT i, pp.user_id, pp.points
    FROM public.ascend_period_points(v_start, v_end, false) pp;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ascend_league_points(timestamp with time zone[], timestamp with time zone[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ascend_league_points(timestamp with time zone[], timestamp with time zone[]) TO authenticated;

COMMIT;
