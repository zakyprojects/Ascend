-- League periods: a season start that falls inside a week or month no longer drops the part
-- before it from the archives (plan-league-scaling-2026-10-22.md §10).
--
-- Before: ascend_league_periods scores a week/month that straddles a season start only from the
-- season start (the clamp), and nothing archives the days before it. Season 2 begins
-- 2026-10-30 00:00 UTC, so W:2026-W44 (Oct 26 - Nov 2) would never archive Oct 26-29 and
-- M:2026-10 would archive only Oct 30-31.
-- After: the clamp stays (existing ids keep meaning the in-season part, scored from the season
-- start, exactly as before). For each such week/month that has reached the season start, one
-- more period is returned: '<id>@S<n>' = [period start, season start), n = the season it lies in,
-- e.g. W:2026-W44@S1 'Oct 26 – Oct 29 (Season 1)' and M:2026-10@S1 'Oct 1 – Oct 29, 2026 (Season 1)'.
-- ascend_run_league_archives (the only caller) archives them like any period: provisional rows
-- first, final 48 h after the part ends. No point value, point rule or ledger row changes; the
-- same ledger rows are only also shown as their own record. W:2026-W31 (before the epoch) gets no
-- part: both of its ends are Season 1.
--
-- Unchanged: ascend_run_league_archives, ascend_league_archive_rows, ascend_league_points,
-- ascend_period_points, cron. Same signature and return type (no overload to drop); still
-- LANGUAGE sql STABLE, SECURITY INVOKER, search_path pinned to ''; EXECUTE stays postgres +
-- service_role only (CREATE OR REPLACE keeps the ACL; the REVOKE below restates it).
--
-- Run BEFORE 2026-10-30 00:00 UTC (05:00 PKT), ideally before 2026-10-29 12:00 UTC. Studio and
-- production share one database, so running it is live for production too. If it runs later,
-- nothing is lost: the next :15 archive run back-fills any ended period without a state row.
-- Snapshot first (standing rule): pg_get_functiondef of this function (the rollback below is that body).

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_league_periods(p_now timestamp with time zone)
 RETURNS TABLE(period_id text, period_type text, score_start timestamp with time zone, period_end timestamp with time zone, inclusive_end boolean, period_label text, season_number integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
         e, false,
         to_char(s AT TIME ZONE 'UTC', 'Mon FMDD') || ' – ' || to_char(e AT TIME ZONE 'UTC', 'Mon FMDD'),
         NULL::int
  FROM weeks WHERE e <= p_now
  UNION ALL
  SELECT 'M:' || to_char(s AT TIME ZONE 'UTC', 'YYYY-MM'),
         'monthly',
         greatest(s, public.ascend_season_start(e - interval '1 millisecond')),
         e, false,
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
  FROM seasons WHERE e <= p_now
  UNION ALL
  -- A week that a season start cuts in two: its part before the start, archived as its own record
  -- '<week id>@S<n>' (n = the season it belongs to). The plain week id stays the in-season part.
  SELECT 'W:' || to_char(s AT TIME ZONE 'UTC', 'IYYY') || '-W' || to_char(s AT TIME ZONE 'UTC', 'IW')
           || '@S' || cut.season,
         'weekly',
         s, cut.at, false,
         to_char(s AT TIME ZONE 'UTC', 'Mon FMDD') || ' – '
           || to_char((cut.at - interval '1 millisecond') AT TIME ZONE 'UTC', 'Mon FMDD')
           || ' (Season ' || cut.season || ')',
         NULL::int
  FROM weeks
  CROSS JOIN LATERAL (SELECT public.ascend_season_start(e - interval '1 millisecond') AS at,
                             public.ascend_season_number(s) AS season) cut
  WHERE cut.season < public.ascend_season_number(e - interval '1 millisecond') AND cut.at <= p_now
  UNION ALL
  -- The same for a month: 'M:<yyyy-mm>@S<n>'.
  SELECT 'M:' || to_char(s AT TIME ZONE 'UTC', 'YYYY-MM') || '@S' || cut.season,
         'monthly',
         s, cut.at, false,
         to_char(s AT TIME ZONE 'UTC', 'Mon FMDD') || ' – '
           || to_char((cut.at - interval '1 millisecond') AT TIME ZONE 'UTC', 'Mon FMDD, YYYY')
           || ' (Season ' || cut.season || ')',
         NULL::int
  FROM months
  CROSS JOIN LATERAL (SELECT public.ascend_season_start(e - interval '1 millisecond') AS at,
                             public.ascend_season_number(s) AS season) cut
  WHERE cut.season < public.ascend_season_number(e - interval '1 millisecond') AND cut.at <= p_now;
$function$;

REVOKE ALL ON FUNCTION public.ascend_league_periods(timestamptz) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------------------------
-- Verify, read-only (any role that can read pg_catalog):
-- V1 one overload, not SECURITY DEFINER, search_path pinned, ACL unchanged
--    (want 1 row: prosecdef false, {search_path=""}, {postgres=X/postgres,service_role=X/postgres},
--    has_parts true):
--   SELECT p.oid::regprocedure, p.prosecdef, p.proconfig, p.proacl, position('@S' in p.prosrc) > 0 AS has_parts
--   FROM pg_proc p WHERE p.proname = 'ascend_league_periods';
--
-- Verify, SELECT only but needs the postgres role (SQL editor; the read-only role cannot EXECUTE it):
-- V2 today: no part yet, same 14 periods as before (want 0 and 14 on 2026-10-22):
--   SELECT count(*) FILTER (WHERE period_id LIKE '%@S%'), count(*) FROM public.ascend_league_periods(now());
-- V3 just before the season start: no part (want 0 rows):
--   SELECT * FROM public.ascend_league_periods('2026-10-29 23:59:59+00') WHERE period_id LIKE '%@S%';
-- V4 first archive run of Season 2: exactly these 2 parts
--   (want M:2026-10@S1 [Oct 1, Oct 30) and W:2026-W44@S1 [Oct 26, Oct 30), labels as above):
--   SELECT period_id, period_type, score_start, period_end, period_label
--   FROM public.ascend_league_periods('2026-10-30 00:15:00+00') WHERE period_id LIKE '%@S%' ORDER BY period_end, period_id;
-- V5 the plain ids are unchanged (want W:2026-W44 from Oct 30 to Nov 2, M:2026-10 from Oct 30 to Nov 1):
--   SELECT period_id, score_start, period_end, period_label
--   FROM public.ascend_league_periods('2026-11-02 00:15:00+00') WHERE period_id IN ('W:2026-W44', 'M:2026-10');
-- V6 next season start: W:2027-W04@S2 [Jan 25, Jan 28) and M:2027-01@S2 [Jan 1, Jan 28) besides the
--   two Season 1 parts (want exactly 4 rows; none for W:2026-W31, M:2026-07 or M:2026-08):
--   SELECT period_id, score_start, period_end, period_label
--   FROM public.ascend_league_periods('2027-01-28 00:15:00+00') WHERE period_id LIKE '%@S%' ORDER BY period_end;
-- After the 2026-10-30 00:15 UTC run (05:15 PKT), read-only:
-- V7 provisional rows exist (one per member with points in [period start, Oct 30)):
--   SELECT id, count(*) FROM public.league_archives WHERE id LIKE '%@S%' AND deleted_at IS NULL GROUP BY id;
-- V8 (2026-11-01 00:15 UTC on) the parts are final:
--   SELECT period_id, finalized_at FROM public.ascend_league_archive_state WHERE period_id LIKE '%@S%';
--
-- ---------------------------------------------------------------------------------------------
-- Rollback (needs Zakria's go; postgres role):
-- 1. Restore the body this migration replaced (live definition read 2026-10-22; identical apart from
--    line endings: the live copy has CRLF, md5(replace(prosrc, chr(13), '')) = 66a6afe392ca7ce2ec3bca5930e61488):
-- CREATE OR REPLACE FUNCTION public.ascend_league_periods(p_now timestamp with time zone)
--  RETURNS TABLE(period_id text, period_type text, score_start timestamp with time zone, period_end timestamp with time zone, inclusive_end boolean, period_label text, season_number integer)
--  LANGUAGE sql
--  STABLE
--  SET search_path TO ''
-- AS $function$
--   WITH weeks AS (
--     SELECT s AT TIME ZONE 'UTC' AS s, (s + interval '7 days') AT TIME ZONE 'UTC' AS e
--     FROM generate_series(
--       date_trunc('week', public.ascend_season_epoch() AT TIME ZONE 'UTC'),
--       p_now AT TIME ZONE 'UTC',
--       interval '7 days') s
--   ), months AS (
--     SELECT s AT TIME ZONE 'UTC' AS s, (s + interval '1 month') AT TIME ZONE 'UTC' AS e
--     FROM generate_series(
--       date_trunc('month', public.ascend_season_epoch() AT TIME ZONE 'UTC'),
--       p_now AT TIME ZONE 'UTC',
--       interval '1 month') s
--   ), seasons AS (
--     SELECT n, public.ascend_season_begin(n) AS s, public.ascend_season_begin(n + 1) AS e
--     FROM generate_series(1, least(
--       (SELECT st.current_season FROM public.ascend_season_state st WHERE st.id),
--       public.ascend_season_number(p_now)) - 1) n
--   )
--   SELECT 'W:' || to_char(s AT TIME ZONE 'UTC', 'IYYY') || '-W' || to_char(s AT TIME ZONE 'UTC', 'IW'),
--          'weekly',
--          greatest(s, public.ascend_season_start(e - interval '1 millisecond')),
--          e, false,
--          to_char(s AT TIME ZONE 'UTC', 'Mon FMDD') || ' – ' || to_char(e AT TIME ZONE 'UTC', 'Mon FMDD'),
--          NULL::int
--   FROM weeks WHERE e <= p_now
--   UNION ALL
--   SELECT 'M:' || to_char(s AT TIME ZONE 'UTC', 'YYYY-MM'),
--          'monthly',
--          greatest(s, public.ascend_season_start(e - interval '1 millisecond')),
--          e, false,
--          to_char(s AT TIME ZONE 'UTC', 'FMMonth YYYY'),
--          NULL::int
--   FROM months WHERE e <= p_now
--   UNION ALL
--   SELECT 'S:' || n,
--          'ninetyDay',
--          s, e, false,
--          'Season ' || n || ' (' || to_char(s AT TIME ZONE 'UTC', 'Mon FMDD, YYYY') || ' – '
--            || to_char(e AT TIME ZONE 'UTC', 'Mon FMDD, YYYY') || ')',
--          n
--   FROM seasons WHERE e <= p_now;
-- $function$;
--    REVOKE ALL ON FUNCTION public.ascend_league_periods(timestamptz) FROM PUBLIC, anon, authenticated;
-- 2. Only if parts were already archived: hide them and forget their state.
--    UPDATE public.league_archives SET deleted_at = now(), updated_at = now()
--    WHERE id LIKE '%@S%' AND data->>'source' = 'server' AND deleted_at IS NULL;
--    DELETE FROM public.ascend_league_archive_state WHERE period_id LIKE '%@S%';
