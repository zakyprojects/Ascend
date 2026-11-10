-- AUTH-M1 one-off repair (audit 2026-11-10). Run AFTER 20261110130000_profiles_terms_fill_when_empty.sql.
--
-- The one profile found with an empty Terms stamp although its auth user agreed (Google sign-up of
-- 2026-11-01, auth metadata terms_version '2026-10-20'): profile 166993fa-fd8c-49b9-8115-2f6d1f852782.
-- A no-op touch of that row lets the new trigger fill terms_version and terms_accepted_at from
-- auth.users; nothing else in the row changes. If the profile was already healed by a normal update,
-- the WHERE matches nothing.

UPDATE public.profiles
   SET terms_version = NULL
 WHERE id = '166993fa-fd8c-49b9-8115-2f6d1f852782'
   AND terms_version IS NULL;

-- Verify (read-only): expect terms_version '2026-10-20', terms_accepted_at 2026-11-01 11:31:57 UTC,
-- and no profile left with NULL whose auth metadata has a version:
--   SELECT p.id, p.terms_version, p.terms_accepted_at FROM public.profiles p
--   JOIN auth.users u ON u.id = p.id
--   WHERE p.terms_version IS NULL AND nullif(btrim(u.raw_user_meta_data->>'terms_version'), '') IS NOT NULL;
