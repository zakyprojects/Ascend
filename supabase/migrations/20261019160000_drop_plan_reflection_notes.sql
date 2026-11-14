-- Backlog #21 (Zakria approved 2026-10-19): drop plan_reflection_notes.
-- The app stopped writing it in 8bcc6f5 and never read it; its last 3 rows are orphans
-- (their plans are gone). Check-in notes live in each plan's steps JSON (reflectionNotes).
-- 1. ascend_cleanup_abandoned_guests stops reading the table: a guest is protected only when
--    another user copied one of its plans. Everything else is the live definition, unchanged
--    (SECURITY DEFINER, search_path pinned to '', same signature, so no overload to drop).
-- 2. Drop the table's policy and the table (no triggers, nothing references it, not in realtime).
-- Runs BEFORE the studio test: no client (studio, or production b281f44) reads or writes the table.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_cleanup_abandoned_guests(p_days integer DEFAULT 30, p_limit integer DEFAULT 100, p_dry_run boolean DEFAULT false, p_only uuid DEFAULT NULL::uuid)
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
             AND EXISTS (SELECT 1 FROM public.user_plan_follows f
                         WHERE f.original_plan_id = ip.id AND f.user_id <> c.id)
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

REVOKE ALL ON FUNCTION public.ascend_cleanup_abandoned_guests(integer, integer, boolean, uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can manage their own reflection notes" ON public.plan_reflection_notes;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'plan_reflection_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.plan_reflection_notes;
  END IF;
END
$$;

DROP TABLE public.plan_reflection_notes;

COMMIT;
