-- Profile privacy, part 2 of 2 (apply AFTER the app that reads its own private columns through
-- ascend_my_profile is in production; older apps select them directly and would fail to load).
-- Members and visitors may read only the public columns of profiles. Own private columns come
-- from ascend_my_profile(); server functions are SECURITY DEFINER and are unaffected.
-- INSERT/UPDATE privileges and the row policies stay as they are.

BEGIN;

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, uid, username, avatar, is_profile_public, accept_partner_invites, created_at,
  total_points, season_points, season_id, season_history, points_history,
  stats, active_habits, user1_allow_stats, user2_allow_stats
) ON public.profiles TO anon, authenticated;

COMMIT;
