-- Recovery milestones only for active streaks, and the season re-earn after a real week.
--
-- Found 2026-10-30 (Season 2 start): streaks run on their own (no relapse logged = clean), so an
-- account untouched since 2026-08-02 earned "1 Week Clean" at 00:00 and would have earned
-- "90 Days Clean" (+50) on 2026-10-31. Every streak carried over from Season 1 also re-earned
-- 1 week at the season's first second, for days already paid in Season 1.
--
-- New rules (Zakria, 2026-10-30):
--   1 week:  once per season, reached 7 days after max(streak start, season start).
--   1 month: once per streak (unchanged).
--   90 days: once per streak (was once per season), only when reached in this season.
--   Every milestone needs activity in the 7 days before it is reached: a positive point that is
--   not a recovery award, or a session sign-in/refresh (the app open).
-- The take-back loop is unchanged. Mirror: src/lib/recoveryAwards.ts.
--
-- Cleanup: the six 1w Season 2 awards given 2026-10-30 are voided (soft delete, metadata.voided),
-- so clients drop them on their next pull. A still-running, active streak earns that same id
-- again 7 days into the season; the insert revives the voided row.
-- Rollback: work/snapshots/recovery-awards-before-2026-10-30.sql (function) and
-- work/snapshots/recovery-s2-rows-before-2026-10-30.json (rows).

CREATE OR REPLACE FUNCTION public.ascend_user_active_between(p_user uuid, p_from timestamptz, p_to timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
           SELECT 1 FROM public.point_entries e
           WHERE e.user_id = p_user AND e.deleted_at IS NULL
             AND e.awarded_at >= p_from AND e.awarded_at <= p_to
             AND e.data->>'amount' ~ '^[0-9]+(\.[0-9]+)?$' AND (e.data->>'amount')::numeric > 0
             AND coalesce(e.data->>'source', '') NOT IN ('recovery_milestone', 'addiction_recovery'))
      OR EXISTS (
           SELECT 1 FROM auth.refresh_tokens t
           WHERE t.user_id = p_user::text AND t.created_at >= p_from AND t.created_at <= p_to)
      OR EXISTS (
           SELECT 1 FROM auth.users u
           WHERE u.id = p_user AND u.last_sign_in_at >= p_from AND u.last_sign_in_at <= p_to);
$function$;

REVOKE ALL ON FUNCTION public.ascend_user_active_between(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ascend_recompute_recovery_awards(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now      timestamptz := now();
  v_now_iso  text        := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_season   integer     := public.ascend_lesson_season(now());
  v_ss       timestamptz := public.ascend_season_start(now());
  v_since    timestamptz := timestamptz '2026-10-15 00:00:00+00';
  v_tid      text;
  v_data     jsonb;
  v_start    timestamptz;
  v_stms     bigint;
  v_m        record;
  v_reached  timestamptz;
  v_at       timestamptz;
  v_id       text;
  v_inserted integer;
  v_aw       record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('recovery_awards:' || p_user::text));

  SELECT t.id, t.data INTO v_tid, v_data
  FROM public.addiction_trackers t
  WHERE t.user_id = p_user AND t.deleted_at IS NULL
  ORDER BY t.created_at DESC, t.id DESC
  LIMIT 1;

  IF v_tid IS NOT NULL THEN
    BEGIN
      v_start := nullif(btrim(v_data->>'startDate'), '')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_start := NULL;
    END;
  END IF;

  IF v_start IS NOT NULL THEN
    v_stms := floor(extract(epoch FROM v_start) * 1000)::bigint;

    FOR v_m IN
      SELECT * FROM (VALUES
        ('1w',  168,  10, 'Sobriety Milestone: 1 Week Clean! 🏅',   '1 Week Clean'),
        ('1m',  720,  25, 'Sobriety Milestone: 1 Month Clean! 🏆',  '1 Month Clean'),
        ('90d', 2160, 50, 'Sobriety Milestone: 90 Days Clean! 👑', '90 Days Clean')
      ) AS m(key, hours, points, reason, label)
    LOOP
      IF v_m.key = '1w' THEN
        -- Once per season, from 7 clean days inside the season: a streak carried over from an
        -- earlier season re-earns it 7 days after the season starts, not at its first second.
        v_reached := greatest(to_timestamp(v_stms / 1000.0), v_ss) + make_interval(hours => v_m.hours);
        v_id := 'recovery_' || v_tid || '_1w_' || v_stms
                || CASE WHEN v_season > 1 THEN '_s' || v_season ELSE '' END;
      ELSE
        -- 1 month and 90 days: once per streak, only when reached in this season.
        v_reached := to_timestamp(v_stms / 1000.0) + make_interval(hours => v_m.hours);
        CONTINUE WHEN v_reached < v_ss;
        v_id := 'recovery_' || v_tid || '_' || v_m.key || '_' || v_stms;
      END IF;
      CONTINUE WHEN v_reached > v_now;
      v_at := v_reached;
      -- Only for people who use the app: active at least once in the 7 days before the milestone.
      CONTINUE WHEN NOT public.ascend_user_active_between(p_user, v_reached - interval '7 days', v_reached);
      CONTINUE WHEN v_at < v_since;

      INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
      VALUES (p_user, v_id, jsonb_build_object(
        'id', v_id,
        'amount', v_m.points,
        'reason', v_m.reason,
        'source', 'recovery_milestone',
        'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'metadata', jsonb_build_object('trackerId', v_tid, 'milestone', v_m.key, 'seasonNumber', v_season,
                                       'streakStart', to_char(to_timestamp(v_stms / 1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      ), now(), now())
      -- An award voided on 2026-10-30 (metadata.voided) comes back when it is earned again.
      ON CONFLICT (user_id, id) DO UPDATE
        SET data = EXCLUDED.data, deleted_at = NULL, updated_at = now()
        WHERE public.point_entries.deleted_at IS NOT NULL
          AND public.point_entries.data->'metadata'->>'voided' = 'true';
      GET DIAGNOSTICS v_inserted = ROW_COUNT;

      IF v_inserted > 0 THEN
        BEGIN
        PERFORM public.create_notification_atomic(
          p_recipient_id => p_user,
          p_type => 'addiction_milestone',
          p_title => 'Sobriety Milestone Reached! 🎉',
          p_message => 'Congratulations! You unlocked milestone(s): ' || v_m.label || ' for '
                       || coalesce(nullif(btrim(v_data->>'title'), ''), 'Sobriety') || '.',
          p_payload => jsonb_build_object('substance', coalesce(nullif(btrim(v_data->>'title'), ''), 'Sobriety'),
                                          'milestones', jsonb_build_array(v_m.label),
                                          'dedupKey', 'sobriety_' || v_id)
        );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END LOOP;
  END IF;

  FOR v_aw IN
    SELECT pe.id, (pe.data->>'amount')::int AS amount, m[1] AS tid, m[2] AS key, m[3] AS stms
    FROM public.point_entries pe
    CROSS JOIN LATERAL regexp_match(pe.id, '^recovery_([^_]+)_(1w|1m|90d)_([0-9]+)(?:_s[0-9]+)?$') m
    WHERE pe.user_id = p_user
      AND pe.deleted_at IS NULL
      AND m IS NOT NULL
      AND pe.data->>'amount' ~ '^[0-9]+$'
      AND (pe.data->>'amount')::int > 0
      AND pe.data->>'timestamp' ~ '^\d{4}-\d{2}-\d{2}T'
      AND (pe.data->>'timestamp')::timestamptz >= v_ss
  LOOP
    CONTINUE WHEN v_start IS NOT NULL AND v_aw.tid = v_tid AND v_aw.stms = v_stms::text;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.point_entries r WHERE r.user_id = p_user AND r.id = 'recovery_revoke_' || v_aw.id
    );
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.point_entries d
      WHERE d.user_id = p_user AND d.deleted_at IS NULL
        AND d.data->>'source' = 'addiction_recovery'
        AND d.id NOT LIKE 'recovery\_revoke\_%'
        AND d.data->'metadata'->>'trackerId' = v_aw.tid
    );

    INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
    VALUES (p_user, 'recovery_revoke_' || v_aw.id, jsonb_build_object(
      'id', 'recovery_revoke_' || v_aw.id,
      'amount', -v_aw.amount,
      'reason', 'Sobriety milestone taken back: '
                || CASE v_aw.key WHEN '1w' THEN '1 Week Clean' WHEN '1m' THEN '1 Month Clean' ELSE '90 Days Clean' END,
      'source', 'addiction_recovery',
      'timestamp', v_now_iso,
      'metadata', jsonb_build_object('trackerId', v_aw.tid, 'milestone', v_aw.key, 'seasonNumber', v_season,
                                     'revokedAwardId', v_aw.id)
    ), now(), now())
    ON CONFLICT (user_id, id) DO NOTHING;
  END LOOP;
END;
$function$
;

REVOKE ALL ON FUNCTION public.ascend_recompute_recovery_awards(uuid) FROM PUBLIC, anon, authenticated;

UPDATE public.point_entries
   SET deleted_at = now(),
       updated_at = now(),
       data = jsonb_set(data, '{metadata,voided}', 'true'::jsonb, true)
 WHERE id ~ '^recovery_[^_]+_1w_[0-9]+_s2$'
   AND deleted_at IS NULL
   AND awarded_at >= timestamptz '2026-10-30 00:00:00+00'
   AND awarded_at <  timestamptz '2026-10-30 01:00:00+00';
