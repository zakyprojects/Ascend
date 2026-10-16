-- Member profiles, part 2 of 2 (apply AFTER the app that reads other members through
-- ascend_member_profiles is in production; older apps select these columns directly and their
-- league and partner views would fail to load).
-- Members and visitors can no longer read stats or season_history directly, nor the retired
-- active_habits / points_history copies (both are written empty). ascend_member_profiles
-- returns stats and season_history only to viewers allowed to see them.

BEGIN;

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, uid, username, avatar, is_profile_public, accept_partner_invites, created_at,
  total_points, season_points, season_id, user1_allow_stats, user2_allow_stats
) ON public.profiles TO anon, authenticated;

COMMIT;
