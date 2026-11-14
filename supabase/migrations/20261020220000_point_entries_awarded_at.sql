-- League and season points read a stored instant instead of parsing every ledger row (scaling C1).
--
-- ascend_period_points (used by ascend_league_points for every viewer's league refresh and by the
-- hourly league archive cron), ascend_season_points and ascend_season_history used to filter and
-- sort on public.ascend_instant(data->>'timestamp'): a plpgsql call with an EXCEPTION block per row,
-- which no index can serve. Measured live: ascend_league_points mean ~873 ms.
--
-- awarded_at is that same value, stored. A BEFORE INSERT/UPDATE trigger sets it from
-- public.ascend_instant(NEW.data->>'timestamp') on every write, so it can never disagree with the
-- row's data (a client cannot set it: the trigger overwrites it, and client writes are dropped by
-- point_entries_guard_server_owned anyway). It is NULL exactly when ascend_instant returns NULL, and
-- those rows were already excluded by every comparison, so results are unchanged. A generated column
-- is not possible: a text -> timestamptz cast is not immutable.
--
-- Same output, same signatures, same grants (CREATE OR REPLACE keeps them): the production app and
-- the studio app share this database and neither needs a change. The client mirrors
-- (calculatePeriodPoints, calculateSeasonalTotal in src/lib/leagues.ts) keep the same maths.
--
-- Backfill: existing rows get awarded_at with three triggers switched off for that one UPDATE, so it
-- changes nothing else: point_entries_stamp (server_updated_at stays, so no device re-pulls its
-- ledger), point_entries_refresh_season_points_upd (no profile rewrite; season points are unchanged)
-- and point_entries_guard_future (old rows are not re-judged). They are switched back on in the same
-- transaction, so a failure anywhere rolls everything back with them on.
--
-- Locks: ADD COLUMN takes a short ACCESS EXCLUSIVE lock on point_entries that is held to COMMIT, so
-- award writes and league reads wait for the whole transaction (well under a second at ~2.5k rows).
-- lock_timeout stops it queueing behind a long reader. The indexes are built inside the transaction
-- (not CONCURRENTLY) because the table is small; rebuild CONCURRENTLY if this is ever re-run on a
-- table with hundreds of thousands of rows.
--
-- Rollback (all reads go back to parsing): re-run the three function bodies from
-- 20261017060000_league_archives_server.sql (ascend_period_points) and
-- 20261016140000_season_master_rollover.sql (ascend_season_points, ascend_season_history), then
--   DROP TRIGGER point_entries_set_awarded_at ON public.point_entries;
--   DROP FUNCTION public.point_entries_set_awarded_at();
--   ALTER TABLE public.point_entries DROP COLUMN awarded_at;  -- drops both indexes
-- The functions must be restored first: they reference the column.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.point_entries ADD COLUMN IF NOT EXISTS awarded_at timestamptz;

-- SECURITY DEFINER: ascend_instant is not executable by client roles. The trigger name sorts after
-- point_entries_guard_server_owned, so a dropped client write never reaches it.
CREATE OR REPLACE FUNCTION public.point_entries_set_awarded_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.awarded_at := public.ascend_instant(NEW.data->>'timestamp');
  RETURN NEW;
END;
$$;

-- A trigger function only; no client role may call it (new functions get EXECUTE by default).
REVOKE ALL ON FUNCTION public.point_entries_set_awarded_at() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.point_entries
  DISABLE TRIGGER point_entries_stamp,
  DISABLE TRIGGER point_entries_refresh_season_points_upd,
  DISABLE TRIGGER point_entries_guard_future;

UPDATE public.point_entries
   SET awarded_at = public.ascend_instant(data->>'timestamp')
 WHERE awarded_at IS DISTINCT FROM public.ascend_instant(data->>'timestamp');

ALTER TABLE public.point_entries
  ENABLE TRIGGER point_entries_stamp,
  ENABLE TRIGGER point_entries_refresh_season_points_upd,
  ENABLE TRIGGER point_entries_guard_future;

DROP TRIGGER IF EXISTS point_entries_set_awarded_at ON public.point_entries;
CREATE TRIGGER point_entries_set_awarded_at
BEFORE INSERT OR UPDATE ON public.point_entries
FOR EACH ROW EXECUTE FUNCTION public.point_entries_set_awarded_at();

-- League periods across all users (ascend_period_points).
CREATE INDEX IF NOT EXISTS point_entries_awarded_at_idx
  ON public.point_entries (awarded_at)
  WHERE deleted_at IS NULL;

-- One user's season total and history, in time order (ascend_season_points / ascend_season_history).
CREATE INDEX IF NOT EXISTS point_entries_user_awarded_at_idx
  ON public.point_entries (user_id, awarded_at)
  WHERE deleted_at IS NULL;

-- Same body as 20261017060000 except the instant: awarded_at instead of ascend_instant(...).
-- The end bound is written as `<= p_end AND (< p_end OR p_inclusive_end)` so both bounds are index
-- conditions; it keeps exactly the rows of the old `< p_end OR (p_inclusive_end AND = p_end)`.
CREATE OR REPLACE FUNCTION public.ascend_period_points(p_start timestamptz, p_end timestamptz, p_inclusive_end boolean)
RETURNS TABLE(user_id uuid, points integer)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
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
      AND pe.awarded_at >= p_start
      AND pe.awarded_at <= p_end
      AND (pe.awarded_at < p_end OR p_inclusive_end)
    ORDER BY pe.user_id, pe.awarded_at, pe.id
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
$$;

-- Same body as 20261016140000 except the instant.
CREATE OR REPLACE FUNCTION public.ascend_season_points(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start  timestamptz := public.ascend_season_start(now());
  v_total  numeric := 0;
  v_amount numeric;
BEGIN
  FOR v_amount IN
    SELECT coalesce((pe.data->>'amount')::numeric, 0)
    FROM public.point_entries pe
    WHERE pe.user_id = p_user
      AND pe.deleted_at IS NULL
      AND coalesce(pe.data->>'source', '') <> 'system'
      AND coalesce(pe.data->>'reason', '') <> 'System: Debt Forgiveness'
      AND pe.awarded_at >= v_start
    ORDER BY pe.awarded_at
  LOOP
    v_total := greatest(v_total + v_amount, 0);
  END LOOP;
  RETURN round(v_total)::int;
END;
$$;

-- Same body as 20261016140000 except the instant.
CREATE OR REPLACE FUNCTION public.ascend_season_history(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_current int := public.ascend_season_number(now());
  v_start   timestamptz;
  v_end     timestamptz;
  v_total   numeric;
  v_amount  numeric;
  v_history jsonb := '[]'::jsonb;
BEGIN
  FOR v_season IN REVERSE (v_current - 1)..1 LOOP
    v_start := public.ascend_season_begin(v_season);
    v_end   := v_start + public.ascend_season_length();
    v_total := 0;
    FOR v_amount IN
      SELECT coalesce((pe.data->>'amount')::numeric, 0)
      FROM public.point_entries pe
      WHERE pe.user_id = p_user
        AND pe.deleted_at IS NULL
        AND coalesce(pe.data->>'source', '') <> 'system'
        AND coalesce(pe.data->>'reason', '') <> 'System: Debt Forgiveness'
        AND pe.awarded_at >= v_start
        AND pe.awarded_at < v_end
      ORDER BY pe.awarded_at
    LOOP
      v_total := greatest(v_total + v_amount, 0);
    END LOOP;
    IF round(v_total) > 0 THEN
      v_history := v_history || jsonb_build_array(jsonb_build_object(
        'seasonNumber', v_season,
        'seasonName', 'Season ' || v_season,
        'points', round(v_total)::int,
        'date', to_char((v_end - interval '1 millisecond') AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      ));
    END IF;
  END LOOP;
  RETURN v_history;
END;
$$;

ANALYZE public.point_entries;

COMMIT;
