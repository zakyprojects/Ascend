-- Book finish bonus 15 -> 20 for bonuses given from now on (Zakria 2026-11-13 16:50 PKT, "sirf new wali ko").
-- Mode A: knowledge/mode-a-reading-bonus-20-2026-11-13.md.
--
-- Only the amount of a NEW reading_bonus_<book> row changes. A row already written keeps its amount:
-- the function returns before the INSERT whenever the book's row exists (live or deleted), and the
-- INSERT is ON CONFLICT DO NOTHING, so no recompute path (book or log edit, re-finish, delete,
-- restore) ever rewrites an existing row. Gates (5 log days, first log 7+ days ago, decided on the
-- finishing day) and the 13-day cooldown are unchanged. Mirrors src/lib/points/pointsConfig.ts
-- READING_POINTS.completionBonus.
--
-- Body is the live definition (pg_get_functiondef, re-read 2026-11-13) with only that literal and its
-- comment changed. Same signature, so CREATE OR REPLACE leaves no overload; SECURITY DEFINER and
-- search_path as live; grants restated: owner and service_role only. No table, data or cron change.
-- Rollback: work/snapshots/reading-bonus-20-2026-11-13/ascend_recompute_reading_bonus.live.sql.

BEGIN;

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
  v_tz    text;
  v_done  date;
BEGIN
  IF p_book IS NULL THEN
    RETURN;
  END IF;
  -- Per user, so two books finished at once cannot both pass the cooldown check.
  PERFORM pg_advisory_xact_lock(hashtext('reading_bonus:' || p_user::text));

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

  -- Decided on the finishing day (local day of completedAt): a book that missed it never gets it later.
  v_tz := public.ascend_user_timezone(p_user);
  IF coalesce(v_book.data->>'completedAt', '') ~ '^\d{4}-\d{2}-\d{2}T' THEN
    BEGIN
      v_done := ((v_book.data->>'completedAt')::timestamptz AT TIME ZONE v_tz)::date;
    EXCEPTION WHEN others THEN
      v_done := NULL;
    END;
  END IF;
  IF v_done IS DISTINCT FROM p_today THEN
    RETURN;
  END IF;

  -- Cooldown: finish bonuses at least 13 local days apart (READING_BONUS_COOLDOWN_DAYS).
  IF EXISTS (
    SELECT 1 FROM public.point_entries pe
    WHERE pe.user_id = p_user
      AND pe.id LIKE 'reading\_bonus\_%'
      AND pe.id <> v_id
      AND pe.deleted_at IS NULL
      AND jsonb_typeof(pe.data->'amount') = 'number'
      AND (pe.data->>'amount')::numeric > 0
      AND (pe.created_at AT TIME ZONE v_tz)::date > p_today - 13
  ) THEN
    RETURN;
  END IF;

  IF v_days >= 5 AND v_first <= to_char(p_today - 7, 'YYYY-MM-DD') THEN -- READING_BONUS_MIN_*
    INSERT INTO public.point_entries (user_id, id, data, created_at, updated_at)
    VALUES (p_user, v_id, jsonb_build_object(
      'id', v_id,
      'amount', 20, -- READING_POINTS.completionBonus (15 before 2026-11-13; rows written then keep 15)
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
GRANT EXECUTE ON FUNCTION public.ascend_recompute_reading_bonus(uuid, text, date) TO service_role;

COMMIT;
