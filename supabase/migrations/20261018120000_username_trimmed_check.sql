-- Usernames are stored trimmed (optional hardening, 2026-10-18).
--
-- Case-insensitive uniqueness is already enforced by the unique index profiles_username_lower_key
-- on lower(username); the rename RPC ascend_change_username trims and checks the format. What no
-- rule covered: the profile INSERT at sign-up and a guest's direct UPDATE (upgrade) could store a
-- name with leading/trailing spaces, which lower() would treat as a different name (" zakria").
-- The app always trims, so this only closes the door for a hand-made request.
--
-- Only trimming is checked, not the full 3–20 [A-Za-z0-9_-] format: the rare sign-up fallback
-- (email.split('@')[0] when the account has no username in its metadata) can hold "." or "+".
--
-- Live check 2026-10-18: 10 profiles, 0 untrimmed, 0 case-insensitive collisions, so VALIDATE passes.
-- No client change depends on this; it can be applied any time.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_trimmed;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_trimmed CHECK (username = btrim(username)) NOT VALID;

ALTER TABLE public.profiles
  VALIDATE CONSTRAINT profiles_username_trimmed;

-- Verify (read-only):
-- SELECT conname, convalidated FROM pg_constraint WHERE conname = 'profiles_username_trimmed';
