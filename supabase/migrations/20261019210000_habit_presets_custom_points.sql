-- Habit catalogue 2026-10-19 (src/lib/presets.ts + presetHabitPoints in src/lib/habitAwards.ts;
-- change both together).
--   * New presets: 10,000 steps 2, Eat fruits / vegetables 1, No eating after 9 pm 1, Morning
--     sunlight 1, Gratitude (3 things) 1, Plan tomorrow tonight 1, Pray / spiritual practice 2,
--     Learn 5 new words 1, Watch a lecture / tutorial 2, Make your bed 1, Tidy up for 10 minutes 1.
--   * A custom habit (isPreset not true) earns 1 when daily, 0 when weekly. It shares the same
--     10/day cap in check order (ascend_recompute_habit_awards is unchanged) and still has no
--     missed-day penalty (ascend_process_penalties only charges isPreset habits).
--   * Taken out of the library: No phone for first hour after waking, Digital detox hour, No
--     procrastination. They keep their points here until every copy has left its account: the
--     app retires a copy (applyPresetHabitRemovalMigration) on a day it is not ticked, so today's
--     award never drops. The 7 presets retired on 2026-10-15 stay 0 (ELSE 0); a retired preset is
--     still isPreset = true, so it never falls into the custom branch.
-- Safe for the app version before this change: it can't add the new presets, its custom habits
-- just start earning 1 (shown after the next pull), and no point value of a preset changes.

BEGIN;

CREATE OR REPLACE FUNCTION public.ascend_preset_habit_points(p_habit jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN coalesce(p_habit->>'isPreset', '') <> 'true' THEN
    CASE WHEN p_habit->>'frequency' = 'daily' THEN 1 ELSE 0 END -- CUSTOM_HABIT_POINTS, daily only
  ELSE
    CASE p_habit->>'name'
      WHEN 'Drink 8 cups of water' THEN 1
      WHEN 'Sleep 7-8 hours' THEN 2
      WHEN 'Morning walk' THEN 1
      WHEN 'Cold shower' THEN 2
      WHEN 'Stretching / mobility' THEN 1
      WHEN '10,000 steps' THEN 2
      WHEN 'Eat fruits / vegetables' THEN 1
      WHEN 'No eating after 9 pm' THEN 1
      WHEN 'Morning sunlight' THEN 1
      WHEN 'Meditation' THEN 2
      WHEN 'Gratitude (3 things)' THEN 1
      WHEN 'Plan tomorrow tonight' THEN 1
      WHEN 'Pray / spiritual practice' THEN 2
      WHEN 'Learn something new' THEN 3
      WHEN 'Listen to educational podcast' THEN 2
      WHEN 'Learn 5 new words' THEN 1
      WHEN 'Watch a lecture / tutorial' THEN 2
      WHEN 'Wake up early' THEN 2
      WHEN 'Make your bed' THEN 1
      WHEN 'Tidy up for 10 minutes' THEN 1
      -- Retired 2026-10-19, still scored until the app has retired every copy (RETIRED_SCORED_PRESET_HABITS)
      WHEN 'No phone for first hour after waking' THEN 1
      WHEN 'Digital detox hour' THEN 1
      WHEN 'No procrastination (complete top priority task)' THEN 3
      ELSE 0
    END
  END;
$function$;

-- Stored points brought to the catalogue (habits_normalize_points rewrites them). Only custom
-- habits change; each changed row recomputes its user's today, never an earlier day.
UPDATE public.habits h
SET data = h.data
WHERE h.deleted_at IS NULL
  AND (h.data->'points') IS DISTINCT FROM to_jsonb(public.ascend_preset_habit_points(h.data));

COMMIT;
