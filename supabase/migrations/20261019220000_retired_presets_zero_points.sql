-- The 3 presets retired on 2026-10-19 (No phone for first hour after waking, Digital detox hour,
-- No procrastination) now earn 0 like the 7 retired on 2026-10-15: every server copy was
-- soft-deleted by Zakria on 2026-10-19 16:05 PKT (0 live, verified). Client mirror:
-- presetHabitPoints in src/lib/habitAwards.ts. Earlier days' points are untouched.
-- Run order: any time (studio and production apps agree once this is live; no live row changes).

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
      ELSE 0
    END
  END;
$function$;

COMMIT;
