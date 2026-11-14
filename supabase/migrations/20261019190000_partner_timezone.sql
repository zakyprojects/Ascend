-- Partners: each partner's effective timezone, readable only by the people they are partnered with.
-- A shared challenge's done dates are written on the writer's own local day (profiles.timezone, via
-- shared_challenges_guard), but the app judged a partner's "done today" against the VIEWER's day,
-- so across timezones it showed a partner as "not yet" (and offered Nudge) after they had finished.
-- profiles.timezone is not readable by the app's roles (20261016190000), so this function returns
-- just the timezone of the caller's own partners: the same value the server uses for them
-- (ascend_user_timezone: validated, Asia/Karachi fallback). Nothing else, nobody else.
-- The app reads it on the Partners page and falls back to the viewer's day while this function is
-- missing, so it is safe to run BEFORE the studio test (and before or after the production push).

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_partner_timezones()
 RETURNS TABLE (user_id uuid, timezone text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT DISTINCT other.id, public.ascend_user_timezone(other.id)
  FROM public.partnerships ps
  CROSS JOIN LATERAL (
    SELECT CASE WHEN ps.user1_id = auth.uid() THEN ps.user2_id ELSE ps.user1_id END AS id
  ) other
  WHERE auth.uid() IS NOT NULL
    AND (ps.user1_id = auth.uid() OR ps.user2_id = auth.uid())
    AND other.id IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.ascend_partner_timezones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ascend_partner_timezones() TO authenticated;

COMMIT;
