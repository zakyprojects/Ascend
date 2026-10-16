-- Username cooldown on the server, part 1 of 2 (knowledge/ASCEND_STATE.md, audit #5)
--
-- The 24-hour username cooldown was enforced only by the app: any member could change their
-- username (and last_username_change_at) with a direct update. ascend_change_username() is now
-- the one way to rename: it checks the format (same rule as isUsernameAvailable, src/lib/auth.ts),
-- that no other member has the name in any letter case, and the 24 hours since the last change
-- on the server clock, then stamps the change. Part 2 (20261016210000, after the app below is in
-- production) stops direct updates from changing either column.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_change_username(p_username text)
 RETURNS timestamptz
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_name     text := btrim(coalesce(p_username, ''));
  v_old      text;
  v_last     timestamptz;
  v_mins     int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You''re not signed in. Sign in and try again.';
  END IF;
  IF length(v_name) < 3 THEN
    RAISE EXCEPTION 'Username must be at least 3 characters';
  END IF;
  IF length(v_name) > 20 THEN
    RAISE EXCEPTION 'Username must be 20 characters or less';
  END IF;
  IF v_name !~ '^[a-zA-Z0-9_-]+$' THEN
    RAISE EXCEPTION 'Username can only contain letters, numbers, underscores, and hyphens';
  END IF;

  SELECT pr.username, pr.last_username_change_at INTO v_old, v_last
  FROM public.profiles pr
  WHERE pr.id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your profile is not ready yet. Try again in a moment.';
  END IF;
  IF v_name = v_old THEN
    RETURN v_last;
  END IF;

  IF v_last IS NOT NULL AND v_last > now() - interval '24 hours' THEN
    v_mins := ceil(extract(epoch FROM v_last + interval '24 hours' - now()) / 60)::int;
    RAISE EXCEPTION 'Username can only be changed once per 24 hours. Next change available in %h %m.',
      v_mins / 60, v_mins % 60;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE lower(pr.username) = lower(v_name) AND pr.id <> v_uid
  ) THEN
    RAISE EXCEPTION 'Username is already taken';
  END IF;

  UPDATE public.profiles
  SET username = v_name, last_username_change_at = now()
  WHERE id = v_uid;
  RETURN now();
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_change_username(text) FROM PUBLIC, anon;
-- Supabase's default privileges also grant new functions to anon directly; signed-out visitors
-- need neither function (guests sign in anonymously and are 'authenticated').
REVOKE ALL ON FUNCTION public.ascend_my_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.ascend_change_username(text) TO authenticated;

COMMIT;
