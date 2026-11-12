-- Partner challenges across time zones could never finish (knowledge/mode-a-partner-dates-2026-11-12.md):
-- each side's day 1 was its own local creation date, so when the two dates differed at the creation
-- instant (e.g. 01:00 PKT = 20:00 London the evening before) the same-date match of both sides
-- could reach at most duration - 1.
-- Fix: a frozen shared start date per pact = the LATER of the two partners' local dates at creation
-- (the first date both can still tick). Both sides tick the same dates start .. start + N - 1, so the
-- same-date match, the notify trigger and the clients' joint counts stay as they are.
-- * new column shared_challenges.start_date (date, nullable; NULL = old rule, own creation date).
-- * shared_challenges_guard: sets it on every INSERT (also service role and prod 1.3.0 clients, which
--   never send it; a client value is overwritten), freezes it on UPDATE, counts own days and the
--   'expired' rule from it, and refuses a tick before day 1 (behind partner on the creation evening).
-- * ascend_run_pact_expiry: counts from it.
-- * backfill of existing rows with the same rule (1 row on 2026-11-12, already expired).
-- Same-zone pairs: start_date = the creation date, behaviour unchanged.
-- Table grants are table-level (authenticated = arw), so the new column needs no new GRANT.
-- Run BEFORE the studio test (old clients keep working). Rollback: re-run both live bodies saved in
-- work/snapshots/partner-start-date-2026-11-12/ (then the REVOKEs below); the column may stay.

BEGIN;

ALTER TABLE public.shared_challenges ADD COLUMN IF NOT EXISTS start_date date;

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
  -- A caller-less insert (service role) without a start date gets the same rule as the app's
  -- inserts below: the later of the two partners' local dates at creation.
  IF TG_OP = 'INSERT' AND v_uid IS NULL AND NEW.start_date IS NULL THEN
    SELECT greatest(
             (coalesce(NEW.created_at, now()) AT TIME ZONE public.ascend_user_timezone(p.user1_id))::date,
             (coalesce(NEW.created_at, now()) AT TIME ZONE public.ascend_user_timezone(p.user2_id))::date)
    INTO NEW.start_date
    FROM public.partnerships p
    WHERE p.id = NEW.partnership_id;
  END IF;

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
    -- The shared start date (any value the client sent is replaced): the later of the two
    -- partners' local dates now, the first date both can still tick.
    SELECT greatest((NEW.created_at AT TIME ZONE public.ascend_user_timezone(p.user1_id))::date,
                    (NEW.created_at AT TIME ZONE public.ascend_user_timezone(p.user2_id))::date)
    INTO NEW.start_date
    FROM public.partnerships p
    WHERE p.id = NEW.partnership_id;
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
  NEW.start_date := OLD.start_date;
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
  -- (day 1 = start_date, the same calendar date for both; a row without one counts from the
  -- creation day in the caller's zone). Before day 1 (the partner behind in time on the creation
  -- evening) and after the last day their side stays as it is.
  v_own_day := (now() AT TIME ZONE v_tz)::date
               - coalesce(OLD.start_date, (OLD.created_at AT TIME ZONE v_tz)::date) + 1;
  IF v_own_day BETWEEN 1 AND coalesce(OLD.duration_days, 7) THEN
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
    WHEN (now() AT TIME ZONE v_tz1)::date - coalesce(NEW.start_date, (NEW.created_at AT TIME ZONE v_tz1)::date) + 1 > v_duration
     AND (now() AT TIME ZONE v_tz2)::date - coalesce(NEW.start_date, (NEW.created_at AT TIME ZONE v_tz2)::date) + 1 > v_duration THEN 'expired'
    ELSE 'active'
  END;
  NEW.joint_streak := least(greatest(coalesce(NEW.joint_streak, 0), 0), v_total);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ascend_run_pact_expiry()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.shared_challenges sc
  SET status = CASE
    WHEN coalesce(sc.total_joint_days_completed, 0) >= coalesce(sc.duration_days, 7) THEN 'completed'
    ELSE 'expired'
  END
  FROM public.partnerships p,
       LATERAL (SELECT public.ascend_user_timezone(p.user1_id) AS tz1,
                       public.ascend_user_timezone(p.user2_id) AS tz2) z
  WHERE p.id = sc.partnership_id
    AND sc.status = 'active'
    AND (now() AT TIME ZONE z.tz1)::date - coalesce(sc.start_date, (sc.created_at AT TIME ZONE z.tz1)::date) + 1 > coalesce(sc.duration_days, 7)
    AND (now() AT TIME ZONE z.tz2)::date - coalesce(sc.start_date, (sc.created_at AT TIME ZONE z.tz2)::date) + 1 > coalesce(sc.duration_days, 7);
END;
$function$;

UPDATE public.shared_challenges sc
SET start_date = greatest((sc.created_at AT TIME ZONE public.ascend_user_timezone(p.user1_id))::date,
                          (sc.created_at AT TIME ZONE public.ascend_user_timezone(p.user2_id))::date)
FROM public.partnerships p
WHERE p.id = sc.partnership_id
  AND sc.start_date IS NULL;

REVOKE ALL ON FUNCTION public.shared_challenges_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_challenges_guard() TO service_role;
REVOKE ALL ON FUNCTION public.ascend_run_pact_expiry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_run_pact_expiry() TO service_role;

COMMIT;
