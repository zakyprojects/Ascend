-- League archives written by the server (work/mode-a-league-archives-server-2026-10-16.md, #11/#12)
-- Apply BEFORE the production push: nothing here changes what the current app reads or may write.
-- Part 2 (20261017061000_league_archives_server_only.sql, after the push) blocks app writes and
-- schedules the hourly job.
--
-- Until now every device archived its own closed weeks, months and seasons, with the other
-- members' points it happened to have cached. Now one job builds every member's archive from the
-- points ledger, the same maths and calendar as the app:
--   * weeks start Monday 00:00 UTC (id W:IYYY-Www), months the 1st 00:00 UTC (id M:YYYY-MM), and
--     a week or month that began before a season start counts from that season start;
--   * weekly/monthly windows include their end instant (start <= ts <= end), seasons do not
--     (start <= ts < end), as calculatePeriodPoints and ascend_season_history;
--   * 'system' entries and 'System: Debt Forgiveness' skipped, running total floored at 0;
--   * standings hold every member with points > 0 (deleted accounts have no profile and drop
--     out; private members are included, as on the live boards), ordered by points, then
--     lower(username), then id (generateCompetitors in src/lib/leagues.ts sorts the same way);
--   * one row per member with points > 0, data shaped like the app's createArchive, plus
--     source 'server' and final.
-- A period is recomputed every run for 48 hours after it ends (late or revoked entries land),
-- then written one last time with final = true and never touched again.
-- Rows the app wrote (no source 'server') are history and are never overwritten.

BEGIN;

-- 1. One copy of the period maths. Rows ordered by member id.
CREATE OR REPLACE FUNCTION public.ascend_period_points(p_start timestamptz, p_end timestamptz, p_inclusive_end boolean)
 RETURNS TABLE(user_id uuid, points integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path = ''
AS $function$
DECLARE
  v_user  uuid;
  v_total numeric;
  r       record;
BEGIN
  v_user := NULL;
  v_total := 0;
  FOR r IN
    SELECT pe.user_id AS uid, coalesce((pe.data->>'amount')::numeric, 0) AS amount
    FROM public.point_entries pe
    WHERE pe.deleted_at IS NULL
      AND coalesce(pe.data->>'source', '') <> 'system'
      AND coalesce(pe.data->>'reason', '') <> 'System: Debt Forgiveness'
      AND public.ascend_instant(pe.data->>'timestamp') >= p_start
      AND (public.ascend_instant(pe.data->>'timestamp') < p_end
           OR (p_inclusive_end AND public.ascend_instant(pe.data->>'timestamp') = p_end))
    ORDER BY pe.user_id, public.ascend_instant(pe.data->>'timestamp'), pe.id
  LOOP
    IF v_user IS DISTINCT FROM r.uid THEN
      IF v_user IS NOT NULL AND round(v_total) > 0 THEN
        user_id := v_user; points := round(v_total)::int;
        RETURN NEXT;
      END IF;
      v_user := r.uid;
      v_total := 0;
    END IF;
    v_total := greatest(v_total + r.amount, 0);
  END LOOP;
  IF v_user IS NOT NULL AND round(v_total) > 0 THEN
    user_id := v_user; points := round(v_total)::int;
    RETURN NEXT;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_period_points(timestamptz, timestamptz, boolean) FROM PUBLIC, anon, authenticated;

-- 2. The live boards' RPC, same signature and output, now through the shared helper.
CREATE OR REPLACE FUNCTION public.ascend_league_points(p_starts timestamptz[], p_ends timestamptz[])
 RETURNS TABLE(period integer, user_id uuid, points integer)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_count int := coalesce(array_length(p_starts, 1), 0);
BEGIN
  IF v_count <> coalesce(array_length(p_ends, 1), 0) OR v_count > 40 THEN
    RAISE EXCEPTION 'ascend_league_points: give up to 40 matching start/end pairs';
  END IF;

  FOR i IN 1..v_count LOOP
    RETURN QUERY
    SELECT i, pp.user_id, pp.points
    FROM public.ascend_period_points(p_starts[i], p_ends[i], true) pp;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_league_points(timestamptz[], timestamptz[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ascend_league_points(timestamptz[], timestamptz[]) TO anon, authenticated;

-- 3. Closed periods as of p_now: every week and month since the first season began, and every
--    season the rollover job has closed. Labels match getLeaguePeriodLabel (en-US, UTC).
CREATE OR REPLACE FUNCTION public.ascend_league_periods(p_now timestamptz)
 RETURNS TABLE(period_id text, period_type text, score_start timestamptz, period_end timestamptz,
               inclusive_end boolean, period_label text, season_number integer)
 LANGUAGE sql
 STABLE
 SET search_path = ''
AS $function$
  -- Calendar maths on UTC wall-clock timestamps, so the session time zone never matters.
  WITH weeks AS (
    SELECT s AT TIME ZONE 'UTC' AS s, (s + interval '7 days') AT TIME ZONE 'UTC' AS e
    FROM generate_series(
      date_trunc('week', public.ascend_season_epoch() AT TIME ZONE 'UTC'),
      p_now AT TIME ZONE 'UTC',
      interval '7 days') s
  ), months AS (
    SELECT s AT TIME ZONE 'UTC' AS s, (s + interval '1 month') AT TIME ZONE 'UTC' AS e
    FROM generate_series(
      date_trunc('month', public.ascend_season_epoch() AT TIME ZONE 'UTC'),
      p_now AT TIME ZONE 'UTC',
      interval '1 month') s
  ), seasons AS (
    SELECT n, public.ascend_season_begin(n) AS s, public.ascend_season_begin(n + 1) AS e
    FROM generate_series(1, least(
      (SELECT st.current_season FROM public.ascend_season_state st WHERE st.id),
      public.ascend_season_number(p_now)) - 1) n
  )
  SELECT 'W:' || to_char(s AT TIME ZONE 'UTC', 'IYYY') || '-W' || to_char(s AT TIME ZONE 'UTC', 'IW'),
         'weekly',
         greatest(s, public.ascend_season_start(e - interval '1 millisecond')),
         e, true,
         to_char(s AT TIME ZONE 'UTC', 'Mon FMDD') || ' – ' || to_char(e AT TIME ZONE 'UTC', 'Mon FMDD'),
         NULL::int
  FROM weeks WHERE e <= p_now
  UNION ALL
  SELECT 'M:' || to_char(s AT TIME ZONE 'UTC', 'YYYY-MM'),
         'monthly',
         greatest(s, public.ascend_season_start(e - interval '1 millisecond')),
         e, true,
         to_char(s AT TIME ZONE 'UTC', 'FMMonth YYYY'),
         NULL::int
  FROM months WHERE e <= p_now
  UNION ALL
  SELECT 'S:' || n,
         'ninetyDay',
         s, e, false,
         'Season ' || n || ' (' || to_char(s AT TIME ZONE 'UTC', 'Mon FMDD, YYYY') || ' – '
           || to_char(e AT TIME ZONE 'UTC', 'Mon FMDD, YYYY') || ')',
         n
  FROM seasons WHERE e <= p_now;
$function$;

REVOKE ALL ON FUNCTION public.ascend_league_periods(timestamptz) FROM PUBLIC, anon, authenticated;

-- 4. The archive rows one period should have: one per member with points > 0 (read only).
CREATE OR REPLACE FUNCTION public.ascend_league_archive_rows(p_period_id text, p_score_start timestamptz,
  p_period_end timestamptz, p_inclusive_end boolean, p_type text, p_label text, p_season integer,
  p_final boolean, p_archived_at timestamptz)
 RETURNS TABLE(user_id uuid, data jsonb)
 LANGUAGE sql
 STABLE
 SET search_path = ''
AS $function$
  WITH standings AS (
    SELECT pr.id, pr.uid::text AS uid, pr.username, coalesce(pr.avatar, '🧑') AS avatar, pp.points,
           row_number() OVER (ORDER BY pp.points DESC, lower(pr.username) COLLATE "C", pr.id::text COLLATE "C") AS pos
    FROM public.ascend_period_points(p_score_start, p_period_end, p_inclusive_end) pp
    JOIN public.profiles pr ON pr.id = pp.user_id
  )
  SELECT me.id,
         jsonb_strip_nulls(jsonb_build_object(
           'id', p_period_id,
           'type', p_type,
           'periodLabel', p_label,
           'seasonNumber', p_season,
           'competitors', (
             SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                      'id', c.id, 'uid', c.uid, 'name', c.username, 'avatar', c.avatar,
                      'points', c.points, 'totalPoints', 0, 'isRealUser', true,
                      'isUser', CASE WHEN c.id = me.id THEN true END
                    )) ORDER BY c.pos)
             FROM standings c),
           'userRank', me.pos,
           'userPoints', me.points,
           'archivedAt', to_char(p_archived_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'scoreSource', 'ledger',
           'source', 'server',
           'final', p_final
         ))
  FROM standings me;
$function$;

REVOKE ALL ON FUNCTION public.ascend_league_archive_rows(text, timestamptz, timestamptz, boolean, text, text, integer, boolean, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- 5. Periods already written final (skipped by later runs).
CREATE TABLE IF NOT EXISTS public.ascend_league_archive_state (
  period_id    text PRIMARY KEY,
  finalized_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ascend_league_archive_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ascend_league_archive_state FROM anon, authenticated;

-- 6. The job. Safe to run again; returns the number of rows written.
CREATE OR REPLACE FUNCTION public.ascend_run_league_archives(p_now timestamptz DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  p        record;
  v_final  boolean;
  v_rows   int;
  v_members uuid[];
  v_count  int := 0;
BEGIN
  -- One run at a time.
  IF NOT pg_try_advisory_xact_lock(hashtext('ascend_run_league_archives')) THEN
    RETURN 0;
  END IF;

  FOR p IN
    SELECT lp.* FROM public.ascend_league_periods(p_now) lp
    WHERE NOT EXISTS (SELECT 1 FROM public.ascend_league_archive_state s WHERE s.period_id = lp.period_id)
    ORDER BY lp.period_end, lp.period_id
  LOOP
    v_final := p.period_end <= p_now - interval '48 hours';

    -- New rows, and server rows whose standings changed. A row the app wrote is kept as it is,
    -- and so is a server row already final.
    WITH r AS MATERIALIZED (
      SELECT * FROM public.ascend_league_archive_rows(p.period_id, p.score_start, p.period_end,
        p.inclusive_end, p.period_type, p.period_label, p.season_number, v_final, now())
    ), written AS (
      INSERT INTO public.league_archives AS la (user_id, id, data, created_at, updated_at)
      SELECT r.user_id, p.period_id, r.data, p.period_end, now() FROM r
      ON CONFLICT (user_id, id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = greatest(EXCLUDED.updated_at, la.updated_at), deleted_at = NULL
        WHERE la.data->>'source' = 'server'
          AND coalesce((la.data->>'final')::boolean, false) = false
          AND (la.deleted_at IS NOT NULL
               OR (la.data - 'archivedAt') IS DISTINCT FROM (EXCLUDED.data - 'archivedAt'))
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM written), coalesce((SELECT array_agg(r.user_id) FROM r), '{}')
    INTO v_rows, v_members;
    v_count := v_count + v_rows;

    -- A member who no longer has points in the period (revoked entries) loses the server row.
    UPDATE public.league_archives la
    SET deleted_at = now(), updated_at = greatest(now(), la.updated_at)
    WHERE la.id = p.period_id
      AND la.deleted_at IS NULL
      AND la.data->>'source' = 'server'
      AND coalesce((la.data->>'final')::boolean, false) = false
      AND NOT (la.user_id = ANY (v_members));
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;

    IF v_final THEN
      INSERT INTO public.ascend_league_archive_state (period_id, finalized_at)
      VALUES (p.period_id, now())
      ON CONFLICT (period_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_run_league_archives(timestamptz) FROM PUBLIC, anon, authenticated, service_role;

-- 7. The 34 archives the app wrote before this job stay as they are, labelled as the app's.
--    updated_at is kept, so no device treats them as an edit to upload.
UPDATE public.league_archives
SET data = data || '{"source": "client"}'::jsonb
WHERE NOT (data ? 'source');

COMMIT;
