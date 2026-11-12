-- Reading: chapters in tenths (1.1 … 1.9, then 2), Zakria 2026-11-12 (idea I3).
--
-- A chapter book is logged in steps of 0.1 chapter; 0.1 chapter = 2 pages = 1 pt; 10 pts a day
-- across all books (unchanged). The amount stays in data jsonb (pagesRead in the log's unit), so no
-- schema change. The app snaps every chapter amount to tenths before it writes, but a value with
-- float noise (an old or buggy client: 1.3 - 1.1 = 0.19999999999999996) would read 3.999… pages
-- and lose a point. This guard rounds a chapter log to its nearest tenth before counting it
-- (round(chapters * 10) * 2 pages); a pages log is read exactly as before. A log already in whole
-- chapters counts the same as before (n * 10 * 2 = n * 20), so no live award changes.
--
-- Only ascend_recompute_reading_awards (4-arg) changes: the body is the live one (read 2026-11-12,
-- snapshot work/snapshots/i3i4-ascend_recompute_reading_awards-2026-11-12.json) with the chapter
-- multiplier above. Same signature, so no overload to drop; grants re-stated as they are live.
-- Mirror: src/lib/points/readingAwards.ts chapterTenths / readingAmountPages / logPageAmount.
-- Compatible with the production app (it writes whole chapters only).

CREATE OR REPLACE FUNCTION public.ascend_recompute_reading_awards(p_user uuid, p_day date, p_tz text, p_floor boolean)
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
  v_first     timestamptz;
  v_kept      text;
  v_kept_amt  numeric;
  v_at        timestamptz;
  v_id        text        := 'reading_award_' || to_char(p_day, 'YYYY-MM-DD');
  v_item      record;
  v_books     jsonb       := '{}'::jsonb; -- per book: running total "t", best "b", owed "d", in pages
  v_total     numeric;
  v_owed      numeric;
  v_best      numeric;
  v_new_best  numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('reading_awards:' || p_user::text || ':' || v_key));

  FOR v_item IN
    SELECT ev.kind, ev.book_id, ev.pages, ev.logged_at
    FROM (
      SELECT 0 AS kind,
             b.id AS book_id,
             l.id AS ord_id,
             -- A chapter log counts in whole tenths of a chapter, 2 pages each (1.3 - 1.1 = 0.19999… = 4 pages).
             CASE WHEN (CASE WHEN lower(l.data->>'unit') IN ('pages', 'chapters') THEN lower(l.data->>'unit')
                             ELSE lower(b.data->>'unit') END) = 'chapters'
                  THEN round(public.ascend_reading_log_pages(l.data) * 10) * 2
                  ELSE public.ascend_reading_log_pages(l.data) END AS pages,
             public.ascend_instant(l.data->>'createdAt') AS logged_at
      FROM public.reading_logs l
      JOIN public.reading_books b
        ON b.user_id = l.user_id AND b.id = l.data->>'bookId' AND b.deleted_at IS NULL
      WHERE l.user_id = p_user
        AND l.deleted_at IS NULL
        AND l.data->>'date' = v_key
        AND (l.data->>'finish') IS DISTINCT FROM 'true'
      UNION ALL
      SELECT 1,
             b.id,
             b.id || '#' || s.ord,
             (s.e->>'pagesAfter')::numeric - (s.e->>'pagesBefore')::numeric,
             public.ascend_instant(s.e->>'at')
      FROM public.reading_books b
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(b.data->'unitSwitches') = 'array' THEN b.data->'unitSwitches' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS s(e, ord)
      WHERE b.user_id = p_user
        AND b.deleted_at IS NULL
        AND jsonb_typeof(s.e) = 'object'
        AND s.e->>'date' = v_key
        AND jsonb_typeof(s.e->'pagesBefore') = 'number'
        AND jsonb_typeof(s.e->'pagesAfter') = 'number'
    ) ev
    ORDER BY ev.logged_at NULLS LAST, ev.kind, ev.ord_id COLLATE "C"
  LOOP
    v_total := coalesce((v_books->v_item.book_id->>'t')::numeric, 0);
    v_best := coalesce((v_books->v_item.book_id->>'b')::numeric, 0);
    v_owed := coalesce((v_books->v_item.book_id->>'d')::numeric, 0);
    IF v_item.kind = 0 OR v_item.pages < 0 THEN
      v_total := v_total + v_item.pages;
    ELSE
      v_total := v_total + least(v_item.pages, v_owed); -- a raising switch only gives back what is owed
    END IF;
    IF v_item.kind = 1 THEN
      v_owed := greatest(v_owed - v_item.pages, 0);
    END IF;
    v_new_best := greatest(v_best, v_total);
    v_pages := v_pages + (v_new_best - v_best);
    v_books := v_books || jsonb_build_object(v_item.book_id, jsonb_build_object('t', v_total, 'b', v_new_best, 'd', v_owed));
    IF v_item.kind = 0 THEN
      v_count := v_count + 1;
      IF v_first IS NULL AND least(floor(v_pages / 2), 10) > 0 THEN
        v_first := coalesce(v_item.logged_at, now());
      END IF;
    END IF;
  END LOOP;

  v_used := least(floor(v_pages / 2), 10)::int;

  SELECT pe.data->>'timestamp',
         CASE WHEN jsonb_typeof(pe.data->'amount') = 'number' THEN (pe.data->>'amount')::numeric END
  INTO v_kept, v_kept_amt
  FROM public.point_entries pe
  WHERE pe.user_id = p_user AND pe.id = v_id AND pe.deleted_at IS NULL;

  IF p_floor AND v_used <= coalesce(v_kept_amt, 0) THEN
    RETURN; -- an earlier day never drops
  END IF;

  IF v_used > 0 THEN
    v_at := least(greatest(v_first, v_day_start), now(), v_day_end - interval '1 millisecond');
    INSERT INTO public.point_entries AS pe (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', v_used,
      'reason', 'Pages logged (' || v_count || ')',
      'source', 'reading',
      'timestamp', coalesce(v_kept, to_char(v_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
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

  IF p_floor THEN
    RETURN; -- never takes anything away from an earlier day
  END IF;

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

REVOKE ALL ON FUNCTION public.ascend_recompute_reading_awards(uuid, date, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_recompute_reading_awards(uuid, date, text, boolean) TO service_role;
