-- Sobriety milestone points from the server (knowledge/server-side-plan.md, Part 2 #2, Option C module 10)
-- The app used to award (and take back) milestone points itself, from a streak start it wrote
-- itself, so a console call or a backdated start could claim any amount. Now (Zakria 2026-10-15):
--   * The database awards the live tracker's milestones from its startDate, on every tracker write
--     and from an hourly job (so a milestone arrives even while the app is closed):
--       1 week = 10 and 90 days = 50 once per season, 1 month = 25 once per streak
--       (SOBRIETY_MILESTONE_POINTS). Ids: recovery_<tracker>_<1w|1m|90d>_<startMs>, plus _s<season>
--       for 1w/90d after season 1. A milestone is dated when it was reached; a season's re-earn of
--       a running streak is dated at the season's start. Milestones reached before
--       2026-10-15 00:00 UTC are not backfilled (RECOVERY_AWARDS_SERVER_SINCE).
--   * When a streak ends (relapse or tracker deleted), this season's awards of every streak that is
--     not the live one are taken back once: recovery_revoke_<awardId>. Earlier seasons and league
--     archives stay as they are (D2). Trackers deleted the old way (one app-written deduction row)
--     are already settled.
--   * The milestone notification is sent by the server when the award is written (D4).
--   * Guard (D1): a new tracker cannot start more than 24 hours before it reaches the server, a
--     streak start cannot move back, and nothing can start in the future.
--   * The app can no longer write recovery points (source recovery_milestone/addiction_recovery,
--     recovery_ ids). Legacy rows stay as they are.
-- The 85-point season cap is not checked: one streak can hold at most 10 + 25 + 50 = 85 in a season,
-- and every other streak's points of the season are taken back.
-- src/lib/recoveryAwards.ts must stay identical to this file.

BEGIN;

-- 1. Guard: a streak start the server can trust.
--    Named *_guard_start so it fires before *_keep_newer and *_stamp (triggers run in name order).
CREATE OR REPLACE FUNCTION public.addiction_trackers_guard_start()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_start timestamptz;
  v_old   timestamptz;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_start := nullif(btrim(NEW.data->>'startDate'), '')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_start := NULL;
  END;
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'sobriety tracker % has no valid startDate', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  IF v_start > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'sobriety tracker % starts in the future (%)', NEW.id, v_start USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_start < now() - interval '24 hours' THEN
      RAISE EXCEPTION 'sobriety tracker % starts too far back (%)', NEW.id, v_start USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    v_old := nullif(btrim(OLD.data->>'startDate'), '')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_old := NULL;
  END;
  IF v_old IS NOT NULL AND v_start < v_old THEN
    RAISE EXCEPTION 'sobriety tracker % start moved back (% before %)', NEW.id, v_start, v_old
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER addiction_trackers_guard_start BEFORE INSERT OR UPDATE ON public.addiction_trackers
  FOR EACH ROW EXECUTE FUNCTION public.addiction_trackers_guard_start();

-- 2. One user's milestone awards and take-backs (computeRecoveryChanges in recoveryAwards.ts).
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
    CROSS JOIN LATERAL regexp_match(pe.id, '^recovery_([A-Za-z0-9]+)_(1w|1m|90d)_([0-9]+)(?:_s[0-9]+)?$') m
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

-- 3. Every tracker write (new tracker, relapse, delete) recomputes its owner.
CREATE OR REPLACE FUNCTION public.addiction_trackers_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.ascend_recompute_recovery_awards(NEW.user_id);
  RETURN NULL;
END;
$function$;

CREATE TRIGGER addiction_trackers_award_points AFTER INSERT OR UPDATE ON public.addiction_trackers
  FOR EACH ROW EXECUTE FUNCTION public.addiction_trackers_award_points();

-- 4. Hourly: milestones reached while nothing was written.
CREATE OR REPLACE FUNCTION public.ascend_run_recovery_awards()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid;
BEGIN
  FOR v_user IN SELECT DISTINCT t.user_id FROM public.addiction_trackers t WHERE t.deleted_at IS NULL LOOP
    PERFORM public.ascend_recompute_recovery_awards(v_user);
  END LOOP;
END;
$function$;

-- 5. Only the server writes habit awards, bad-habit points, workout points, skill points,
--    reading points, journal points, focus points, lesson points, weekly goal and reflection
--    points, sobriety points and missed-habit and missed-workout penalties
--    (20261015220000 plus the recovery lines).
CREATE OR REPLACE FUNCTION public.point_entries_guard_server_owned()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.id LIKE 'habit\_award\_%' OR NEW.id LIKE 'bad\_habit\_%' OR NEW.id LIKE 'habit\_missed\_%'
     OR NEW.id LIKE 'workout\_award\_%' OR NEW.id LIKE 'exercise\_missed\_%' OR NEW.id LIKE 'skill\_award\_%'
     OR NEW.id LIKE 'reading\_award\_%' OR NEW.id LIKE 'reading\_bonus\_%' OR NEW.id LIKE 'journal\_award\_%'
     OR NEW.id LIKE 'focus\_award\_%'
     OR NEW.id LIKE 'lesson\_award\_%'
     OR NEW.id LIKE 'weekly\_goal\_%' OR NEW.id LIKE 'weekly\_review\_%'
     OR NEW.id LIKE 'recovery\_%'
     OR NEW.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                'reading', 'reading_bonus', 'journal', 'focus', 'lesson',
                                'weekly_goal_achieved', 'weekly_review',
                                'recovery_milestone', 'addiction_recovery')
     OR (TG_OP = 'UPDATE' AND (
         OLD.id LIKE 'habit\_award\_%' OR OLD.id LIKE 'bad\_habit\_%' OR OLD.id LIKE 'habit\_missed\_%'
         OR OLD.id LIKE 'workout\_award\_%' OR OLD.id LIKE 'exercise\_missed\_%' OR OLD.id LIKE 'skill\_award\_%'
         OR OLD.id LIKE 'reading\_award\_%' OR OLD.id LIKE 'reading\_bonus\_%' OR OLD.id LIKE 'journal\_award\_%'
         OR OLD.id LIKE 'focus\_award\_%'
         OR OLD.id LIKE 'lesson\_award\_%'
         OR OLD.id LIKE 'weekly\_goal\_%' OR OLD.id LIKE 'weekly\_review\_%'
         OR OLD.id LIKE 'recovery\_%'
         OR OLD.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                    'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                    'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                    'reading', 'reading_bonus', 'journal', 'focus', 'lesson',
                                    'weekly_goal_achieved', 'weekly_review',
                                    'recovery_milestone', 'addiction_recovery')))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.addiction_trackers_guard_start() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_recovery_awards(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.addiction_trackers_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_run_recovery_awards() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_entries_guard_server_owned() FROM PUBLIC, anon, authenticated;

-- 6. First pass now, then every hour at :10.
SELECT public.ascend_run_recovery_awards();
SELECT cron.schedule('ascend-recovery-awards-hourly', '10 * * * *', 'SELECT public.ascend_run_recovery_awards();');

COMMIT;
