-- League periods: a season part that is one day long gets a one-day label, matching the app
-- (studio 458dc00): 'Jul 26 (Season 4)' instead of 'Jul 26 – Jul 26 (Season 4)'.
--
-- Only the period_label text of the '<id>@S<n>' rows changes, and only when the part is one day
-- (first case: W:2027-W30@S4, Season 5 starts Tue 2027-07-27; a month part would be one day only
-- if a season started on the 2nd: 'Jan 1, 2027 (Season n)'). Ids, windows, scores, archives,
-- ranks and every other label are unchanged. The app builds its labels from the archive id, so
-- the stored label is only its fallback.
--
-- Based on the live body applied from 20261022150000 (read 2026-10-22 17:30 PKT, identical to that
-- file; md5(replace(prosrc, chr(13), '')) = da26e089cf145e84df03743cc0d3e6e5). Same signature and
-- return type (no overload to drop); LANGUAGE sql STABLE, SECURITY INVOKER, search_path pinned
-- to ''; EXECUTE stays postgres + service_role only (CREATE OR REPLACE keeps the ACL; the REVOKE
-- restates it).
--
-- RUN: any time, no client dependency (cosmetic; nothing is archived with a one-day part before
-- 2027-07). With Zakria's go, in the post-production-push batch. Snapshot first (standing rule):
-- pg_get_functiondef of this function (the rollback below is that body).

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
         CASE WHEN (s AT TIME ZONE 'UTC')::date = ((cut.at - interval '1 millisecond') AT TIME ZONE 'UTC')::date
              THEN to_char(s AT TIME ZONE 'UTC', 'Mon FMDD')
              ELSE to_char(s AT TIME ZONE 'UTC', 'Mon FMDD') || ' – '
                     || to_char((cut.at - interval '1 millisecond') AT TIME ZONE 'UTC', 'Mon FMDD')
         END || ' (Season ' || cut.season || ')',
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
         CASE WHEN (s AT TIME ZONE 'UTC')::date = ((cut.at - interval '1 millisecond') AT TIME ZONE 'UTC')::date
              THEN to_char(s AT TIME ZONE 'UTC', 'Mon FMDD, YYYY')
              ELSE to_char(s AT TIME ZONE 'UTC', 'Mon FMDD') || ' – '
                     || to_char((cut.at - interval '1 millisecond') AT TIME ZONE 'UTC', 'Mon FMDD, YYYY')
         END || ' (Season ' || cut.season || ')',
         NULL::int
  FROM months
  CROSS JOIN LATERAL (SELECT public.ascend_season_start(e - interval '1 millisecond') AS at,
                             public.ascend_season_number(s) AS season) cut
  WHERE cut.season < public.ascend_season_number(e - interval '1 millisecond') AND cut.at <= p_now;
$function$;

REVOKE ALL ON FUNCTION public.ascend_league_periods(timestamptz) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------------------------
-- Verify, read-only:
-- V1 one overload, invoker, search_path pinned, ACL unchanged, the new label rule present
--    (want 1 row: false, {search_path=""}, {postgres=X/postgres,service_role=X/postgres}, true):
--   SELECT p.oid::regprocedure, p.prosecdef, p.proconfig, p.proacl, position('CASE WHEN' in p.prosrc) > 0
--   FROM pg_proc p WHERE p.proname = 'ascend_league_periods';
-- Verify, SELECT only but needs the postgres role (SQL editor):
-- V2 the one-day part (want W:2027-W30@S4 [2027-07-26, 2027-07-27) 'Jul 26 (Season 4)'):
--   SELECT period_id, score_start, period_end, period_label FROM public.ascend_league_periods('2027-07-27 00:15:00+00')
--   WHERE period_id = 'W:2027-W30@S4';
-- V3 longer parts keep their range (want 'Oct 26 – Oct 29 (Season 1)' and 'Oct 1 – Oct 29, 2026 (Season 1)'):
--   SELECT period_id, period_label FROM public.ascend_league_periods('2026-10-30 00:15:00+00')
--   WHERE period_id LIKE '%@S%' ORDER BY period_id;
-- V4 everything else identical: run V2-V6 of 20261022150000 again (same expected output).
--
-- ---------------------------------------------------------------------------------------------
-- Rollback (needs Zakria's go; postgres role): restore the body this migration replaced, then
--   REVOKE ALL ON FUNCTION public.ascend_league_periods(timestamptz) FROM PUBLIC, anon, authenticated;
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
--   FROM seasons WHERE e <= p_now
--   UNION ALL
--   -- A week that a season start cuts in two: its part before the start, archived as its own record
--   -- '<week id>@S<n>' (n = the season it belongs to). The plain week id stays the in-season part.
--   SELECT 'W:' || to_char(s AT TIME ZONE 'UTC', 'IYYY') || '-W' || to_char(s AT TIME ZONE 'UTC', 'IW')
--            || '@S' || cut.season,
--          'weekly',
--          s, cut.at, false,
--          to_char(s AT TIME ZONE 'UTC', 'Mon FMDD') || ' – '
--            || to_char((cut.at - interval '1 millisecond') AT TIME ZONE 'UTC', 'Mon FMDD')
--            || ' (Season ' || cut.season || ')',
--          NULL::int
--   FROM weeks
--   CROSS JOIN LATERAL (SELECT public.ascend_season_start(e - interval '1 millisecond') AS at,
--                              public.ascend_season_number(s) AS season) cut
--   WHERE cut.season < public.ascend_season_number(e - interval '1 millisecond') AND cut.at <= p_now
--   UNION ALL
--   -- The same for a month: 'M:<yyyy-mm>@S<n>'.
--   SELECT 'M:' || to_char(s AT TIME ZONE 'UTC', 'YYYY-MM') || '@S' || cut.season,
--          'monthly',
--          s, cut.at, false,
--          to_char(s AT TIME ZONE 'UTC', 'Mon FMDD') || ' – '
--            || to_char((cut.at - interval '1 millisecond') AT TIME ZONE 'UTC', 'Mon FMDD, YYYY')
--            || ' (Season ' || cut.season || ')',
--          NULL::int
--   FROM months
--   CROSS JOIN LATERAL (SELECT public.ascend_season_start(e - interval '1 millisecond') AS at,
--                              public.ascend_season_number(s) AS season) cut
--   WHERE cut.season < public.ascend_season_number(e - interval '1 millisecond') AND cut.at <= p_now;
-- $function$;
