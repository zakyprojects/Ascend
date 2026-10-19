-- Reading: a book's unit ("Count in": pages / chapters) is fixed once the book has any live
-- reading log (Zakria 2026-10-19). The app disables the choice and its store ignores a change;
-- this guard keeps the saved unit for any app write that still changes it (another device that
-- had not seen the logs yet, or an old app), so logged pages never turn into chapters (1 chapter
-- = 10 points) or back. The rest of the update goes through; the device pulls the row back.
-- Finish logs count; deleted logs do not. Only the app's roles are guarded.
-- src/lib/readingAwards.ts isBookUnitLocked is the client mirror.
-- Run BEFORE the studio test.

BEGIN;

CREATE OR REPLACE FUNCTION public.reading_books_keep_unit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated')
     OR NEW.data->'unit' IS NOT DISTINCT FROM OLD.data->'unit'
     OR NOT EXISTS (
       SELECT 1 FROM public.reading_logs l
       WHERE l.user_id = OLD.user_id AND l.data->>'bookId' = OLD.id AND l.deleted_at IS NULL
     )
  THEN
    RETURN NEW;
  END IF;
  NEW.data := CASE
    WHEN OLD.data ? 'unit' THEN jsonb_set(NEW.data, '{unit}', OLD.data->'unit')
    ELSE NEW.data - 'unit'
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.reading_books_keep_unit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER reading_books_keep_unit BEFORE UPDATE ON public.reading_books
  FOR EACH ROW EXECUTE FUNCTION public.reading_books_keep_unit();

COMMIT;
