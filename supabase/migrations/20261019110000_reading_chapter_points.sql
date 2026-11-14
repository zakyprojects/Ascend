-- Reading: 1 chapter = 10 points (Zakria 2026-10-19). A chapter book's log (book unit
-- 'chapters', any case) stores chapters in pagesRead; each chapter now counts as 20 pages
-- (pointsPerChapter 10 x pagesPerPoint 2) instead of 1 page. The day's pages of all books
-- still share one cap of 10 points, so one chapter fills the day. Finish logs still earn
-- nothing; the finish bonus gates (ascend_recompute_reading_bonus) are unchanged.
-- Only each chapter-book owner's local today is recomputed; earlier days keep their points.
-- src/lib/readingAwards.ts computeReadingDayAward must stay identical.
-- Run BEFORE the studio test.

BEGIN;

-- The page award row of one user's local day (20261015180000 plus chapter books).
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
    -- A chapter book's log holds chapters: each counts as 20 pages (pointsPerChapter 10 x pagesPerPoint 2).
    SELECT public.ascend_reading_log_pages(l.data)
             * CASE WHEN lower(b.data->>'unit') = 'chapters' THEN 20 ELSE 1 END AS pages,
           public.ascend_instant(l.data->>'createdAt') AS logged_at
    FROM public.reading_logs l
    JOIN public.reading_books b
      ON b.user_id = l.user_id AND b.id = l.data->>'bookId' AND b.deleted_at IS NULL
    WHERE l.user_id = p_user
      AND l.deleted_at IS NULL
      AND l.data->>'date' = v_key
      AND (l.data->>'finish') IS DISTINCT FROM 'true'
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

REVOKE ALL ON FUNCTION public.ascend_recompute_reading_awards(uuid, date, text) FROM PUBLIC, anon, authenticated;

-- Today's row of every user with a chapter book still in the library (earlier days untouched).
DO $$
DECLARE
  v_row record;
  v_tz  text;
BEGIN
  FOR v_row IN
    SELECT DISTINCT b.user_id FROM public.reading_books b
    WHERE b.deleted_at IS NULL AND lower(b.data->>'unit') = 'chapters'
  LOOP
    v_tz := public.ascend_user_timezone(v_row.user_id);
    PERFORM public.ascend_recompute_reading_awards(v_row.user_id, (now() AT TIME ZONE v_tz)::date, v_tz);
  END LOOP;
END $$;

COMMIT;
