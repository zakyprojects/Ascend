-- Habit names are no longer published on profiles (the league profile no longer lists a
-- member's habits, and the app now saves active_habits as []). Clear what earlier saves
-- published. Habits themselves (public.habits) are untouched.
UPDATE public.profiles SET active_habits = '[]'::jsonb WHERE active_habits IS DISTINCT FROM '[]'::jsonb;
