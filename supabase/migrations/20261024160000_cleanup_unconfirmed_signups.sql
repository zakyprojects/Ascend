-- Deletes email signups whose email was never confirmed, so their email and username are free again.
-- Same shape as ascend_cleanup_abandoned_guests; counts-only log in ascend_guest_cleanup_log.
CREATE OR REPLACE FUNCTION public.ascend_cleanup_unconfirmed_signups(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 100,
  p_dry_run boolean DEFAULT false,
  p_only uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cutoff timestamptz;
  v_ids uuid[] := '{}';
  v_candidates integer := 0;
  v_deleted integer := 0;
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

  v_cutoff := now() - make_interval(days => p_days);

  -- Never signed in, never confirmed, email-only, and quiet since signup or the last resend.
  WITH c AS (
    SELECT u.id, greatest(u.created_at, u.confirmation_sent_at) AS last_sent
    FROM auth.users u
    WHERE u.is_anonymous = false
      AND u.is_sso_user = false
      AND u.deleted_at IS NULL
      AND u.email_confirmed_at IS NULL
      AND u.phone_confirmed_at IS NULL
      AND u.last_sign_in_at IS NULL
      AND greatest(u.created_at, u.confirmation_sent_at) < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider <> 'email')
      AND (p_only IS NULL OR u.id = p_only)
    FOR UPDATE OF u SKIP LOCKED
  )
  SELECT count(*)::integer,
         coalesce((array_agg(id ORDER BY last_sent, id))[1:p_limit], '{}')
  INTO v_candidates, v_ids
  FROM c;

  IF p_dry_run THEN
    v_deleted := coalesce(array_length(v_ids, 1), 0);
  ELSE
    -- Re-checked here: a link opened right now keeps the account.
    DELETE FROM auth.users u
    WHERE u.id = ANY (v_ids)
      AND u.email_confirmed_at IS NULL
      AND u.last_sign_in_at IS NULL
      AND u.is_anonymous = false;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  INSERT INTO public.ascend_guest_cleanup_log
    (dry_run, p_days, p_limit, p_only, candidates, deleted, skipped, note)
  VALUES
    (p_dry_run, p_days, p_limit, p_only, v_candidates, v_deleted, 0,
     concat_ws('; ', 'unconfirmed signups', CASE WHEN v_candidates > p_limit THEN 'more pending' END));

  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_cleanup_unconfirmed_signups(integer, integer, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_cleanup_unconfirmed_signups(integer, integer, boolean, uuid) TO service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ascend-unconfirmed-cleanup-daily';
SELECT cron.schedule('ascend-unconfirmed-cleanup-daily', '35 21 * * *', 'SELECT public.ascend_cleanup_unconfirmed_signups()');
