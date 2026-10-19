-- Security B1: account deletion leaves nothing behind and needs the password
-- (knowledge/mode-a-security-delete-account-2026-10-19.md; Zakria decisions 2026-10-19 21:41)
--
-- 1. delete_own_account is now tracked here (it was created outside the migrations; the body is
--    the live one plus step 1). A member account must have entered its password in the last
--    5 minutes: the Delete account dialog checks the password with verifyAccountPassword, a
--    one-off password sign-in that stamps auth.users.last_sign_in_at (refreshing a session does
--    not; checked live 2026-10-19). Guests have no password and their Log out deletes the guest
--    account through this function, so they are exempt.
-- 2. ascend_scrub_deleted_user, BEFORE DELETE on auth.users, so it covers every way an account
--    goes (this function, the abandoned-guest job, the dashboard): a deleted member must not
--    appear anywhere.
--    - Other members' league archives: their entry is removed from data.competitors; each
--      owner's own stored rank and points stay. The row's server_updated_at moves (sync stamp
--      trigger), so devices pull the new list; updated_at stays, so the keep-newer guard lets it
--      through.
--    - Notifications they caused for others (actor_id): deleted. The foreign key would only set
--      actor_id to null and leave their name, avatar and text.
--    It runs before the row goes, while actor_id still points at it.
-- 3. ascend_cleanup_abandoned_guests logs counts only (no deleted ids or usernames).
-- Leftovers from accounts deleted earlier: 20261019220600_deleted_user_leftovers.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_own_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_anonymous boolean;
  v_last_sign_in timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- 1. A member re-enters the password first (Security B1).
  select u.is_anonymous, u.last_sign_in_at into v_anonymous, v_last_sign_in
  from auth.users u
  where u.id = v_uid;

  if not coalesce(v_anonymous, false)
     and (v_last_sign_in is null or v_last_sign_in < now() - interval '5 minutes') then
    raise exception 'Enter your password again to delete your account.' using errcode = '28000';
  end if;

  delete from auth.users where id = v_uid;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.ascend_scrub_deleted_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id text := OLD.id::text;
BEGIN
  UPDATE public.league_archives la
  SET data = jsonb_set(la.data, '{competitors}', coalesce((
        SELECT jsonb_agg(e.c ORDER BY e.o)
        FROM jsonb_array_elements(la.data->'competitors') WITH ORDINALITY AS e(c, o)
        WHERE e.c->>'id' IS DISTINCT FROM v_id
      ), '[]'::jsonb))
  WHERE la.user_id <> OLD.id
    AND la.data->'competitors' @> jsonb_build_array(jsonb_build_object('id', v_id));

  DELETE FROM public.notifications n
  WHERE n.actor_id = OLD.id
    AND n.recipient_id <> OLD.id;

  RETURN OLD;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ascend_scrub_deleted_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS auth_users_scrub_deleted_user ON auth.users;
CREATE TRIGGER auth_users_scrub_deleted_user
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ascend_scrub_deleted_user();

CREATE OR REPLACE FUNCTION public.ascend_cleanup_abandoned_guests(p_days integer DEFAULT 30, p_limit integer DEFAULT 100, p_dry_run boolean DEFAULT false, p_only uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_cutoff timestamptz;
  v_candidates integer := 0;
  v_ids uuid[] := '{}';
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
    protected boolean
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.ascend_guest_cleanup_candidates;

  INSERT INTO pg_temp.ascend_guest_cleanup_candidates (id, last_active, protected)
  SELECT c.id, c.last_active,
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
  WHERE c.last_active IS NULL OR c.last_active < v_cutoff;

  SELECT count(*)::integer,
         coalesce(array_agg(id ORDER BY last_active NULLS FIRST, id) FILTER (WHERE protected), '{}')
  INTO v_candidates, v_skipped
  FROM pg_temp.ascend_guest_cleanup_candidates;

  SELECT coalesce(array_agg(t.id ORDER BY t.last_active NULLS FIRST, t.id), '{}')
  INTO v_ids
  FROM (
    SELECT id, last_active
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

  -- Counts only: a deleted guest leaves no id or name behind (Security B1). user_ids and
  -- usernames keep their '{}' defaults; skipped_user_ids are guests who still exist.
  INSERT INTO public.ascend_guest_cleanup_log
    (dry_run, p_days, p_limit, p_only, candidates, deleted, skipped, skipped_user_ids, note)
  VALUES
    (p_dry_run, p_days, p_limit, p_only, v_candidates, v_deleted,
     coalesce(array_length(v_skipped, 1), 0), v_skipped, v_note);

  DROP TABLE pg_temp.ascend_guest_cleanup_candidates;

  RETURN v_deleted;
END;
$function$;

COMMIT;
