-- Penalty escalation fixes (2026-10-18). Mode A: knowledge/mode-a-penalty-escalation-2026-10-18.md.
-- No point value, multiplier, cap or threshold changes; past ledger rows are not touched.
--
-- B1  Bad-habit escalation counts DAYS, not logs: the run before a day is every day back to the habit's
--     first local day (max 90) until a Resisted day; a slipped, no-report or unlogged day counts. Matches
--     the UI copy "Each bad day in a row (slipped or not logged)". Before, a day without any log was
--     skipped, so the first charge after a gap could be 1x (Ali, 2026-10-15), and two logs on one date
--     were walked in random order. New helper ascend_bad_habit_bad_days_before, used by
--     ascend_process_penalties (no-report) and ascend_recompute_bad_habit_awards (occurred).
--     App mirror: getBadHabitBadDaysBefore in src/lib/habitPenalties.ts.
-- B2  ascend_process_penalties uses ascend_bad_habit_eligible() (same slots and tie-break as the app and
--     the award function) and no longer casts isCompleted / isPreset to boolean (a non-boolean value threw
--     and aborted that user's whole run every hour; same text compare as ascend_preset_habit_points).
-- B3  A habit without frequency is daily on the server too (the app already treats it as daily).
--
-- Everything else is the live definition (read 2026-10-18) verbatim. Each function has one signature
-- (checked live), so CREATE OR REPLACE leaves no old overload. The app only previews penalties, so
-- either run order is safe; run it before the studio test of the matching app commit.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_bad_habit_bad_days_before(p_user uuid, p_bad_habit text, p_day date, p_created date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_resisted text[];
  v_cursor   date := p_day - 1;
  v_count    int  := 0;
BEGIN
  -- Days before p_day, newest first, back to the habit's first local day (max 90): each counts until
  -- a day with a Resisted log. A slipped, no-report or unlogged day counts. Mirror: habitPenalties.ts
  -- getBadHabitBadDaysBefore.
  IF p_created IS NULL THEN
    RETURN 0;
  END IF;
  SELECT coalesce(array_agg(DISTINCT l.data->>'date'), '{}') INTO v_resisted
  FROM public.bad_habit_logs l
  WHERE l.user_id = p_user AND l.deleted_at IS NULL
    AND l.data->>'badHabitId' = p_bad_habit
    AND l.data->>'status' = 'resisted'
    AND l.data->>'date' >= to_char(p_day - 90, 'YYYY-MM-DD')
    AND l.data->>'date' < to_char(p_day, 'YYYY-MM-DD');
  FOR i IN 1..90 LOOP
    EXIT WHEN v_cursor < p_created OR to_char(v_cursor, 'YYYY-MM-DD') = ANY (v_resisted);
    v_count := v_count + 1;
    v_cursor := v_cursor - 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_bad_habit_bad_days_before(uuid, text, date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ascend_process_penalties(p_user uuid, p_tz text, p_from date, p_to date, p_apply boolean)
 RETURNS TABLE(kind text, entity_id text, period text, amount integer, multiplier double precision)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_now_iso    text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_season     int  := public.ascend_season_points(p_user);
  v_username   text;
  v_partner    uuid;
  v_day        date;
  v_habit      record;
  v_bad        record;
  v_key        text;
  v_created    date;
  v_created_key text;
  v_cursor     text;
  v_cursor_day date;
  v_misses     int;
  v_mult       double precision;
  v_penalty    int;
  v_entry_id   text;
  v_done       boolean;
  v_eligible   text[];
  v_occ        int;
  v_goal       jsonb;
  v_target     int;
  v_logged     int;
  v_avg        int;
  v_inserted   int;
  v_changed    boolean := false;
BEGIN
  SELECT pr.username INTO v_username FROM public.profiles pr WHERE pr.id = p_user;

  -- Same eligible slots as ascend_recompute_bad_habit_awards and the app (getPointEligibleHabitIds).
  v_eligible := public.ascend_bad_habit_eligible(p_user);

  v_day := p_from;
  WHILE v_day <= p_to LOOP

    -- a) Preset habits
    FOR v_habit IN
      SELECT h.id, h.data
      FROM public.habits h
      WHERE h.user_id = p_user AND h.deleted_at IS NULL
        AND coalesce(h.data->>'isPreset', '') = 'true'
        AND coalesce((h.data->>'points')::numeric, 0) > 0
      ORDER BY h.created_at, h.id
    LOOP
      v_created := public.ascend_local_date(v_habit.data->>'createdAt', p_tz);
      IF v_created IS NULL OR v_day < v_created THEN
        CONTINUE;
      END IF;

      -- A missing frequency is daily, as in the app (habitPenalties.ts).
      IF coalesce(v_habit.data->>'frequency', 'daily') = 'daily' THEN
        v_key := to_char(v_day, 'YYYY-MM-DD');
        v_created_key := coalesce(v_habit.data->>'createdAtPeriod', to_char(v_created, 'YYYY-MM-DD'));
      ELSE
        IF extract(isodow FROM v_day) <> 7 THEN
          CONTINUE;
        END IF;
        v_key := public.ascend_week_key(v_day, p_tz);
        v_created_key := coalesce(v_habit.data->>'createdAtPeriod', public.ascend_week_key(v_created, p_tz));
      END IF;

      v_done := CASE jsonb_typeof(v_habit.data->'completions')
        WHEN 'object' THEN coalesce(v_habit.data->'completions'->v_key->>'done', '') = 'true'
        WHEN 'array'  THEN (v_habit.data->'completions') ? v_key
        ELSE false END;
      IF v_done THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.point_entries pe
        WHERE pe.user_id = p_user
          AND (pe.id = 'habit_missed_' || v_habit.id || '_' || v_key
               OR (pe.data->>'source' = 'habit_missed'
                   AND pe.data->'metadata'->>'habitId' = v_habit.id
                   AND pe.data->'metadata'->>'period' = v_key))
      ) THEN
        CONTINUE;
      END IF;

      v_misses := 0;
      v_cursor := v_key;
      FOR i IN 1..(CASE WHEN coalesce(v_habit.data->>'frequency', 'daily') = 'daily' THEN 90 ELSE 52 END) LOOP
        EXIT WHEN v_cursor < v_created_key;
        EXIT WHEN CASE jsonb_typeof(v_habit.data->'completions')
          WHEN 'object' THEN coalesce(v_habit.data->'completions'->v_cursor->>'done', '') = 'true'
          WHEN 'array'  THEN (v_habit.data->'completions') ? v_cursor
          ELSE false END;
        v_misses := v_misses + 1;
        IF coalesce(v_habit.data->>'frequency', 'daily') = 'daily' THEN
          v_cursor := to_char(v_cursor::date - 1, 'YYYY-MM-DD');
        ELSE
          v_cursor := public.ascend_add_weeks(v_cursor, -1, p_tz);
        END IF;
      END LOOP;

      v_mult := public.ascend_miss_multiplier(v_misses, v_season);
      v_penalty := round((v_habit.data->>'points')::numeric * v_mult::numeric)::int;
      v_entry_id := 'habit_missed_' || v_habit.id || '_' || v_key;

      IF p_apply THEN
        INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
        VALUES (p_user, v_entry_id, jsonb_build_object(
          'id', v_entry_id,
          'amount', -v_penalty,
          'reason', 'Missed habit (' || v_mult || 'x penalty): ' || (v_habit.data->>'name'),
          'source', 'habit_missed',
          'timestamp', v_now_iso,
          'metadata', jsonb_build_object('habitId', v_habit.id, 'habitName', v_habit.data->>'name', 'period', v_key, 'multiplier', v_mult)
        ), now(), now())
        ON CONFLICT (user_id, id) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        IF v_inserted = 0 THEN
          CONTINUE;
        END IF;

        PERFORM public.create_notification_atomic(
          p_recipient_id => p_user,
          p_type => 'missed_habit',
          p_title => 'Habit Missed Penalty',
          p_message => 'You missed your habit "' || (v_habit.data->>'name') || '" for period ' || v_key || '. '
                       || CASE WHEN v_penalty > 0 THEN v_penalty || ' points deducted.' ELSE '' END,
          p_payload => jsonb_build_object('habitId', v_habit.id, 'habitName', v_habit.data->>'name', 'period', v_key,
                                          'dedupKey', 'missed_habit_' || v_habit.id || '_' || v_key)
        );
        FOR v_partner IN
          SELECT CASE WHEN ps.user1_id = p_user THEN ps.user2_id ELSE ps.user1_id END
          FROM public.partnerships ps
          WHERE ps.user1_id = p_user OR ps.user2_id = p_user
          ORDER BY ps.paired_at, ps.id
        LOOP
          PERFORM public.create_notification_atomic(
            p_recipient_id => v_partner,
            p_actor_id => p_user,
            p_type => 'partner_missed_habit',
            p_title => 'Streak Risk Warning',
            p_message => 'Your partner ' || coalesce(v_username, 'User') || ' missed their habit "' || (v_habit.data->>'name')
                         || '". Reach out to encourage them!',
            p_payload => jsonb_build_object('habitId', v_habit.id, 'habitName', v_habit.data->>'name', 'period', v_key,
                                            'dedupKey', 'partner_missed_habit_' || v_habit.id || '_' || v_key)
          );
        END LOOP;
        v_changed := true;
      END IF;

      v_season := greatest(v_season - v_penalty, 0);
      kind := 'habit_missed'; entity_id := v_habit.id; period := v_key; amount := -v_penalty; multiplier := v_mult;
      RETURN NEXT;
    END LOOP;

    -- b) Bad-habit no-reports
    FOR v_bad IN
      SELECT bh.id, bh.data
      FROM public.bad_habits bh
      WHERE bh.user_id = p_user AND bh.deleted_at IS NULL
        AND coalesce(bh.data->>'isCompleted', '') <> 'true'
      ORDER BY public.ascend_instant(bh.data->>'createdAt') NULLS LAST, bh.id
    LOOP
      v_created := public.ascend_local_date(v_bad.data->>'createdAt', p_tz);
      IF v_created IS NULL OR v_day < v_created THEN
        CONTINUE;
      END IF;
      v_key := to_char(v_day, 'YYYY-MM-DD');

      IF EXISTS (
        SELECT 1 FROM public.bad_habit_logs l
        WHERE l.user_id = p_user
          AND ((l.deleted_at IS NULL AND l.data->>'badHabitId' = v_bad.id AND l.data->>'date' = v_key)
               OR l.id = 'no_report_' || v_bad.id || '_' || v_key)
      ) THEN
        CONTINUE;
      END IF;

      -- Bad days in a row before this one (slipped or not logged), the same walk as the app.
      v_occ := 1 + public.ascend_bad_habit_bad_days_before(p_user, v_bad.id, v_day, v_created);

      IF v_bad.id = ANY (v_eligible) THEN
        v_mult := public.ascend_miss_multiplier(v_occ, v_season);
        v_penalty := round(3 * v_mult::numeric)::int;
      ELSE
        v_mult := 1;
        v_penalty := 0;
      END IF;

      IF p_apply THEN
        INSERT INTO public.bad_habit_logs (user_id, id, data, created_at, updated_at)
        VALUES (p_user, 'no_report_' || v_bad.id || '_' || v_key, jsonb_build_object(
          'id', 'no_report_' || v_bad.id || '_' || v_key,
          'badHabitId', v_bad.id,
          'date', v_key,
          'status', 'no_report',
          'consecutiveOccurrences', v_occ,
          'pointsAwardedOrDeducted', -v_penalty,
          'createdAt', v_now_iso
        ), now(), now())
        ON CONFLICT (user_id, id) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        IF v_inserted = 0 THEN
          CONTINUE;
        END IF;
        v_changed := true;

        IF v_penalty > 0 THEN
          v_entry_id := 'bad_habit_no_report_' || v_bad.id || '_' || v_key;
          INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
          VALUES (p_user, v_entry_id, jsonb_build_object(
            'id', v_entry_id,
            'amount', -v_penalty,
            'reason', 'No-report bad habit penalty (' || v_mult || 'x penalty): ' || (v_bad.data->>'name'),
            'source', 'bad_habit_no_report',
            'timestamp', v_now_iso,
            'metadata', jsonb_build_object('badHabitId', v_bad.id, 'badHabitName', v_bad.data->>'name', 'date', v_key, 'multiplier', v_mult)
          ), now(), now())
          ON CONFLICT (user_id, id) DO NOTHING;

          PERFORM public.create_notification_atomic(
            p_recipient_id => p_user,
            p_type => 'bad_habit_no_report',
            p_title => 'Bad Habit No-Report Penalty',
            p_message => 'No status reported for "' || (v_bad.data->>'name') || '" on ' || v_key || '. '
                         || v_penalty || ' points deducted.',
            p_payload => jsonb_build_object('badHabitId', v_bad.id, 'badHabitName', v_bad.data->>'name', 'date', v_key,
                                            'dedupKey', 'bad_habit_' || v_bad.id || '_' || v_key)
          );
        END IF;
      END IF;

      v_season := greatest(v_season - v_penalty, 0);
      kind := 'bad_habit_no_report'; entity_id := v_bad.id; period := v_key; amount := -v_penalty; multiplier := v_mult;
      RETURN NEXT;
    END LOOP;

    -- c) Weekly exercise target removed 2026-10-17; earlier exercise_missed rows stay.

    v_day := v_day + 1;
  END LOOP;

  IF p_apply AND v_changed THEN
    v_season := public.ascend_season_points(p_user);
    UPDATE public.profiles SET season_points = v_season, total_points = v_season WHERE id = p_user;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_process_penalties(uuid, text, date, date, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ascend_recompute_bad_habit_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_eligible  text[]      := public.ascend_bad_habit_eligible(p_user);
  v_used      int         := 0;
  v_count     int         := 0;
  v_kept      text[]      := '{}';
  v_id        text;
  v_at        timestamptz;
  v_occ       int;
  v_mult      double precision;
  v_penalty   int;
  v_item      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bad_habit_awards:' || p_user::text || ':' || v_key));

  -- a) Resists: one log per habit (the earliest); logs that already earned go first.
  FOR v_item IN
    SELECT * FROM (
      SELECT DISTINCT ON (l.data->>'badHabitId')
        l.data->>'badHabitId' AS bh_id,
        bh.data->>'name' AS name,
        coalesce(public.ascend_instant(l.data->>'createdAt'), 'epoch'::timestamptz) AS logged_at,
        l.id,
        EXISTS (
          SELECT 1 FROM public.point_entries pe
          WHERE pe.user_id = p_user AND pe.deleted_at IS NULL
            AND pe.id = 'bad_habit_resist_' || (l.data->>'badHabitId') || '_' || v_key
            AND coalesce((pe.data->>'amount')::numeric, 0) > 0
        ) AS earned
      FROM public.bad_habit_logs l
      JOIN public.bad_habits bh
        ON bh.user_id = l.user_id AND bh.id = l.data->>'badHabitId' AND bh.deleted_at IS NULL
      WHERE l.user_id = p_user AND l.deleted_at IS NULL
        AND l.data->>'date' = v_key AND l.data->>'status' = 'resisted'
      ORDER BY l.data->>'badHabitId', 3, l.id COLLATE "C"
    ) r
    WHERE r.earned OR r.bh_id = ANY (v_eligible)
    ORDER BY r.earned DESC, r.logged_at, r.id COLLATE "C"
  LOOP
    CONTINUE WHEN v_count >= 2 OR v_used + 3 > 6; -- maxDailyResists, resistBase, dailyCap
    v_count := v_count + 1;
    v_used := v_used + 3;

    v_id := 'bad_habit_resist_' || v_item.bh_id || '_' || v_key;
    v_kept := array_append(v_kept, v_id);
    v_at := least(greatest(v_item.logged_at, v_day_start), now());

    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', 3,
      'reason', 'Bad habit resisted: ' || coalesce(v_item.name, ''),
      'source', 'bad_habit_resisted',
      'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', jsonb_build_object('badHabitId', v_item.bh_id, 'date', v_key, 'status', 'resisted')
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  END LOOP;

  -- b) Occurred: a live penalty keeps its amount; a new one uses today's streak and season.
  FOR v_item IN
    SELECT DISTINCT ON (l.data->>'badHabitId')
      l.data->>'badHabitId' AS bh_id,
      bh.data->>'name' AS name,
      bh.data->>'createdAt' AS habit_created,
      coalesce(public.ascend_instant(l.data->>'createdAt'), 'epoch'::timestamptz) AS logged_at
    FROM public.bad_habit_logs l
    JOIN public.bad_habits bh
      ON bh.user_id = l.user_id AND bh.id = l.data->>'badHabitId' AND bh.deleted_at IS NULL
    WHERE l.user_id = p_user AND l.deleted_at IS NULL
      AND l.data->>'date' = v_key AND l.data->>'status' = 'occurred'
    ORDER BY l.data->>'badHabitId', 3, l.id COLLATE "C"
  LOOP
    v_id := 'bad_habit_occurred_' || v_item.bh_id || '_' || v_key;
    IF EXISTS (SELECT 1 FROM public.point_entries pe
               WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL) THEN
      v_kept := array_append(v_kept, v_id);
      CONTINUE;
    END IF;
    CONTINUE WHEN NOT (v_item.bh_id = ANY (v_eligible));

    -- consecutiveOccurrences: 1 + the bad days in a row before the day (slipped or not logged).
    v_occ := 1 + public.ascend_bad_habit_bad_days_before(
      p_user, v_item.bh_id, p_day, public.ascend_local_date(v_item.habit_created, p_tz));

    v_mult := public.ascend_miss_multiplier(v_occ, public.ascend_season_points(p_user));
    v_penalty := round(5 * v_mult::numeric)::int; -- occurBase
    CONTINUE WHEN v_penalty <= 0;

    v_kept := array_append(v_kept, v_id);
    v_at := least(greatest(v_item.logged_at, v_day_start), now());
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', -v_penalty,
      'reason', 'Bad habit occurred (' || v_mult || 'x penalty): ' || coalesce(v_item.name, ''),
      'source', 'bad_habit_occurred',
      'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', jsonb_build_object('badHabitId', v_item.bh_id, 'date', v_key, 'status', 'occurred')
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at);
  END LOOP;

  -- c) Rows that no longer hold, and the app-written resist/occurred rows of the day.
  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.data->'metadata'->>'date' = v_key
    AND (
      ((pe.id LIKE 'bad\_habit\_resist\_%' OR pe.id LIKE 'bad\_habit\_occurred\_%') AND NOT pe.id = ANY (v_kept))
      OR (pe.id NOT LIKE 'bad\_habit\_%'
          AND pe.data->>'source' IN ('bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_undo'))
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_recompute_bad_habit_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;

COMMIT;

-- Verify (read-only):
-- SELECT p.oid::regprocedure, p.prosecdef, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname IN ('ascend_bad_habit_bad_days_before', 'ascend_process_penalties',
--  'ascend_recompute_bad_habit_awards');   -- 3 rows, each search_path=""
