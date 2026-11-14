-- GLB-L7 step 2 of 2 (audit 2026-11-10; first raised 10-19 as L3): signed-out visitors can no
-- longer list members.
--
-- Why: policy "Profiles viewable by all users" (role PUBLIC, USING true) plus anon column SELECT on
-- id, username, avatar, is_profile_public, total_points, created_at, uid, accept_partner_invites,
-- season_id, season_points let anyone holding the public key read the whole member list without
-- signing in. get_profile_by_uid(text) (SECURITY DEFINER) was EXECUTE for PUBLIC/anon, and the
-- 6-digit uid can be walked.
--
-- Who still reads: every app path that reads profiles runs signed in (guests are
-- `authenticated`): leagues (ascend_league_boards), partner lookups by uid/username, member cards,
-- own profile. Signed-in access is unchanged: authenticated keeps its column SELECT, the policy
-- (now TO authenticated) and EXECUTE on get_profile_by_uid. Username sign-in uses the
-- sign-in-username Edge Function (service role), not anon.
--
-- The one signed-out reader is the sign-up form's username check. Old apps (1.2.0) do it with a
-- direct select; after this file that select fails, the app treats the name as "unknown" and lets
-- the sign-up go on, and if the name was really taken authSession.insertInitialProfile gives a
-- suffixed name with a "@name was just taken" notice. Nothing breaks, but the early "taken" hint
-- is lost, so:
-- Order: AFTER step 1 (20261110150100) is applied AND the app that calls
-- ascend_username_available is in PRODUCTION.
--
-- Rollback (exact):
--   BEGIN;
--   ALTER POLICY "Profiles viewable by signed-in users" ON public.profiles RENAME TO "Profiles viewable by all users";
--   ALTER POLICY "Profiles viewable by all users" ON public.profiles TO public;
--   GRANT SELECT (id, username, avatar, is_profile_public, total_points, created_at, uid,
--                 accept_partner_invites, season_id, season_points) ON public.profiles TO anon;
--   GRANT EXECUTE ON FUNCTION public.get_profile_by_uid(text) TO PUBLIC, anon;
--   COMMIT;

BEGIN;

-- Revoking the table privilege also revokes anon's column privileges on every column.
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT (id, username, avatar, is_profile_public, total_points, created_at, uid,
               accept_partner_invites, season_id, season_points) ON public.profiles FROM anon;

ALTER POLICY "Profiles viewable by all users" ON public.profiles TO authenticated;
ALTER POLICY "Profiles viewable by all users" ON public.profiles RENAME TO "Profiles viewable by signed-in users";

REVOKE EXECUTE ON FUNCTION public.get_profile_by_uid(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_by_uid(text) TO authenticated;

COMMIT;

-- Verify (read-only):
--   SELECT attname, attacl FROM pg_attribute WHERE attrelid = 'public.profiles'::regclass AND attacl IS NOT NULL;
--     -- authenticated=r only, no anon
--   SELECT polname, polroles::regrole[] FROM pg_policy WHERE polrelid = 'public.profiles'::regclass AND polcmd = 'r';
--     -- "Profiles viewable by signed-in users" {authenticated}
--   SELECT proacl FROM pg_proc WHERE proname = 'get_profile_by_uid';   -- no PUBLIC (=X), no anon
--   REST as anon: GET /rest/v1/profiles?select=username -> 401/permission denied
