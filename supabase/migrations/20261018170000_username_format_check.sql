-- Usernames always have the app's shape (2026-10-18).
--
-- The rule (src/lib/usernameRules.ts USERNAME_PATTERN, ascend_change_username, the
-- sign-in-username Edge Function): 3-20 letters, numbers, _ or -, so never "@", spaces, dots or
-- other signs. The app and the rename RPC already check it; what no server rule covered is the
-- profile INSERT at sign-up and a guest's direct UPDATE at upgrade, so a hand-made request could
-- store a name such as "ali@x" or " zakria" (which also breaks username sign-in).
--
-- Replaces the never-applied optional 20261018120000_username_trimmed_check.sql (this check also
-- refuses leading/trailing spaces). The app's fallback name (authSession.ts, usernameFrom) is
-- cleaned to this shape, and its insert retries a taken name with a number suffix (max 20 chars).
-- Case-insensitive uniqueness stays with the unique index profiles_username_lower_key.
--
-- Live check 2026-10-18 23:05 PKT: 10 profiles, 0 break the rule, so VALIDATE passes.
-- Apply AFTER the production push of the matching app commit.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_trimmed;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[A-Za-z0-9_-]{3,20}$') NOT VALID;

ALTER TABLE public.profiles
  VALIDATE CONSTRAINT profiles_username_format;

-- Verify (read-only):
-- SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname = 'profiles_username_format';
