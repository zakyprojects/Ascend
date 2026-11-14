-- GLB-L7 step 1 of 2 (audit 2026-11-10): a username check that does not need to read profiles.
--
-- Why: the sign-up form checks a name while the visitor is signed out (anon), by selecting
-- profiles directly (src/lib/auth.ts isUsernameAvailable). That is the only signed-out reason anon
-- can still read profiles' public columns, which also lets anyone with the public key list every
-- member. This function answers only "is this name free?", so step 2
-- (20261110150200_profiles_no_anon_read.sql) can take anon's read away.
--
-- Same rule as the unique index profiles_username_lower_key: case-insensitive, surrounding spaces
-- ignored. The caller's own profile never counts as taken (a rename to a new case of one's own
-- name); auth.uid() is NULL when signed out, so then every profile counts.
-- Format rules stay in the app (usernameRules.ts); the database still refuses a taken name on save.
--
-- Order: BEFORE the app change that calls it (needs Auth-owned src/lib/auth.ts; see the report).
-- Purely additive: nothing existing changes, old 1.2.0 clients are unaffected.
-- Rollback: DROP FUNCTION public.ascend_username_available(text);

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(p.username) = lower(btrim(p_username))
      AND p.id IS DISTINCT FROM auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.ascend_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ascend_username_available(text) TO anon, authenticated;

COMMIT;

-- Verify (read-only):
--   SELECT proacl, prosecdef, proconfig FROM pg_proc WHERE proname = 'ascend_username_available';
--     -- anon=X, authenticated=X, no PUBLIC; t; {search_path=""}
--   REST as anon: POST /rest/v1/rpc/ascend_username_available {"p_username":"<existing name, other case>"} -> false
