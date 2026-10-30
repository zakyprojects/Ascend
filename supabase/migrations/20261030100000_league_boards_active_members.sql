-- Live league table: show members with 0 points this period when they were active in the last
-- 7 days (signed in, refreshed a session, or earned a non-recovery point), so a member appears as
-- soon as they sign in. ascend_league_boards' member list gains 'active' (boolean); nothing else
-- changes. Additive: old clients ignore the new key.
-- Activity rule: public.ascend_user_active_between (20261030090000_recovery_awards_active_week.sql),
-- the same gate recovery milestones use. Called from this SECURITY DEFINER function, so it stays
-- revoked from anon/authenticated.
-- Rollback: re-run 20261024200000_league_boards_rpc.sql.

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

  -- Every member, with whether they were active in the last 7 days (the live table shows members
  -- with points plus active members with 0; only members with points are ranked and counted).
  v_result := v_result || jsonb_build_object('members', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id,
             'uid', p.uid::text,
             'username', p.username,
             'avatar', p.avatar,
             'is_profile_public', p.is_profile_public,
             'accept_partner_invites', p.accept_partner_invites,
             'active', public.ascend_user_active_between(p.id, v_now - interval '7 days', v_now))
           ORDER BY lower(p.username) COLLATE "C", p.id::text COLLATE "C")
    FROM public.profiles p
  ), '[]'::jsonb));

  RETURN v_result;
END;
$function$;
