-- Deleting a book takes back a finish bonus the app gave before server bonuses
-- (Zakria 2026-10-15, browser test of 20261015160000: deleting such a book kept its bonus).
-- Those old bonus rows carry no book id, so 20261015160000 left them in place. Now:
--   * Each deleted marker row (metadata.legacyMarker) records the bonus the app gave the book
--     (the book's pointsAwarded, as the app used to subtract on delete) as metadata.legacyAmount.
--   * When such a book is deleted, its marker row comes back as a minus row of that amount
--     ("Book deleted: <title>"), once. A bonus the server gave is still just removed.
--   * Books already deleted since 20261015160000 (3 on asdf) get their minus row now.
-- src/lib/store.ts deleteBook writes the same minus row (shown at once, never uploaded).

BEGIN;

-- 1. The bonus the app gave each marked book (deleted books included).
UPDATE public.point_entries pe
SET data = jsonb_set(pe.data, '{metadata,legacyAmount}', to_jsonb((b.data->>'pointsAwarded')::numeric)),
    updated_at = greatest(now(), pe.updated_at)
FROM public.reading_books b
WHERE pe.user_id = b.user_id
  AND pe.id = 'reading_bonus_' || b.id
  AND (pe.data->'metadata'->>'legacyMarker') = 'true'
  AND pe.data->'metadata'->'legacyAmount' IS NULL
  AND jsonb_typeof(b.data->'pointsAwarded') = 'number'
  AND (b.data->>'pointsAwarded')::numeric > 0;

-- 2. One book's finish bonus: given once when the gates pass; when the book is deleted, a
--    server bonus is removed and an app-given (legacy) bonus is taken back with a minus row.
CREATE OR REPLACE FUNCTION public.ascend_recompute_reading_bonus(p_user uuid, p_book text, p_today date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id    text := 'reading_bonus_' || p_book;
  v_book  record;
  v_row   record;
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

  SELECT pe.data, pe.deleted_at INTO v_row
  FROM public.point_entries pe WHERE pe.user_id = p_user AND pe.id = v_id;

  IF v_book.deleted_at IS NOT NULL THEN
    IF v_row.data IS NULL THEN
      RETURN;
    ELSIF (v_row.data->'metadata'->>'legacyMarker') = 'true' THEN
      IF v_row.deleted_at IS NOT NULL
         AND jsonb_typeof(v_row.data->'metadata'->'legacyAmount') = 'number'
         AND (v_row.data->'metadata'->>'legacyAmount')::numeric > 0
      THEN
        UPDATE public.point_entries pe
        SET data = jsonb_build_object(
              'id', v_id,
              'amount', -((v_row.data->'metadata'->>'legacyAmount')::numeric),
              'reason', 'Book deleted: ' || coalesce(nullif(v_book.data->>'title', ''), 'Book'),
              'source', 'reading_bonus',
              'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'metadata', jsonb_build_object(
                'bookId', p_book, 'legacyMarker', true,
                'legacyAmount', (v_row.data->'metadata'->>'legacyAmount')::numeric)),
            deleted_at = NULL,
            updated_at = greatest(now(), pe.updated_at)
        WHERE pe.user_id = p_user AND pe.id = v_id;
      END IF;
    ELSIF v_row.deleted_at IS NULL THEN
      UPDATE public.point_entries pe
      SET deleted_at = now(), updated_at = greatest(now(), pe.updated_at)
      WHERE pe.user_id = p_user AND pe.id = v_id;
    END IF;
    RETURN;
  END IF;

  IF v_book.data->>'status' IS DISTINCT FROM 'completed' OR v_row.data IS NOT NULL THEN
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

REVOKE ALL ON FUNCTION public.ascend_recompute_reading_bonus(uuid, text, date) FROM PUBLIC, anon, authenticated;

-- 3. Marked books already deleted get their minus row now.
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT b.user_id, b.id FROM public.reading_books b
    JOIN public.point_entries pe ON pe.user_id = b.user_id AND pe.id = 'reading_bonus_' || b.id
    WHERE b.deleted_at IS NOT NULL AND (pe.data->'metadata'->>'legacyMarker') = 'true'
  LOOP
    PERFORM public.ascend_recompute_reading_bonus(
      v_row.user_id, v_row.id, (now() AT TIME ZONE public.ascend_user_timezone(v_row.user_id))::date);
  END LOOP;
END $$;

COMMIT;
