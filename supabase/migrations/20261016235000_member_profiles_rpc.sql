-- Member profiles, part 1 of 2 (safe with the current production app).
-- 1. ascend_member_profiles(p_username): what one member may see of other members' profiles.
--    Public columns for everyone; stats and season_history only when the viewer may see details,
--    the same rule the profile dialog uses (CompetitorProfileModal canViewDetailed): the viewer
--    themself, an accountability partner, or both viewer and member keep a public profile.
--    p_username null = every member (leagues), otherwise the one member with that name (any case).
-- 2. Usernames are unique regardless of case for every write path (rename RPC, sign-up, a guest
--    saving progress); the app's own availability check is no longer the only guard.
-- Part 2 (20261017000000) revokes direct SELECT on stats/season_history once the app reads
-- profiles through this function.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_member_profiles(p_username text DEFAULT NULL)
 RETURNS TABLE (
   id uuid, uid text, username text, avatar text, total_points integer, season_points numeric,
   season_id integer, stats jsonb, is_profile_public boolean, season_history jsonb,
   created_at timestamptz, accept_partner_invites boolean
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_viewer uuid := auth.uid();
  v_viewer_public boolean;
BEGIN
  IF v_viewer IS NULL THEN
    RETURN;
  END IF;
  SELECT coalesce(pr.is_profile_public, true) INTO v_viewer_public
  FROM public.profiles pr WHERE pr.id = v_viewer;

  RETURN QUERY
  SELECT
    p.id, p.uid::text, p.username, p.avatar, p.total_points, p.season_points,
    p.season_id,
    CASE WHEN d.allowed THEN p.stats END,
    p.is_profile_public,
    CASE WHEN d.allowed THEN p.season_history END,
    p.created_at, p.accept_partner_invites
  FROM public.profiles p
  CROSS JOIN LATERAL (
    SELECT (
      p.id = v_viewer
      OR (coalesce(v_viewer_public, true) AND coalesce(p.is_profile_public, true))
      OR EXISTS (
        SELECT 1 FROM public.partnerships ps
        WHERE (ps.user1_id = v_viewer AND ps.user2_id = p.id)
           OR (ps.user2_id = v_viewer AND ps.user1_id = p.id)
      )
    ) AS allowed
  ) d
  WHERE p_username IS NULL OR lower(p.username) = lower(btrim(p_username));
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_member_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ascend_member_profiles(text) TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key ON public.profiles (lower(username));

COMMIT;
