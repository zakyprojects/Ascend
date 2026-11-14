-- Bad-habit resist points per bad habit (src/lib/badHabitAwards.ts + PRESET_BAD_HABITS in
-- src/lib/presets.ts; change both together).
--   * ascend_bad_habit_points: a bad habit added from the library (isPreset = true) earns its
--     preset's points per resist (Porn, Smoking / vaping 3; Doomscrolling, Gaming too long, Phone
--     in the first hour after waking, Procrastination 2; Late-night screen time, Junk food,
--     Sugary drinks, Staying up late 1); every other bad habit 1 (every live one today).
--   * Resists: the "2 oldest eligible habits, at most 2 resists" rule is gone. Every active bad
--     habit's resist earns its points in log order until the 6/day cap (the last one may get
--     what is left). A resist that already earned today goes first and keeps at least its amount,
--     so the day this runs nobody's already-earned resist drops (old rows are +3).
--   * Occurred and no-report penalties are unchanged: still only the 2 oldest active bad habits
--     (ascend_bad_habit_eligible), same amounts; ascend_process_penalties is not touched.
--   * Only the user's local today is recomputed (on their next bad-habit write); earlier days
--     never change.
-- Safe for the app version before this change: it sends no isPreset (all its bad habits earn 1);
-- its own preview may show +3 / "Tracking only" until the server's rows arrive.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_bad_habit_points(p_bad_habit jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN coalesce(p_bad_habit->>'isPreset', '') = 'true' THEN
    CASE p_bad_habit->>'name'
      WHEN 'Doomscrolling' THEN 2
      WHEN 'Phone in the first hour after waking' THEN 2
      WHEN 'Procrastination' THEN 2
      WHEN 'Late-night screen time' THEN 1
      WHEN 'Junk food' THEN 1
      WHEN 'Porn' THEN 3
      WHEN 'Gaming too long' THEN 2
      WHEN 'Smoking / vaping' THEN 3
      WHEN 'Sugary drinks' THEN 1
      WHEN 'Staying up late' THEN 1
      ELSE 1
    END
  ELSE 1 END; -- BAD_HABIT_POINTS.customResist
$function$;

REVOKE ALL ON FUNCTION public.ascend_bad_habit_points(jsonb) FROM PUBLIC, anon, authenticated;

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
  v_alloc     int;
  v_kept      text[]      := '{}';
  v_id        text;
  v_at        timestamptz;
  v_occ       int;
  v_mult      double precision;
  v_penalty   int;
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

COMMIT;
