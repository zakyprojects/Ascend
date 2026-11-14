-- Pacts: a finished challenge takes no more ticks, unticks or notices (studio, habit-linked pacts
-- Mode B 2026-10-22; Mode A knowledge/mode-a-partners-habit-link-2026-10-22.md §4 #1).
--
-- In plain words: once a challenge is completed or ended, nobody's tick changes it any more, so a
-- habit with the same name (for example after "Start again") can't add days to the old one, the
-- partner gets no "completed today" notice for it, and an ended challenge can't flip to completed.
-- Also, a member whose own last day is over can't add a day after it (the partner, in a zone
-- behind, may still be on their last day and can still tick).
--
-- What changes: only the UPDATE branch of public.shared_challenges_guard():
--   1. OLD.status completed / expired / broken  ->  NEW := OLD (row unchanged; the AFTER UPDATE
--      notify trigger sees no new own day and no total change, so it sends nothing).
--   2. Own today is added/removed only while the caller's day number (creation day = 1, caller's
--      own zone, the same zone as v_today) is <= duration_days; otherwise the caller's side is kept.
-- Unchanged: the INSERT branch (pacts start empty), the frozen columns, own-side-only and
-- own-today-only rules, the both-partner expiry rule, writes without a caller (cron
-- ascend_run_pact_expiry, service role) which return before any of this.
--
-- Same signature, trigger function, no overload to drop. SECURITY DEFINER with search_path ''
-- pinned (as live). EXECUTE stays postgres + service_role only (CREATE OR REPLACE keeps the ACL;
-- the REVOKE restates it). The trigger itself is not touched.
--
-- Based on the live body read 2026-10-22 ~18:10 PKT,
-- md5(replace(prosrc, chr(13), '')) = e59f104badf7e72f8704870cbabd9d39 (the rollback below is that body).
--
-- Risk: low. Live has 4 pacts, all active, none past its last day (nothing changes for them today).
-- Production's current app already only ticks running challenges from the pact button; its habit
-- tick also writes finished ones, which this now refuses silently (the intended fix). No app write
-- of a finished pact is legitimate (the app never sends a status).
--
-- RUN: BEFORE Zakria's studio test (test A6/F1 checks the server half), safe for production as it
-- is now (prod-compatible, no client dependency). Snapshot first (standing rule):
--   SELECT pg_get_functiondef('public.shared_challenges_guard()'::regprocedure);
--
-- Verify (read-only, after applying):
--   SELECT md5(replace(prosrc, chr(13), '')) <> 'e59f104badf7e72f8704870cbabd9d39' AS changed,
--          prosrc LIKE '%IN (''completed'', ''expired'', ''broken'')%' AS frozen_branch,
--          prosrc LIKE '%v_own_day <= coalesce(OLD.duration_days, 7)%' AS last_day_rule,
--          prosecdef, proconfig, proacl
--   FROM pg_proc WHERE oid = 'public.shared_challenges_guard()'::regprocedure;
--   -- want: true, true, true, true, {search_path=""}, {postgres=X/postgres,service_role=X/postgres}
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'shared_challenges_guard';   -- want 1
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'public.shared_challenges'::regclass AND NOT tgisinternal; -- guard + notify, 'O'

BEGIN;

CREATE OR REPLACE FUNCTION public.shared_challenges_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_user1 boolean;
  v_today    text;
  v_tz       text;
  v_own      text[];
  v_new_own  text[];
  v_u1       text[];
  v_u2       text[];
  v_total    integer;
  v_duration integer;
  v_user1    uuid;
  v_user2    uuid;
  v_tz1      text;
  v_tz2      text;
  v_own_day  integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.shared_challenges sc WHERE sc.id = NEW.id) THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.partnerships p
      WHERE p.id = NEW.partnership_id AND (p.user1_id = v_uid OR p.user2_id = v_uid)
    ) THEN
      RAISE EXCEPTION 'Unauthorized: You are not a member of this partnership.';
    END IF;
    NEW.created_at := now();
    NEW.user1_done_dates := '[]'::jsonb;
    NEW.user2_done_dates := '[]'::jsonb;
    NEW.user1_done_date := NULL;
    NEW.user2_done_date := NULL;
    NEW.joint_streak := 0;
    NEW.total_joint_days_completed := 0;
    NEW.status := 'active';
    RETURN NEW;
  END IF;

  SELECT (p.user1_id = v_uid), p.user1_id, p.user2_id INTO v_is_user1, v_user1, v_user2
  FROM public.partnerships p
  WHERE p.id = OLD.partnership_id AND (p.user1_id = v_uid OR p.user2_id = v_uid);
  IF v_is_user1 IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: You are not a member of this partnership.';
  END IF;

  NEW.id := OLD.id;
  NEW.partnership_id := OLD.partnership_id;
  NEW.created_at := OLD.created_at;
  NEW.title := OLD.title;
  NEW.target_habit_name := OLD.target_habit_name;
  NEW.duration_days := OLD.duration_days;
  NEW.user1_category := OLD.user1_category;
  NEW.user1_target := OLD.user1_target;
  NEW.user2_category := OLD.user2_category;
  NEW.user2_target := OLD.user2_target;

  -- A finished pact (completed or ended) is frozen: no tick, no untick, no status change, so the
  -- notify trigger sends nothing either. The hourly pact expiry runs without a caller (above).
  IF OLD.status IN ('completed', 'expired', 'broken') THEN
    NEW := OLD;
    RETURN NEW;
  END IF;

  v_tz := coalesce(public.ascend_own_timezone(v_uid), 'Asia/Karachi');
  v_today := to_char((now() AT TIME ZONE v_tz)::date, 'YYYY-MM-DD');

  IF v_is_user1 THEN
    v_own := public.ascend_pact_dates(OLD.user1_done_dates, OLD.user1_done_date);
    v_new_own := public.ascend_pact_dates(NEW.user1_done_dates, NULL);
  ELSE
    v_own := public.ascend_pact_dates(OLD.user2_done_dates, OLD.user2_done_date);
    v_new_own := public.ascend_pact_dates(NEW.user2_done_dates, NULL);
  END IF;
  -- The caller's own today changes only while today is one of the pact's days for the caller
  -- (day 1 = the creation day in the caller's zone); after the caller's last day their side stays
  -- as it is, while the partner may still be on theirs.
  v_own_day := (now() AT TIME ZONE v_tz)::date - (OLD.created_at AT TIME ZONE v_tz)::date + 1;
  IF v_own_day <= coalesce(OLD.duration_days, 7) THEN
    v_own := array_remove(v_own, v_today);
    IF v_today = ANY (v_new_own) THEN
      v_own := v_own || v_today;
    END IF;
  END IF;
  SELECT coalesce(array_agg(d ORDER BY d), '{}'::text[]) INTO v_own FROM unnest(v_own) AS u(d);

  IF v_is_user1 THEN
    NEW.user1_done_dates := to_jsonb(v_own);
    NEW.user1_done_date := v_own[array_upper(v_own, 1)]::date;
    NEW.user2_done_dates := OLD.user2_done_dates;
    NEW.user2_done_date := OLD.user2_done_date;
  ELSE
    NEW.user2_done_dates := to_jsonb(v_own);
    NEW.user2_done_date := v_own[array_upper(v_own, 1)]::date;
    NEW.user1_done_dates := OLD.user1_done_dates;
    NEW.user1_done_date := OLD.user1_done_date;
  END IF;

  v_u1 := public.ascend_pact_dates(NEW.user1_done_dates, NEW.user1_done_date);
  v_u2 := public.ascend_pact_dates(NEW.user2_done_dates, NEW.user2_done_date);
  SELECT count(*) INTO v_total FROM (SELECT unnest(v_u1) INTERSECT SELECT unnest(v_u2)) j;
  v_duration := coalesce(NEW.duration_days, 7);
  v_tz1 := public.ascend_user_timezone(v_user1);
  v_tz2 := public.ascend_user_timezone(v_user2);

  NEW.total_joint_days_completed := v_total;
  NEW.status := CASE
    WHEN v_total >= v_duration THEN 'completed'
    WHEN (now() AT TIME ZONE v_tz1)::date - (NEW.created_at AT TIME ZONE v_tz1)::date + 1 > v_duration
     AND (now() AT TIME ZONE v_tz2)::date - (NEW.created_at AT TIME ZONE v_tz2)::date + 1 > v_duration THEN 'expired'
    ELSE 'active'
  END;
  NEW.joint_streak := least(greatest(coalesce(NEW.joint_streak, 0), 0), v_total);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.shared_challenges_guard() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ROLLBACK (the live body before this file; run as one statement, then the REVOKE above):
-- CREATE OR REPLACE FUNCTION public.shared_challenges_guard()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
-- DECLARE
--   v_uid      uuid := auth.uid();
--   v_is_user1 boolean;
--   v_today    text;
--   v_tz       text;
--   v_own      text[];
--   v_new_own  text[];
--   v_u1       text[];
--   v_u2       text[];
--   v_total    integer;
--   v_duration integer;
--   v_user1    uuid;
--   v_user2    uuid;
--   v_tz1      text;
--   v_tz2      text;
-- BEGIN
--   IF v_uid IS NULL THEN
--     RETURN NEW;
--   END IF;
--
--   IF TG_OP = 'INSERT' THEN
--     IF EXISTS (SELECT 1 FROM public.shared_challenges sc WHERE sc.id = NEW.id) THEN
--       RETURN NEW;
--     END IF;
--     IF NOT EXISTS (
--       SELECT 1 FROM public.partnerships p
--       WHERE p.id = NEW.partnership_id AND (p.user1_id = v_uid OR p.user2_id = v_uid)
--     ) THEN
--       RAISE EXCEPTION 'Unauthorized: You are not a member of this partnership.';
--     END IF;
--     NEW.created_at := now();
--     NEW.user1_done_dates := '[]'::jsonb;
--     NEW.user2_done_dates := '[]'::jsonb;
--     NEW.user1_done_date := NULL;
--     NEW.user2_done_date := NULL;
--     NEW.joint_streak := 0;
--     NEW.total_joint_days_completed := 0;
--     NEW.status := 'active';
--     RETURN NEW;
--   END IF;
--
--   SELECT (p.user1_id = v_uid), p.user1_id, p.user2_id INTO v_is_user1, v_user1, v_user2
--   FROM public.partnerships p
--   WHERE p.id = OLD.partnership_id AND (p.user1_id = v_uid OR p.user2_id = v_uid);
--   IF v_is_user1 IS NULL THEN
--     RAISE EXCEPTION 'Unauthorized: You are not a member of this partnership.';
--   END IF;
--
--   NEW.id := OLD.id;
--   NEW.partnership_id := OLD.partnership_id;
--   NEW.created_at := OLD.created_at;
--   NEW.title := OLD.title;
--   NEW.target_habit_name := OLD.target_habit_name;
--   NEW.duration_days := OLD.duration_days;
--   NEW.user1_category := OLD.user1_category;
--   NEW.user1_target := OLD.user1_target;
--   NEW.user2_category := OLD.user2_category;
--   NEW.user2_target := OLD.user2_target;
--
--   v_tz := coalesce(public.ascend_own_timezone(v_uid), 'Asia/Karachi');
--   v_today := to_char((now() AT TIME ZONE v_tz)::date, 'YYYY-MM-DD');
--
--   IF v_is_user1 THEN
--     v_own := public.ascend_pact_dates(OLD.user1_done_dates, OLD.user1_done_date);
--     v_new_own := public.ascend_pact_dates(NEW.user1_done_dates, NULL);
--   ELSE
--     v_own := public.ascend_pact_dates(OLD.user2_done_dates, OLD.user2_done_date);
--     v_new_own := public.ascend_pact_dates(NEW.user2_done_dates, NULL);
--   END IF;
--   v_own := array_remove(v_own, v_today);
--   IF v_today = ANY (v_new_own) THEN
--     v_own := v_own || v_today;
--   END IF;
--   SELECT coalesce(array_agg(d ORDER BY d), '{}'::text[]) INTO v_own FROM unnest(v_own) AS u(d);
--
--   IF v_is_user1 THEN
--     NEW.user1_done_dates := to_jsonb(v_own);
--     NEW.user1_done_date := v_own[array_upper(v_own, 1)]::date;
--     NEW.user2_done_dates := OLD.user2_done_dates;
--     NEW.user2_done_date := OLD.user2_done_date;
--   ELSE
--     NEW.user2_done_dates := to_jsonb(v_own);
--     NEW.user2_done_date := v_own[array_upper(v_own, 1)]::date;
--     NEW.user1_done_dates := OLD.user1_done_dates;
--     NEW.user1_done_date := OLD.user1_done_date;
--   END IF;
--
--   v_u1 := public.ascend_pact_dates(NEW.user1_done_dates, NEW.user1_done_date);
--   v_u2 := public.ascend_pact_dates(NEW.user2_done_dates, NEW.user2_done_date);
--   SELECT count(*) INTO v_total FROM (SELECT unnest(v_u1) INTERSECT SELECT unnest(v_u2)) j;
--   v_duration := coalesce(NEW.duration_days, 7);
--   v_tz1 := public.ascend_user_timezone(v_user1);
--   v_tz2 := public.ascend_user_timezone(v_user2);
--
--   NEW.total_joint_days_completed := v_total;
--   NEW.status := CASE
--     WHEN v_total >= v_duration THEN 'completed'
--     WHEN (now() AT TIME ZONE v_tz1)::date - (NEW.created_at AT TIME ZONE v_tz1)::date + 1 > v_duration
--      AND (now() AT TIME ZONE v_tz2)::date - (NEW.created_at AT TIME ZONE v_tz2)::date + 1 > v_duration THEN 'expired'
--     ELSE 'active'
--   END;
--   NEW.joint_streak := least(greatest(coalesce(NEW.joint_streak, 0), 0), v_total);
--   RETURN NEW;
-- END;
-- $function$;
