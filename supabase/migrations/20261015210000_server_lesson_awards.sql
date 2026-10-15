-- Lesson points from the server (knowledge/server-side-plan.md, Part 2 #2, Option C module 8)
-- The app used to send the points of a lesson itself, so a console call could claim any amount.
-- Now:
--   * Reads move out of the user_data blob (readLessonIds) into lesson_reads, one row per
--     `<lessonId>_s<season>` id (season 1 also kept bare lesson ids). A read is never undone.
--   * The database awards lesson_award_<lessonId>_s<season> once, with the points of its own
--     copy of the catalog (src/lib/lessons.ts: 8 lessons x 1, 6 x 2), and only when the row
--     arrives in the season it names (ascend_lesson_season = getSeasonNumber in leagueTime.ts).
--     An unknown lesson earns nothing.
--   * A lesson already rewarded this season by the app (a legacy lesson row with its lessonId
--     and seasonNumber) earns nothing again; the legacy rows stay as they are.
--   * The app can no longer write lesson points (source lesson, lesson_award_ ids).
-- Existing reads are copied from the blob before the trigger exists, so they award nothing.
-- src/lib/lessonAwards.ts and src/lib/lessons.ts must stay identical to this file.

BEGIN;

-- 1. The table (sync template, 20261014000000). Rows never change once written.
CREATE TABLE public.lesson_reads (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                text        NOT NULL,
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  deleted_at        timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX lesson_reads_user_cursor_idx ON public.lesson_reads (user_id, server_updated_at);

CREATE TRIGGER lesson_reads_keep_newer BEFORE UPDATE ON public.lesson_reads
  FOR EACH ROW EXECUTE FUNCTION public.sync_keep_newer_row();
-- Runs after keep_newer (triggers fire in name order: keep_newer < stamp).
CREATE TRIGGER lesson_reads_stamp BEFORE INSERT OR UPDATE ON public.lesson_reads
  FOR EACH ROW EXECUTE FUNCTION public.sync_stamp_row();

ALTER TABLE public.lesson_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can read" ON public.lesson_reads FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can insert" ON public.lesson_reads FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owner can update" ON public.lesson_reads FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.lesson_reads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lesson_reads TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.lesson_reads;

-- 2. Backfill from the blob (before the award trigger, so these reads award nothing).
INSERT INTO public.lesson_reads (user_id, id, created_at, updated_at)
SELECT DISTINCT ud.user_id, e, TIMESTAMPTZ '1970-01-01 00:00:00+00', TIMESTAMPTZ '1970-01-01 00:00:00+00'
FROM public.user_data ud
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(ud.state->'readLessonIds') = 'array' THEN ud.state->'readLessonIds' ELSE '[]'::jsonb END
) e
WHERE e <> ''
ON CONFLICT (user_id, id) DO NOTHING;

-- 3. The season of an instant (getSeasonNumber: 90-day seasons from 2026-08-01 UTC).
CREATE OR REPLACE FUNCTION public.ascend_lesson_season(p_at timestamptz)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN p_at < TIMESTAMPTZ '2026-08-01 00:00:00+00' THEN 1
              ELSE 1 + floor(extract(epoch FROM p_at - TIMESTAMPTZ '2026-08-01 00:00:00+00') / (90 * 86400))::int END;
$function$;

-- 4. The catalog (src/lib/lessons.ts; change both together).
CREATE OR REPLACE FUNCTION public.ascend_lesson_catalog()
 RETURNS TABLE (lesson_id text, points integer, title text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT * FROM (VALUES
    ('discipline-1', 1, 'The Science of Building Discipline'),
    ('discipline-2', 1, 'The 2-Minute Rule for Procrastination'),
    ('habits-1', 1, 'Breaking Bad Habits: The Cue-Routine-Reward Loop'),
    ('habits-2', 1, 'Why Streaks Work (and How to Recover When They Break)'),
    ('goals-1', 1, 'SMART Goals vs. System Goals'),
    ('goals-2', 1, 'The Weekly Review: 30 Minutes That Change Your Year'),
    ('mindset-1', 1, 'Growth Mindset: What Neuroscience Actually Says'),
    ('mindset-2', 1, 'The Dichotomy of Control: What Stoicism Teaches Us'),
    ('neuro-1', 2, 'Neuroplasticity: Your Brain Is Not Fixed'),
    ('neuro-2', 2, 'Why Consistency Beats Intensity'),
    ('neuro-3', 2, 'Sleep: Where Memory Consolidation Happens'),
    ('neuro-4', 2, 'Novelty: The Brain''s Growth Trigger'),
    ('pfc-1', 2, 'The Prefrontal Cortex: Command Center of Willpower & Decision Making'),
    ('pfc-2', 2, 'Affect Labeling: Why Naming Your Feelings Dampens Reactivity')
  ) AS c(lesson_id, points, title);
$function$;

-- 5. A new read awards its lesson's points once, in the season it names.
CREATE OR REPLACE FUNCTION public.lesson_reads_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_match  text[] := regexp_match(NEW.id, '^(.+)_s([0-9]{1,6})$');
  v_lesson text   := coalesce(v_match[1], NEW.id);
  v_season integer := coalesce(v_match[2]::integer, 1); -- a bare id is a season-1 read
  v_item   record;
  v_id     text;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR v_season <> public.ascend_lesson_season(now()) THEN
    RETURN NULL;
  END IF;

  SELECT c.points, c.title INTO v_item FROM public.ascend_lesson_catalog() c WHERE c.lesson_id = v_lesson;
  IF NOT FOUND OR v_item.points <= 0 THEN
    RETURN NULL;
  END IF;

  v_id := 'lesson_award_' || v_lesson || '_s' || v_season;
  PERFORM pg_advisory_xact_lock(hashtext('lesson_awards:' || NEW.user_id::text || ':' || v_id));

  -- Rewarded this season already: by the server (any row with the id) or by the app before.
  IF EXISTS (
    SELECT 1 FROM public.point_entries pe
    WHERE pe.user_id = NEW.user_id
      AND (pe.id = v_id
        OR (pe.deleted_at IS NULL
          AND pe.data->>'source' = 'lesson'
          AND pe.data->'metadata'->>'lessonId' = v_lesson
          AND coalesce(pe.data->'metadata'->>'seasonNumber', '1') = v_season::text))
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
  VALUES (NEW.user_id, v_id, jsonb_build_object(
    'id', v_id,
    'amount', v_item.points,
    'reason', 'Lesson read: ' || v_item.title,
    'source', 'lesson',
    'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'metadata', jsonb_build_object('lessonId', v_lesson, 'seasonNumber', v_season)
  ), now(), now())
  ON CONFLICT (user_id, id) DO NOTHING;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER lesson_reads_award_points AFTER INSERT ON public.lesson_reads
  FOR EACH ROW EXECUTE FUNCTION public.lesson_reads_award_points();

-- 6. Only the server writes habit awards, bad-habit points, workout points, skill points,
--    reading points, journal points, focus points, lesson points and missed-habit and
--    missed-workout penalties (20261015200000 plus the lesson lines).
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
     OR NEW.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                'reading', 'reading_bonus', 'journal', 'focus', 'lesson')
     OR (TG_OP = 'UPDATE' AND (
         OLD.id LIKE 'habit\_award\_%' OR OLD.id LIKE 'bad\_habit\_%' OR OLD.id LIKE 'habit\_missed\_%'
         OR OLD.id LIKE 'workout\_award\_%' OR OLD.id LIKE 'exercise\_missed\_%' OR OLD.id LIKE 'skill\_award\_%'
         OR OLD.id LIKE 'reading\_award\_%' OR OLD.id LIKE 'reading\_bonus\_%' OR OLD.id LIKE 'journal\_award\_%'
         OR OLD.id LIKE 'focus\_award\_%'
         OR OLD.id LIKE 'lesson\_award\_%'
         OR OLD.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                    'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                    'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                    'reading', 'reading_bonus', 'journal', 'focus', 'lesson')))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_lesson_season(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_lesson_catalog() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lesson_reads_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_entries_guard_server_owned() FROM PUBLIC, anon, authenticated;

COMMIT;
