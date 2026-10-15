-- Habit points from the server (knowledge/trusted-clock-plan.md, Part 2 #2, Option C module 1)
-- The app used to write its own habit awards to point_entries, so a console write could
-- claim any amount. Now:
--   * habits.data.points is always the preset catalogue value (src/lib/presets.ts); custom
--     and retired habits are 0. Award and penalty code both read it.
--   * The database writes the habit awards: one row per (habit, local day), id
--     habit_award_<habitId>_<YYYY-MM-DD>, amount = that habit's share of the 10/day cap
--     (recomputeTodayPresetPoints). Only the user's current local day is (re)computed, so a
--     past day can never be checked for points. A habit deleted today loses today's award;
--     earlier awards stay (same as the app before).
--   * The app can no longer write or edit habit award rows (sources habit_completed,
--     habit_cap_redistribution, habit, or a habit_award_ id). Such writes are skipped
--     silently, so a queued write never blocks the outbox.
-- Point values and the cap are unchanged. "Today" uses profiles.timezone; profiles without
-- one get Asia/Karachi (every current user), and the app overwrites it on its next save.

BEGIN;

-- 1. Every profile has a timezone.
UPDATE public.profiles p
SET timezone = 'Asia/Karachi'
WHERE p.timezone IS NULL
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone);

-- 2. The preset catalogue (PRESET_CATEGORIES in src/lib/presets.ts; change both together).
CREATE OR REPLACE FUNCTION public.ascend_preset_habit_points(p_habit jsonb)
 RETURNS int
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN coalesce(p_habit->>'isPreset', '') <> 'true' THEN 0 ELSE
    CASE p_habit->>'name'
      WHEN 'Drink 8 cups of water' THEN 1
      WHEN 'Sleep 7-8 hours' THEN 2
      WHEN 'Morning walk' THEN 1
      WHEN 'Cold shower' THEN 2
      WHEN 'Stretching / mobility' THEN 1
      WHEN 'Meditation' THEN 2
      WHEN 'No phone for first hour after waking' THEN 1
      WHEN 'Digital detox hour' THEN 1
      WHEN 'Learn something new' THEN 3
      WHEN 'Listen to educational podcast' THEN 2
      WHEN 'No procrastination (complete top priority task)' THEN 3
      WHEN 'Wake up early' THEN 2
      ELSE 0
    END
  END;
$function$;

-- 3. A habit row always carries its catalogue points.
CREATE OR REPLACE FUNCTION public.habits_normalize_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_points int := public.ascend_preset_habit_points(NEW.data);
BEGIN
  IF (NEW.data->'points') IS DISTINCT FROM to_jsonb(v_points) THEN
    NEW.data := jsonb_set(NEW.data, '{points}', to_jsonb(v_points));
  END IF;
  RETURN NEW;
END;
$function$;

-- Runs after habits_guard_future and habits_keep_newer, before habits_stamp (name order).
CREATE TRIGGER habits_normalize_points BEFORE INSERT OR UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.habits_normalize_points();

-- 4. The award rows of one user's local day, recomputed from their habits.
CREATE OR REPLACE FUNCTION public.ascend_recompute_habit_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_cap       int         := 10; -- PRESET_HABIT_POINTS.dailyCap
  v_used      int         := 0;
  v_alloc     int;
  v_at        timestamptz;
  v_id        text;
  v_kept      text[]      := '{}';
  v_item      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('habit_awards:' || p_user::text || ':' || v_key));

  -- Checked daily presets of the day, one per preset name (the earliest), in check order.
  FOR v_item IN
    SELECT * FROM (
      SELECT DISTINCT ON (h.data->>'name')
        h.id,
        h.data->>'name' AS name,
        h.data->>'category' AS category,
        public.ascend_preset_habit_points(h.data) AS points,
        coalesce(
          public.ascend_instant(h.data->'completions'->v_key->>'updatedAt'),
          public.ascend_instant(h.data->>'updatedAt'),
          public.ascend_instant(h.data->>'createdAt')
        ) AS checked_at
      FROM public.habits h
      WHERE h.user_id = p_user
        AND h.deleted_at IS NULL
        AND h.data->>'frequency' = 'daily'
        AND public.ascend_preset_habit_points(h.data) > 0
        AND CASE jsonb_typeof(h.data->'completions')
              WHEN 'object' THEN coalesce(h.data->'completions'->v_key->>'done', '') = 'true'
              WHEN 'array'  THEN (h.data->'completions') ? v_key
              ELSE false END
      ORDER BY h.data->>'name', 5 NULLS LAST, h.id COLLATE "C"
    ) d
    ORDER BY d.checked_at NULLS LAST, d.id COLLATE "C"
  LOOP
    v_alloc := least(v_item.points, greatest(v_cap - v_used, 0));
    v_used := v_used + v_alloc;
    CONTINUE WHEN v_alloc <= 0;

    v_id := 'habit_award_' || v_item.id || '_' || v_key;
    v_kept := array_append(v_kept, v_id);
    v_at := least(greatest(coalesce(v_item.checked_at, now()), v_day_start), now());

    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_alloc,
      'reason', 'Habit completed: ' || v_item.name,
      'source', 'habit_completed',
      'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', jsonb_strip_nulls(jsonb_build_object(
        'category', v_item.category,
        'habitId', v_item.id,
        'habitName', v_item.name,
        'periodKey', v_key
      ))
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  END LOOP;

  -- Awards that no longer hold, and the app-written awards of the day (before this migration).
  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.data->'metadata'->>'periodKey' = v_key
    AND (
      (pe.id LIKE 'habit\_award\_%' AND NOT pe.id = ANY (v_kept))
      OR (pe.id NOT LIKE 'habit\_award\_%' AND pe.data->>'source' IN ('habit_completed', 'habit_cap_redistribution'))
    );
END;
$function$;

-- 5. Any habit change recomputes the owner's current local day.
CREATE OR REPLACE FUNCTION public.habits_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz text;
BEGIN
  SELECT pr.timezone INTO v_tz
  FROM public.profiles pr
  JOIN pg_catalog.pg_timezone_names tz ON tz.name = pr.timezone
  WHERE pr.id = NEW.user_id;
  IF v_tz IS NOT NULL THEN
    PERFORM public.ascend_recompute_habit_awards(NEW.user_id, (now() AT TIME ZONE v_tz)::date, v_tz);
  END IF;
  RETURN NULL;
END;
$function$;

-- 6. Only the server writes habit awards. Writes by the app (anon/authenticated) to a habit
--    award row are skipped, not refused, so the outbox settles them like any other write.
CREATE OR REPLACE FUNCTION public.point_entries_guard_server_owned()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.id LIKE 'habit\_award\_%'
     OR NEW.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit')
     OR (TG_OP = 'UPDATE' AND (OLD.id LIKE 'habit\_award\_%'
         OR OLD.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit')))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_preset_habit_points(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.habits_normalize_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_habit_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.habits_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_entries_guard_server_owned() FROM PUBLIC, anon, authenticated;

-- Runs after point_entries_guard_future, before point_entries_keep_newer (name order).
CREATE TRIGGER point_entries_guard_server_owned BEFORE INSERT OR UPDATE ON public.point_entries
  FOR EACH ROW EXECUTE FUNCTION public.point_entries_guard_server_owned();

-- 7. Retired presets (RETIRED_PRESET_HABIT_NAMES) leave every account. Live check
--    2026-10-15: the 12 remaining rows have no completions, so no points to reverse.
UPDATE public.habits h
SET deleted_at = now(), updated_at = greatest(now(), h.updated_at)
WHERE h.deleted_at IS NULL
  AND h.data->>'isPreset' = 'true'
  AND h.data->>'name' IN ('Exercise / workout', 'Deep work session', 'Practice a skill', 'No porn',
                          'No social media before bed', 'No junk food', 'Journaling');

-- 8. Stored points brought to the catalogue (the trigger rewrites them).
UPDATE public.habits h
SET data = h.data
WHERE h.deleted_at IS NULL
  AND (h.data->'points') IS DISTINCT FROM to_jsonb(public.ascend_preset_habit_points(h.data));

-- 9. Server awards from 2026-10-15 (HABIT_AWARDS_SERVER_SINCE in src/lib/habitAwards.ts)
--    up to each user's today; the app's own rows for those days are retired.
DO $$
DECLARE
  v_row record;
  v_day date;
  v_today date;
BEGIN
  FOR v_row IN
    SELECT DISTINCT h.user_id, pr.timezone
    FROM public.habits h
    JOIN public.profiles pr ON pr.id = h.user_id
    JOIN pg_catalog.pg_timezone_names tz ON tz.name = pr.timezone
  LOOP
    v_today := (now() AT TIME ZONE v_row.timezone)::date;
    v_day := DATE '2026-10-15';
    WHILE v_day <= v_today LOOP
      PERFORM public.ascend_recompute_habit_awards(v_row.user_id, v_day, v_row.timezone);
      v_day := v_day + 1;
    END LOOP;
  END LOOP;
END $$;

CREATE TRIGGER habits_award_points AFTER INSERT OR UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.habits_award_points();

COMMIT;
