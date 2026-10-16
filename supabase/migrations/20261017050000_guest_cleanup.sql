-- Abandoned guest cleanup.
--
-- Anonymous guests that nobody has used for p_days (default 30) are deleted
-- from auth.users once a day. Every user table cascades from auth.users or
-- profiles, and auth.sessions/refresh_tokens cascade too, so one DELETE removes
-- the guest everywhere and kills its refresh token.
--
-- Safety:
--   * Only true guests: is_anonymous AND no email AND no phone AND not SSO AND
--     not soft-deleted. The DELETE re-checks is_anonymous.
--   * Activity = latest of users.created_at, users.last_sign_in_at,
--     users.updated_at, any session's refreshed_at/updated_at/created_at and
--     user_data.updated_at (capped at now()). last_sign_in_at alone is not
--     enough: token refreshes only move auth.sessions. Server-written rows
--     (point_entries from the penalty cron, notifications) never count.
--   * A guest with a plan that another user follows or has notes on is skipped
--     and logged, so nobody else loses data.
--   * At most p_limit guests per run, least recently active first.
--   * p_days must be >= 7 unless p_only targets one uid.
--   * Every run, dry runs included, writes one row to ascend_guest_cleanup_log.
--   * Only postgres (cron, SQL editor) can execute it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ascend_guest_cleanup_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  dry_run boolean NOT NULL,
  p_days integer NOT NULL,
  p_limit integer NOT NULL,
  p_only uuid,
  candidates integer NOT NULL,
  deleted integer NOT NULL,
  skipped integer NOT NULL,
  user_ids uuid[] NOT NULL DEFAULT '{}',
  usernames text[] NOT NULL DEFAULT '{}',
  skipped_user_ids uuid[] NOT NULL DEFAULT '{}',
  note text
);

ALTER TABLE public.ascend_guest_cleanup_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ascend_guest_cleanup_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ascend_cleanup_abandoned_guests(
  p_days integer DEFAULT 30,
  p_limit integer DEFAULT 100,
  p_dry_run boolean DEFAULT false,
  p_only uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_cutoff timestamptz;
  v_candidates integer := 0;
  v_ids uuid[] := '{}';
  v_usernames text[] := '{}';
  v_skipped uuid[] := '{}';
  v_deleted integer := 0;
  v_note text;
BEGIN
  IF p_days IS NULL OR p_days < 0 THEN
    RAISE EXCEPTION 'p_days must be >= 0';
  END IF;
  IF p_days < 7 AND p_only IS NULL THEN
    RAISE EXCEPTION 'p_days must be >= 7 unless p_only is set';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'p_limit must be >= 1';
  END IF;

  v_cutoff := v_now - make_interval(days => p_days);

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.ascend_guest_cleanup_candidates (
    id uuid PRIMARY KEY,
    last_active timestamptz,
    username text,
    protected boolean
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.ascend_guest_cleanup_candidates;

  -- Lock idle guests so a concurrent run or a sign-in upgrade does not race us.
  INSERT INTO pg_temp.ascend_guest_cleanup_candidates (id, last_active, username, protected)
  SELECT c.id, c.last_active, pr.username,
         EXISTS (
           SELECT 1
           FROM public.improvement_plans ip
           WHERE ip.creator_id = c.id
             AND (
               EXISTS (SELECT 1 FROM public.user_plan_follows f
                       WHERE f.original_plan_id = ip.id AND f.user_id <> c.id)
               OR EXISTS (SELECT 1 FROM public.plan_reflection_notes n
                          WHERE n.original_plan_id = ip.id AND n.owner_id <> c.id)
             )
         )
  FROM (
    SELECT u.id,
           greatest(
             u.created_at,
             u.last_sign_in_at,
             u.updated_at,
             s.last_session,
             -- Capped at now(); least() would turn a missing row into now().
             CASE WHEN ud.updated_at > v_now THEN v_now ELSE ud.updated_at END
           ) AS last_active
    FROM auth.users u
    LEFT JOIN LATERAL (
      SELECT max(greatest(ss.refreshed_at AT TIME ZONE 'UTC', ss.updated_at, ss.created_at)) AS last_session
      FROM auth.sessions ss
      WHERE ss.user_id = u.id
    ) s ON true
    LEFT JOIN public.user_data ud ON ud.user_id = u.id
    WHERE u.is_anonymous = true
      AND coalesce(u.email, '') = ''
      AND coalesce(u.phone, '') = ''
      AND u.is_sso_user = false
      AND u.deleted_at IS NULL
      AND (p_only IS NULL OR u.id = p_only)
    FOR UPDATE OF u SKIP LOCKED
  ) c
  LEFT JOIN public.profiles pr ON pr.id = c.id
  WHERE c.last_active IS NULL OR c.last_active < v_cutoff;

  SELECT count(*)::integer,
         coalesce(array_agg(id ORDER BY last_active NULLS FIRST, id) FILTER (WHERE protected), '{}')
  INTO v_candidates, v_skipped
  FROM pg_temp.ascend_guest_cleanup_candidates;

  SELECT coalesce(array_agg(t.id ORDER BY t.last_active NULLS FIRST, t.id), '{}'),
         coalesce(array_agg(coalesce(t.username, '') ORDER BY t.last_active NULLS FIRST, t.id), '{}')
  INTO v_ids, v_usernames
  FROM (
    SELECT id, last_active, username
    FROM pg_temp.ascend_guest_cleanup_candidates
    WHERE NOT protected
    ORDER BY last_active NULLS FIRST, id
    LIMIT p_limit
  ) t;

  IF p_dry_run THEN
    v_deleted := coalesce(array_length(v_ids, 1), 0);
  ELSE
    DELETE FROM auth.users u
    WHERE u.id = ANY (v_ids)
      AND u.is_anonymous = true;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  IF v_candidates - coalesce(array_length(v_skipped, 1), 0) > p_limit THEN
    v_note := 'more pending';
  END IF;
  IF coalesce(array_length(v_skipped, 1), 0) > 0 THEN
    v_note := concat_ws('; ', v_note, 'skipped guests own plans followed or noted by other users');
  END IF;

  INSERT INTO public.ascend_guest_cleanup_log
    (dry_run, p_days, p_limit, p_only, candidates, deleted, skipped, user_ids, usernames, skipped_user_ids, note)
  VALUES
    (p_dry_run, p_days, p_limit, p_only, v_candidates, v_deleted,
     coalesce(array_length(v_skipped, 1), 0), v_ids, v_usernames, v_skipped, v_note);

  DROP TABLE pg_temp.ascend_guest_cleanup_candidates;

  RETURN v_deleted;
END;
$function$;

ALTER FUNCTION public.ascend_cleanup_abandoned_guests(integer, integer, boolean, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ascend_cleanup_abandoned_guests(integer, integer, boolean, uuid) FROM PUBLIC, anon, authenticated;

-- 21:30 UTC = 02:30 PKT, clear of the :00/:05/:10 hourly jobs.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ascend-guest-cleanup-daily';
SELECT cron.schedule('ascend-guest-cleanup-daily', '30 21 * * *', 'SELECT public.ascend_cleanup_abandoned_guests()');

COMMIT;
