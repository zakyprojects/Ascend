-- Live league table: members with 0 points this period are listed when they were active in the
-- last 7 days (signed in, refreshed a session, or earned a non-recovery point), so a member appears
-- as soon as they sign in, and they are ordered by their first activity in the period (first come
-- first) instead of A-Z. ascend_league_boards' member list gains 'active' (boolean) and
-- 'first_active' ({weekly, monthly, ninetyDay}: epoch ms or null); nothing else changes.
-- Additive: old clients ignore the new keys.
-- Activity rule: public.ascend_user_active_between (20261030090000_recovery_awards_active_week.sql),
-- the same gate recovery milestones use. First activity uses the same signals; a sign-out deletes
-- that session's refresh tokens, so it can read later than the real first visit (order only).
-- Helpers are called from this SECURITY DEFINER function, so they stay revoked from anon/authenticated.
-- Rollback: re-run 20261024200000_league_boards_rpc.sql, then DROP FUNCTION
--   public.ascend_user_first_active_since(uuid, timestamptz), public.ascend_epoch_ms(timestamptz).

CREATE OR REPLACE FUNCTION public.ascend_user_first_active_since(p_user uuid, p_from timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT least(
    (SELECT min(t.created_at) FROM auth.refresh_tokens t
     WHERE t.user_id = p_user::text AND t.created_at >= p_from),
    (SELECT u.last_sign_in_at FROM auth.users u
     WHERE u.id = p_user AND u.last_sign_in_at >= p_from),
    (SELECT min(e.awarded_at) FROM public.point_entries e
     WHERE e.user_id = p_user AND e.deleted_at IS NULL AND e.awarded_at >= p_from
       AND e.data->>'amount' ~ '^[0-9]+(\.[0-9]+)?$' AND (e.data->>'amount')::numeric > 0
       AND coalesce(e.data->>'source', '') NOT IN ('recovery_milestone', 'addiction_recovery')));
$function$;

REVOKE ALL ON FUNCTION public.ascend_user_first_active_since(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ascend_epoch_ms(p_at timestamptz)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT (extract(epoch FROM p_at) * 1000)::bigint;
$function$;

REVOKE ALL ON FUNCTION public.ascend_epoch_ms(timestamptz) FROM PUBLIC, anon, authenticated;

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
             'active', a.active,
             -- Active members' first activity in each board's period (epoch ms, null if none yet):
             -- members with 0 points are listed in that order, first come first.
             'first_active', CASE WHEN a.active THEN jsonb_build_object(
               'weekly', public.ascend_epoch_ms(public.ascend_user_first_active_since(p.id, greatest(v_week AT TIME ZONE 'UTC', v_season_start))),
               'monthly', public.ascend_epoch_ms(public.ascend_user_first_active_since(p.id, greatest(v_month AT TIME ZONE 'UTC', v_season_start))),
               'ninetyDay', public.ascend_epoch_ms(public.ascend_user_first_active_since(p.id, v_season_start))) END)
           ORDER BY lower(p.username) COLLATE "C", p.id::text COLLATE "C")
    FROM public.profiles p
    CROSS JOIN LATERAL (
      SELECT public.ascend_user_active_between(p.id, v_now - interval '7 days', v_now) AS active
    ) a
  ), '[]'::jsonb));

  RETURN v_result;
END;
$function$;
