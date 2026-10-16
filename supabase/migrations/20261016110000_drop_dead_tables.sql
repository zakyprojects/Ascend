-- Cleanup (2026-10-16): remove database objects the app no longer uses.
-- Tables: nothing in the app reads or writes them (library books live in reading_books).
--   books (old Aug catalog), user_books (0 rows), library_books (0 rows), partner_notifications (0 rows).
-- partner_invites had two identical BEFORE INSERT checks of accept_partner_invites;
-- keep tr_check_partner_invite_allowed (SECURITY DEFINER) and drop the duplicate.
BEGIN;

DROP TABLE IF EXISTS public.user_books;
DROP TABLE IF EXISTS public.books;
DROP TABLE IF EXISTS public.library_books;
DROP TABLE IF EXISTS public.partner_notifications;

DROP TRIGGER IF EXISTS trg_check_accept_partner_invites ON public.partner_invites;
DROP FUNCTION IF EXISTS public.check_accept_partner_invites();

COMMIT;
