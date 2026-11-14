-- League scaling P1: the Leagues boards from one RPC, built on the server.
--
-- Today a full league refresh downloads every member profile (ascend_member_profiles(), stats
-- and past seasons included) plus everyone's points for 26 periods (ascend_league_points: this
-- week and month and the 12 before each), and the server runs ascend_period_points once per
-- period. Only this week and this month are ever read. ascend_league_boards returns just that:
--   full  ({}):            members + this week's, this month's and this season's points
--   slim  (p_slim = true): this week's and this month's points only (the 60 s live poll)
--
-- Points are identical to today's by construction:
--   weekly / monthly: ascend_period_points over exactly the window the app sends today
--     ([greatest(week or month start, season start), true week or month end), exclusive end),
--     so the same running floor and the same (user_id, awarded_at, id) tie-break. A season start
--     inside the week or month clamps the start the same way as the app's clampToSeasonStart; the
--     part before it (@S<n>) is archive-only and never on a live board.
--   season: profiles.season_points (maintained by the point_entries triggers), as today.
-- Stats and season history are not in this list: the profile dialog fetches them on tap with
-- ascend_member_profiles(p_username), which applies the same privacy rule as before.
--
-- Additive: ascend_member_profiles() and ascend_league_points stay for one release (old clients).
-- Rollback: DROP FUNCTION public.ascend_league_boards(text[], boolean);

-- No earlier overload exists live; drop the one an earlier plan sketched, should it exist anywhere.
DROP FUNCTION IF EXISTS public.ascend_league_boards(text[]);

CREATE OR REPLACE FUNCTION public.ascend_league_boards(
  p_types text[] DEFAULT ARRAY['weekly', 'monthly', 'ninetyDay'],
  p_slim boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_season int := public.ascend_season_number(v_now);
  v_season_start timestamptz := public.ascend_season_begin(v_season);
  v_week timestamp := date_trunc('week', v_now AT TIME ZONE 'UTC');
  v_month timestamp := date_trunc('month', v_now AT TIME ZONE 'UTC');
  v_result jsonb := '{}'::jsonb;
  r record;
BEGIN
  -- Members only, as ascend_member_profiles.
  IF auth.uid() IS NULL THEN
    RETURN v_result;
  END IF;

  FOR r IN
    SELECT k.type, k.period_id,
           greatest(k.s AT TIME ZONE 'UTC', v_season_start) AS score_start,
           k.e AT TIME ZONE 'UTC' AS period_end
    FROM (VALUES
      ('weekly', 'W:' || to_char(v_week, 'IYYY') || '-W' || to_char(v_week, 'IW'), v_week, v_week + interval '7 days'),
      ('monthly', 'M:' || to_char(v_month, 'YYYY-MM'), v_month, v_month + interval '1 month')
    ) AS k(type, period_id, s, e)
    WHERE k.type = ANY (p_types)
  LOOP
    v_result := v_result || jsonb_build_object(r.type,
      jsonb_build_object(
        'period_id', r.period_id,
        -- [member id, points] for members with points (ascend_period_points drops 0), best first.
        'points', coalesce((
          SELECT jsonb_agg(jsonb_build_array(p.id, pp.points)
                           ORDER BY pp.points DESC, lower(p.username) COLLATE "C", p.id::text COLLATE "C")
          FROM public.ascend_period_points(r.score_start, r.period_end, false) pp
          JOIN public.profiles p ON p.id = pp.user_id
        ), '[]'::jsonb)
      ));
  END LOOP;

  IF p_slim THEN
    RETURN v_result;
  END IF;

  IF 'ninetyDay' = ANY (p_types) THEN
    v_result := v_result || jsonb_build_object('ninetyDay', jsonb_build_object(
      'period_id', 'S:' || v_season,
      'points', coalesce((
        SELECT jsonb_agg(jsonb_build_array(p.id, p.season_points)
                         ORDER BY p.season_points DESC, lower(p.username) COLLATE "C", p.id::text COLLATE "C")
        FROM public.profiles p
        WHERE coalesce(p.season_points, 0) <> 0
      ), '[]'::jsonb)
    ));
  END IF;

  -- Every member is on every board (members without points are listed last, not counted).
  v_result := v_result || jsonb_build_object('members', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id,
             'uid', p.uid::text,
             'username', p.username,
             'avatar', p.avatar,
             'is_profile_public', p.is_profile_public,
             'accept_partner_invites', p.accept_partner_invites)
           ORDER BY lower(p.username) COLLATE "C", p.id::text COLLATE "C")
    FROM public.profiles p
  ), '[]'::jsonb));

  RETURN v_result;
END;
$function$;

-- New functions get EXECUTE for PUBLIC and (default privileges) anon: members only.
REVOKE EXECUTE ON FUNCTION public.ascend_league_boards(text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ascend_league_boards(text[], boolean) TO authenticated, service_role;
