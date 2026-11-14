-- Reading points from the server (knowledge/server-side-plan.md, Part 2 #2, Option C module 5)
-- The app used to write its own reading points to point_entries, so a console write could claim
-- any amount. Now (decisions: Zakria 2026-10-15):
--   * Pages: one row per local day, id reading_award_<YYYY-MM-DD>: floor(the day's pages / 2)
--     up to the daily cap of 10 (READING_POINTS), counting only logs of books still in the
--     library. Only the user's current local day is (re)computed, so deleting an earlier day's
--     log or a book keeps earlier days' points.
--   * Finish bonus: one row per book, id reading_bonus_<bookId>, 15 points, given once when the
--     book is completed and its pages were logged on at least 5 distinct days, the first at
--     least 7 days before today (server-kept log dates, not the app's dateStarted). Once a row
--     with that id exists (even deleted) the book never earns it again. Deleting the book
--     removes its bonus. Books whose bonus the app gave before this migration get a deleted
--     marker row, so their old bonus stays and no second one is given.
--   * The app writes reading logs only for today; deleting a log of any day is still allowed.
--     Other app writes to reading_logs are skipped silently, so a queued write never blocks the
--     outbox. Books themselves stay free to add, edit and delete.
--   * The app can no longer write reading points (sources reading, reading_bonus;
--     reading_award_ and reading_bonus_ ids).
-- Older app-written rows stay as they are; the app's page awards and bonuses from 2026-10-15
-- (READING_AWARDS_SERVER_SINCE in src/lib/readingAwards.ts) are replaced by the server's rows
-- (live check 2026-10-15: there are none).
-- src/lib/readingAwards.ts must stay identical to the functions below.

BEGIN;

-- 1. Pages of one log (only a positive number counts).
CREATE OR REPLACE FUNCTION public.ascend_reading_log_pages(p_log jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_log->'pagesRead') = 'number'
              THEN greatest((p_log->>'pagesRead')::numeric, 0) ELSE 0 END;
$function$;

-- 2. The page award row of one user's local day, recomputed from the day's logs.
CREATE OR REPLACE FUNCTION public.ascend_recompute_reading_awards(p_user uuid, p_day date, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_key       text        := to_char(p_day, 'YYYY-MM-DD');
  v_day_start timestamptz := p_day::timestamp AT TIME ZONE p_tz;
  v_day_end   timestamptz := (p_day + 1)::timestamp AT TIME ZONE p_tz;
  v_pages     numeric     := 0;
  v_count     int         := 0;
  v_used      int;
  v_last      timestamptz;
  v_at        timestamptz;
  v_id        text        := 'reading_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_item      record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('reading_awards:' || p_user::text || ':' || v_key));

  FOR v_item IN
    SELECT public.ascend_reading_log_pages(l.data) AS pages,
           public.ascend_instant(l.data->>'createdAt') AS logged_at
    FROM public.reading_logs l
    WHERE l.user_id = p_user
      AND l.deleted_at IS NULL
      AND l.data->>'date' = v_key
      AND EXISTS (
        SELECT 1 FROM public.reading_books b
        WHERE b.user_id = p_user AND b.id = l.data->>'bookId' AND b.deleted_at IS NULL
      )
    ORDER BY 2 NULLS LAST, l.id COLLATE "C"
  LOOP
    v_count := v_count + 1;
    v_last := v_item.logged_at;
    v_pages := v_pages + v_item.pages;
  END LOOP;

  v_used := least(floor(v_pages / 2), 10)::int; -- pagesPerPoint, dailyCap

  IF v_used > 0 THEN
    v_at := least(greatest(coalesce(v_last, now()), v_day_start), now());
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_used,
      'reason', 'Pages logged (' || v_count || ')',
      'source', 'reading',
      'timestamp', to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', jsonb_build_object('date', v_key, 'logs', v_count)
    ), now(), now())
    ON CONFLICT (user_id, id) DO UPDATE
      SET data = EXCLUDED.data, deleted_at = NULL, updated_at = greatest(now(), pe.updated_at)
      WHERE pe.data IS DISTINCT FROM EXCLUDED.data OR pe.deleted_at IS NOT NULL;
  ELSE
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
  END IF;

  -- The app-written page awards and finish bonuses of the day (before this migration).
  UPDATE public.point_entries pe
  SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
  WHERE pe.user_id = p_user
    AND pe.deleted_at IS NULL
    AND pe.id NOT LIKE 'reading\_award\_%'
    AND pe.id NOT LIKE 'reading\_bonus\_%'
    AND pe.data->>'source' IN ('reading', 'reading_bonus')
    AND jsonb_typeof(pe.data->'amount') = 'number'
    AND (pe.data->>'amount')::numeric > 0
    AND public.ascend_instant(pe.data->>'timestamp') >= v_day_start
    AND public.ascend_instant(pe.data->>'timestamp') < v_day_end;
END;
$function$;

-- 3. One book's finish bonus: given once when the gates pass, removed when the book is deleted.
CREATE OR REPLACE FUNCTION public.ascend_recompute_reading_bonus(p_user uuid, p_book text, p_today date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id    text := 'reading_bonus_' || p_book;
  v_book  record;
  v_days  int;
  v_first text;
BEGIN
  IF p_book IS NULL THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('reading_bonus:' || p_user::text || ':' || p_book));

  SELECT b.data, b.deleted_at INTO v_book
  FROM public.reading_books b WHERE b.user_id = p_user AND b.id = p_book;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_book.deleted_at IS NOT NULL THEN
    UPDATE public.point_entries pe
    SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
    WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;
    RETURN;
  END IF;

  IF v_book.data->>'status' IS DISTINCT FROM 'completed'
     OR EXISTS (SELECT 1 FROM public.point_entries pe WHERE pe.user_id = p_user AND pe.id = v_id)
  THEN
    RETURN;
  END IF;

  SELECT count(DISTINCT l.data->>'date'), min(l.data->>'date') INTO v_days, v_first
  FROM public.reading_logs l
  WHERE l.user_id = p_user
    AND l.deleted_at IS NULL
    AND l.data->>'bookId' = p_book
    AND public.ascend_reading_log_pages(l.data) > 0;

  IF v_days >= 5 AND v_first <= to_char(p_today - 7, 'YYYY-MM-DD') THEN -- READING_BONUS_MIN_*
    INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', 15, -- READING_POINTS.completionBonus
      'reason', 'Book finished: ' || coalesce(nullif(v_book.data->>'title', ''), 'Book'),
      'source', 'reading_bonus',
      'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'metadata', jsonb_build_object('bookId', p_book)
    ), now(), now())
    ON CONFLICT (user_id, id) DO NOTHING;
  END IF;
END;
$function$;

-- 4. Any log or book change recomputes the owner's current local day and that book's bonus.
CREATE OR REPLACE FUNCTION public.reading_award_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tz    text := public.ascend_user_timezone(NEW.user_id);
  v_today date := (now() AT TIME ZONE v_tz)::date;
BEGIN
  PERFORM public.ascend_recompute_reading_awards(NEW.user_id, v_today, v_tz);
  PERFORM public.ascend_recompute_reading_bonus(
    NEW.user_id,
    CASE WHEN TG_TABLE_NAME = 'reading_books' THEN NEW.id ELSE NEW.data->>'bookId' END,
    v_today
  );
  RETURN NULL;
END;
$function$;

-- 5. The app writes reading logs only for today, and may delete a log of any day.
CREATE OR REPLACE FUNCTION public.reading_logs_guard_today()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_tz    text;
  v_today text;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Same lookup as ascend_user_timezone, which the app's roles cannot call.
  SELECT pr.timezone INTO v_tz
  FROM public.profiles pr
  JOIN pg_catalog.pg_timezone_names tz ON tz.name = pr.timezone
  WHERE pr.id = NEW.user_id;
  v_today := to_char((now() AT TIME ZONE coalesce(v_tz, 'Asia/Karachi'))::date, 'YYYY-MM-DD');
  IF NEW.data->>'date' IS DISTINCT FROM v_today
     OR (TG_OP = 'UPDATE' AND OLD.data->>'date' IS DISTINCT FROM v_today)
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- 6. Only the server writes habit awards, bad-habit points, workout, skill and reading points
--    and missed-habit and missed-workout penalties (20261015150000 plus the reading lines).
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
     OR NEW.id LIKE 'reading\_award\_%' OR NEW.id LIKE 'reading\_bonus\_%'
     OR NEW.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                'reading', 'reading_bonus')
     OR (TG_OP = 'UPDATE' AND (
         OLD.id LIKE 'habit\_award\_%' OR OLD.id LIKE 'bad\_habit\_%' OR OLD.id LIKE 'habit\_missed\_%'
         OR OLD.id LIKE 'workout\_award\_%' OR OLD.id LIKE 'exercise\_missed\_%' OR OLD.id LIKE 'skill\_award\_%'
         OR OLD.id LIKE 'reading\_award\_%' OR OLD.id LIKE 'reading\_bonus\_%'
         OR OLD.data->>'source' IN ('habit_completed', 'habit_cap_redistribution', 'habit', 'habit_missed',
                                    'bad_habit_resisted', 'bad_habit_occurred', 'bad_habit_no_report',
                                    'bad_habit_undo', 'bad_habit_delete', 'exercise', 'exercise_missed', 'skill',
                                    'reading', 'reading_bonus')))
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_reading_log_pages(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_reading_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_recompute_reading_bonus(uuid, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reading_award_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reading_logs_guard_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_entries_guard_server_owned() FROM PUBLIC, anon, authenticated;

-- Runs before reading_logs_keep_newer (name order).
CREATE TRIGGER reading_logs_guard_today BEFORE INSERT OR UPDATE ON public.reading_logs
  FOR EACH ROW EXECUTE FUNCTION public.reading_logs_guard_today();

-- 7. Books whose bonus the app already gave: a deleted marker row, so no second bonus.
INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at, deleted_at)
SELECT b.user_id, 'reading_bonus_' || b.id, jsonb_build_object(
         'id', 'reading_bonus_' || b.id,
         'amount', 0,
         'reason', 'Book finished before server bonuses: ' || coalesce(nullif(b.data->>'title', ''), 'Book'),
         'source', 'reading_bonus',
         'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'metadata', jsonb_build_object('bookId', b.id, 'legacyMarker', true)),
       now(), now(), now()
FROM public.reading_books b
WHERE b.deleted_at IS NULL
  AND jsonb_typeof(b.data->'pointsAwarded') = 'number'
  AND (b.data->>'pointsAwarded')::numeric > 0
ON CONFLICT (user_id, id) DO NOTHING;

-- 8. Server rows from 2026-10-15 up to each user's today (the app's own rows for those days are
--    retired), and the bonus of every book still in a library.
DO $$
DECLARE
  v_row record;
  v_tz text;
  v_day date;
BEGIN
  FOR v_row IN SELECT DISTINCT l.user_id FROM public.reading_logs l LOOP
    v_tz := public.ascend_user_timezone(v_row.user_id);
    v_day := DATE '2026-10-15';
    WHILE v_day <= (now() AT TIME ZONE v_tz)::date LOOP
      PERFORM public.ascend_recompute_reading_awards(v_row.user_id, v_day, v_tz);
      v_day := v_day + 1;
    END LOOP;
  END LOOP;
  FOR v_row IN SELECT b.user_id, b.id FROM public.reading_books b WHERE b.deleted_at IS NULL LOOP
    PERFORM public.ascend_recompute_reading_bonus(
      v_row.user_id, v_row.id, (now() AT TIME ZONE public.ascend_user_timezone(v_row.user_id))::date);
  END LOOP;
END $$;

CREATE TRIGGER reading_logs_award_points AFTER INSERT OR UPDATE ON public.reading_logs
  FOR EACH ROW EXECUTE FUNCTION public.reading_award_points();
CREATE TRIGGER reading_books_award_points AFTER INSERT OR UPDATE ON public.reading_books
  FOR EACH ROW EXECUTE FUNCTION public.reading_award_points();

COMMIT;
