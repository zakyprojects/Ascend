-- Bad-habit penalties for every bad habit, at most 4 a day (2026-11-04).
-- Mode A: knowledge/mode-a-bad-habit-penalties-all-2026-11-04.md; Mode B report:
-- knowledge/mode-b-bad-habit-penalties-2026-11-04.md. Zakria's go 2026-11-04 12:38 PKT.
--
-- 1  No more "2 oldest" penalty slots: every active bad habit (library and custom) can lose points.
-- 2  Slip (occurred) and not logged (no-report) cost the same: the habit's points + 1
--    (ascend_bad_habit_points: library 1-3 -> 2-4, custom 1 -> 2), x ascend_miss_multiplier (unchanged:
--    1x / 1.5x; season >= 2000: 1x / 2x / 2.5x), rounded on the positive value, then negated. The
--    amount is read at write time and stored on the ledger row.
-- 3  At most 4 bad habits lose points per user per local day, slips and no-reports together
--    (BAD_HABIT_POINTS.dailyPenaltyLimit). The 4 LARGEST penalties count, so logging cheap slips first
--    games nothing. During the day ascend_recompute_bad_habit_awards keeps the 4 largest slips (a slip
--    shows its penalty at once; a larger 5th slip pushes the smallest out, an undo lets it back).
--    The nightly no-report pass settles the day: today's live slip rows + the no-report candidates,
--    top 4 by amount (ties: slip before no-report, then time, then id); the rest get 0-point
--    no-report logs, and a slip outside the top 4 loses its row.
--    Invariant change: "an occurred penalty already written keeps its amount" still holds (its amount
--    is never recomputed), but a row of TODAY may now be removed or come back within today when the
--    top 4 changes, and once at settlement. Earlier days are never recomputed by the award trigger.
-- 4  ascend_bad_habit_eligible(uuid) is dropped: its only callers were the two functions above
--    (prosrc grep all schemas, cron.job, pg_policies, pg_views, pg_depend: 2026-11-04).
--
-- Bodies are the live definitions (pg_get_functiondef, re-read 2026-11-04) with only these changes.
-- Each function has one signature, so CREATE OR REPLACE leaves no overload. Grants restated: owner and
-- service_role only (no anon/authenticated). No table, data or cron change. Apply right after
-- 00:05 PKT (after the Karachi day is settled under the old rules).
-- Rollback: re-create the live bodies from work/mode-a-pbh/*.sql (incl. ascend_bad_habit_eligible).

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_recompute_bad_habit_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_used      int         := 0;
  v_alloc     int;
  v_kept      text[]      := '{}';
  v_id        text;
  v_at        timestamptz;
  v_occ       int;
  v_season    int;
  v_charged   int         := 0;
  v_item      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bad_habit_awards:' || p_user::text || ':' || v_key));

  -- a) Resists: one log per habit (the earliest), every active bad habit, its own points in log
  --    order up to the cap; a resist that already earned goes first and keeps at least that much.
  FOR v_item IN
    SELECT * FROM (
      SELECT DISTINCT ON (l.data->>'badHabitId')
        l.data->>'badHabitId' AS bh_id,
        bh.data->>'name' AS name,
        public.ascend_bad_habit_points(bh.data) AS points,
        coalesce(public.ascend_instant(l.data->>'createdAt'), 'epoch'::timestamptz) AS logged_at,
        l.id,
        coalesce((
          SELECT greatest(round(coalesce((pe.data->>'amount')::numeric, 0))::int, 0)
          FROM public.point_entries pe
          WHERE pe.user_id = p_user AND pe.deleted_at IS NULL
            AND pe.id = 'bad_habit_resist_' || (l.data->>'badHabitId') || '_' || v_key
        ), 0) AS earned
      FROM public.bad_habit_logs l
      JOIN public.bad_habits bh
        ON bh.user_id = l.user_id AND bh.id = l.data->>'badHabitId' AND bh.deleted_at IS NULL
      WHERE l.user_id = p_user AND l.deleted_at IS NULL
        AND l.data->>'date' = v_key AND l.data->>'status' = 'resisted'
      ORDER BY l.data->>'badHabitId', 4, l.id COLLATE "C"
    ) r
    ORDER BY (r.earned > 0) DESC, r.logged_at, r.id COLLATE "C"
  LOOP
    v_alloc := least(greatest(v_item.earned, v_item.points), greatest(6 - v_used, 0)); -- dailyCap
    CONTINUE WHEN v_alloc <= 0;
    v_used := v_used + v_alloc;

    v_id := 'bad_habit_resist_' || v_item.bh_id || '_' || v_key;
    v_kept := array_append(v_kept, v_id);
    v_at := least(greatest(v_item.logged_at, v_day_start), now());

    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_alloc,
      'reason', 'Bad habit resisted: ' || coalesce(v_item.name, ''),
      'source', 'bad_habit_resisted',
      'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', jsonb_build_object('badHabitId', v_item.bh_id, 'date', v_key, 'status', 'resisted')
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  END LOOP;

  -- b) Occurred: every active bad habit; a new penalty is (its points + 1) x the miss multiplier, a
  --    live one keeps its amount. At most 4 slips are charged a day (BAD_HABIT_POINTS.dailyPenaltyLimit):
  --    the largest penalties, ties by the earlier log, then log id. A slip outside the 4 gets no row
  --    (its live row, if any, is removed in c) and gets one again if a larger slip is undone. Only the
  --    user's local today is ever recomputed, so earlier days stay frozen.
  IF EXISTS (SELECT 1 FROM public.bad_habit_logs l
             WHERE l.user_id = p_user AND l.deleted_at IS NULL
               AND l.data->>'date' = v_key AND l.data->>'status' = 'occurred') THEN
    v_season := public.ascend_season_points(p_user);

    FOR v_item IN
      WITH slip AS (
        SELECT DISTINCT ON (l.data->>'badHabitId')
          l.data->>'badHabitId' AS bh_id,
          bh.data->>'name' AS name,
          bh.data AS bh_data,
          bh.data->>'createdAt' AS habit_created,
          coalesce(public.ascend_instant(l.data->>'createdAt'), 'epoch'::timestamptz) AS logged_at,
          l.id AS log_id
        FROM public.bad_habit_logs l
        JOIN public.bad_habits bh
          ON bh.user_id = l.user_id AND bh.id = l.data->>'badHabitId' AND bh.deleted_at IS NULL
        WHERE l.user_id = p_user AND l.deleted_at IS NULL
          AND l.data->>'date' = v_key AND l.data->>'status' = 'occurred'
        ORDER BY l.data->>'badHabitId', 5, l.id COLLATE "C"
      ), priced AS (
        SELECT s.*,
          (SELECT greatest(round(-coalesce((pe.data->>'amount')::numeric, 0))::int, 0)
           FROM public.point_entries pe
           WHERE pe.user_id = p_user AND pe.deleted_at IS NULL
             AND pe.id = 'bad_habit_occurred_' || s.bh_id || '_' || v_key) AS kept_penalty,
          -- consecutiveOccurrences: 1 + the bad days in a row before the day (slipped or not logged).
          public.ascend_miss_multiplier(
            1 + public.ascend_bad_habit_bad_days_before(
              p_user, s.bh_id, p_day, public.ascend_local_date(s.habit_created, p_tz)),
            v_season) AS mult
        FROM slip s
      )
      SELECT p.bh_id, p.name, p.logged_at, p.mult, p.kept_penalty IS NOT NULL AS kept,
        coalesce(p.kept_penalty,
                 round((public.ascend_bad_habit_points(p.bh_data) + 1) * p.mult::numeric)::int) AS penalty
      FROM priced p
      ORDER BY 6 DESC, p.logged_at, p.log_id COLLATE "C"
    LOOP
      CONTINUE WHEN v_item.penalty <= 0;
      v_charged := v_charged + 1;
      CONTINUE WHEN v_charged > 4; -- dailyPenaltyLimit

      v_id := 'bad_habit_occurred_' || v_item.bh_id || '_' || v_key;
      v_kept := array_append(v_kept, v_id);
      CONTINUE WHEN v_item.kept;

      v_at := least(greatest(v_item.logged_at, v_day_start), now());
      INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
      VALUES (p_user, v_id, jsonb_build_object(
        'id', v_id,
        'amount', -v_item.penalty,
        'reason', 'Bad habit occurred (' || v_item.mult || 'x penalty): ' || coalesce(v_item.name, ''),
        'source', 'bad_habit_occurred',
        'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'metadata', jsonb_build_object('badHabitId', v_item.bh_id, 'date', v_key, 'status', 'occurred')
      ), now(), now())
      ON CONFLICT (user_id, id) DO UPDATE
        SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at);
    END LOOP;
  END IF;

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
GRANT EXECUTE ON FUNCTION public.ascend_recompute_bad_habit_awards(uuid, date, text) TO service_role;

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
  v_slots      int;
  v_goal       jsonb;
  v_target     int;
  v_logged     int;
  v_avg        int;
  v_inserted   int;
  v_changed    boolean := false;
BEGIN
  SELECT pr.username INTO v_username FROM public.profiles pr WHERE pr.id = p_user;

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

    -- b) Bad-habit no-reports: every active bad habit; (its points + 1) x the miss multiplier, the same
    --    as a slip. At most 4 bad habits lose points a day, slips and no-reports together
    --    (BAD_HABIT_POINTS.dailyPenaltyLimit): the day's live slip penalties and the new no-report
    --    candidates are ranked by amount (ties: slip first, then time, then id) and the top ones
    --    are charged; a no-report outside them gets a 0-point log, a slip outside them loses its
    --    penalty. A no-report already charged on the day keeps its slot. Settled once: the run that
    --    writes the day's no-report logs; later runs find no candidates and change nothing.
    v_key := to_char(v_day, 'YYYY-MM-DD');
    SELECT 4 - count(*) INTO v_slots -- dailyPenaltyLimit
    FROM public.point_entries pe
    WHERE pe.user_id = p_user AND pe.deleted_at IS NULL
      AND pe.id LIKE 'bad\_habit\_no\_report\_%' AND pe.data->'metadata'->>'date' = v_key;

    FOR v_bad IN
      WITH habit AS (
        SELECT bh.id, bh.data,
          public.ascend_local_date(bh.data->>'createdAt', p_tz) AS created,
          public.ascend_instant(bh.data->>'createdAt') AS at
        FROM public.bad_habits bh
        WHERE bh.user_id = p_user AND bh.deleted_at IS NULL
          AND coalesce(bh.data->>'isCompleted', '') <> 'true'
      ), missed AS (
        SELECT h.*,
          -- Bad days in a row before this one (slipped or not logged), the same walk as the app.
          1 + public.ascend_bad_habit_bad_days_before(p_user, h.id, v_day, h.created) AS occ
        FROM habit h
        WHERE h.created IS NOT NULL AND v_day >= h.created
          AND NOT EXISTS (
            SELECT 1 FROM public.bad_habit_logs l
            WHERE l.user_id = p_user
              AND ((l.deleted_at IS NULL AND l.data->>'badHabitId' = h.id AND l.data->>'date' = v_key)
                   OR l.id = 'no_report_' || h.id || '_' || v_key))
      ), candidate AS (
        SELECT 'no_report'::text AS what, 1 AS what_order, m.id AS bh_id, m.data, m.at, m.id AS tie_id, m.occ,
          public.ascend_miss_multiplier(m.occ, v_season) AS mult,
          round((public.ascend_bad_habit_points(m.data) + 1)
                * public.ascend_miss_multiplier(m.occ, v_season)::numeric)::int AS penalty,
          NULL::text AS entry_id
        FROM missed m
        UNION ALL
        SELECT 'slip', 0, pe.data->'metadata'->>'badHabitId', NULL::jsonb, public.ascend_instant(pe.data->>'timestamp'),
          pe.id, NULL::int, NULL::double precision,
          greatest(round(-coalesce((pe.data->>'amount')::numeric, 0))::int, 0), pe.id
        FROM public.point_entries pe
        WHERE pe.user_id = p_user AND pe.deleted_at IS NULL
          AND pe.id LIKE 'bad\_habit\_occurred\_%' AND pe.data->'metadata'->>'date' = v_key
          AND EXISTS (SELECT 1 FROM missed)
      )
      SELECT c.*, row_number() OVER (ORDER BY c.penalty DESC, c.what_order, c.at NULLS LAST, c.tie_id COLLATE "C") AS rank
      FROM candidate c
      WHERE c.penalty > 0
      ORDER BY rank
    LOOP
      IF v_bad.what = 'slip' THEN
        CONTINUE WHEN v_bad.rank <= v_slots;
        -- Outside the day's top: this slip costs nothing after all.
        IF p_apply THEN
          UPDATE public.point_entries pe
          SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
          WHERE pe.user_id = p_user AND pe.id = v_bad.entry_id AND pe.deleted_at IS NULL;
          v_changed := true;
        END IF;
        v_season := v_season + v_bad.penalty;
        kind := 'bad_habit_occurred_refunded'; entity_id := v_bad.bh_id; period := v_key; amount := v_bad.penalty; multiplier := NULL;
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF v_bad.rank <= v_slots THEN
        v_mult := v_bad.mult;
        v_penalty := v_bad.penalty;
      ELSE
        v_mult := 1;
        v_penalty := 0;
      END IF;

      IF p_apply THEN
        INSERT INTO public.bad_habit_logs (user_id, id, data, created_at, updated_at)
        VALUES (p_user, 'no_report_' || v_bad.bh_id || '_' || v_key, jsonb_build_object(
          'id', 'no_report_' || v_bad.bh_id || '_' || v_key,
          'badHabitId', v_bad.bh_id,
          'date', v_key,
          'status', 'no_report',
          'consecutiveOccurrences', v_bad.occ,
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
          v_entry_id := 'bad_habit_no_report_' || v_bad.bh_id || '_' || v_key;
          INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
          VALUES (p_user, v_entry_id, jsonb_build_object(
            'id', v_entry_id,
            'amount', -v_penalty,
            'reason', 'No-report bad habit penalty (' || v_mult || 'x penalty): ' || (v_bad.data->>'name'),
            'source', 'bad_habit_no_report',
            'timestamp', v_now_iso,
            'metadata', jsonb_build_object('badHabitId', v_bad.bh_id, 'badHabitName', v_bad.data->>'name', 'date', v_key, 'multiplier', v_mult)
          ), now(), now())
          ON CONFLICT (user_id, id) DO NOTHING;

          PERFORM public.create_notification_atomic(
            p_recipient_id => p_user,
            p_type => 'bad_habit_no_report',
            p_title => 'Bad Habit No-Report Penalty',
            p_message => 'No status reported for "' || (v_bad.data->>'name') || '" on ' || v_key || '. '
                         || v_penalty || ' points deducted.',
            p_payload => jsonb_build_object('badHabitId', v_bad.bh_id, 'badHabitName', v_bad.data->>'name', 'date', v_key,
                                            'dedupKey', 'bad_habit_' || v_bad.bh_id || '_' || v_key)
          );
        END IF;
      END IF;

      v_season := greatest(v_season - v_penalty, 0);
      kind := 'bad_habit_no_report'; entity_id := v_bad.bh_id; period := v_key; amount := -v_penalty; multiplier := v_mult;
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
GRANT EXECUTE ON FUNCTION public.ascend_process_penalties(uuid, text, date, date, boolean) TO service_role;

DROP FUNCTION public.ascend_bad_habit_eligible(uuid);

COMMIT;
