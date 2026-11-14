-- Sobriety milestones: take back a relapsed or deleted streak's points for every tracker id.
-- Since the trusted clock (b1f8952, 2026-10-15) uid() builds ids from a fractional millisecond
-- count, so new tracker ids contain a dot (e.g. mvcrlka0.i7adn1g). The take-back step matched
-- award ids with [A-Za-z0-9]+ and never saw those trackers' awards: a relapse or delete kept the
-- points, and the app showed "no milestone points this season" for such a tracker.
-- The tracker part now matches any id without an underscore (ids never contain one).
-- Nothing else changes: only this season's awards are taken back (dated now, so no earlier day
-- or earlier season moves). Live 2026-10-19: no award of a dotted tracker exists yet, so this
-- takes back nothing on its first run.
-- src/lib/recoveryAwards.ts (AWARD_ID) changes together with this file.

BEGIN;

-- One user's milestone awards and take-backs (computeRecoveryChanges in recoveryAwards.ts).
CREATE OR REPLACE FUNCTION public.ascend_recompute_recovery_awards(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_now      timestamptz := now();
  v_now_iso  text        := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_season   integer     := public.ascend_lesson_season(now());
  v_ss       timestamptz := public.ascend_season_start(now());
  v_since    timestamptz := timestamptz '2026-10-15 00:00:00+00'; -- RECOVERY_AWARDS_SERVER_SINCE
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

  -- The live tracker the app shows: the newest by created_at (syncedCollections addictionTracker).
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
      v_reached := to_timestamp(v_stms / 1000.0) + make_interval(hours => v_m.hours);
      CONTINUE WHEN v_reached > v_now;
      IF v_m.key = '1m' THEN
        CONTINUE WHEN v_reached < v_ss;
        v_at := v_reached;
        v_id := 'recovery_' || v_tid || '_1m_' || v_stms;
      ELSE
        v_at := greatest(v_reached, v_ss);
        v_id := 'recovery_' || v_tid || '_' || v_m.key || '_' || v_stms
                || CASE WHEN v_season > 1 THEN '_s' || v_season ELSE '' END;
      END IF;
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
      ON CONFLICT (user_id, id) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;

      -- A notification that cannot be sent never blocks the award (or the tracker write).
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

  -- This season's awards of every streak that is not the live one are taken back once.
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
$function$;

REVOKE ALL ON FUNCTION public.ascend_recompute_recovery_awards(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
