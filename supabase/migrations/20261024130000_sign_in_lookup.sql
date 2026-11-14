-- Faster username sign-in (S1). The sign-in-username Edge Function used three calls before the
-- password check (ascend_sign_in_blocked, a profiles lookup, auth.admin.getUserById), each a round
-- trip to the database. This one call answers all three: whether the username or IP is braked, and
-- the account's email for a username (null for no such user, a guest, or no email).
--
-- Server only: SECURITY DEFINER (reads auth.users), empty search_path, executable by service_role
-- alone (the Edge Function's admin client). The email never leaves the function's server side.
-- Run BEFORE redeploying sign-in-username (the new function code calls this).

CREATE OR REPLACE FUNCTION public.ascend_sign_in_lookup(p_username text, p_ip text)
RETURNS TABLE (blocked boolean, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.ascend_sign_in_blocked(p_username, p_ip) THEN
    RETURN QUERY SELECT true, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT false, (
    SELECT u.email::text
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(p.username) = lower(p_username)
      AND NOT coalesce(u.is_anonymous, false)
      AND coalesce(u.email, '') <> ''
    LIMIT 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ascend_sign_in_lookup(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_sign_in_lookup(text, text) TO service_role;

-- Verify (read-only):
--   SELECT has_function_privilege('anon', 'public.ascend_sign_in_lookup(text,text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.ascend_sign_in_lookup(text,text)', 'EXECUTE'); -- false, false
