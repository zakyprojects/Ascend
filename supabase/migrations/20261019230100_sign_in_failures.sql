-- Username sign-in brake (security pass M2). The sign-in-username Edge Function signs in from its
-- own address, so Supabase Auth's per-IP limit is one bucket shared by every caller. This keeps a
-- short log of failed username sign-ins, by username and by the caller's IP, and the function
-- answers 429 without calling Auth once either has too many in the window:
--   5 failures per username in 15 minutes, 20 failures per IP in 15 minutes.
-- A wrong password and an unknown username count the same (their answers stay identical). A
-- successful sign-in clears that username's failures. Rows older than an hour are pruned on write.
--
-- Server only: RLS on with no policies, no grants to anon/authenticated; the functions are
-- executable by service_role alone (the Edge Function's admin client).
-- Run BEFORE redeploying sign-in-username (the function treats a missing gate as "not blocked",
-- so the order is not critical, but the brake only works once this exists).

CREATE TABLE IF NOT EXISTS public.sign_in_failures (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key       text NOT NULL CHECK (char_length(key) <= 80), -- 'user:<lowercase username>' or 'ip:<address>'
  failed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sign_in_failures_key_failed_at_idx ON public.sign_in_failures (key, failed_at);
CREATE INDEX IF NOT EXISTS sign_in_failures_failed_at_idx ON public.sign_in_failures (failed_at);

ALTER TABLE public.sign_in_failures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sign_in_failures FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.sign_in_failures_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.sign_in_failures TO service_role;

-- True when this username or this IP has had too many failures in the last 15 minutes.
CREATE OR REPLACE FUNCTION public.ascend_sign_in_blocked(p_username text, p_ip text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT count(*) FROM public.sign_in_failures
      WHERE key = 'user:' || lower(p_username) AND failed_at > now() - interval '15 minutes') >= 5
    OR (
      coalesce(p_ip, '') <> ''
      AND (SELECT count(*) FROM public.sign_in_failures
            WHERE key = 'ip:' || p_ip AND failed_at > now() - interval '15 minutes') >= 20
    );
$$;

-- Records one attempt's outcome: a failure logs the username and the IP; a success clears the
-- username's failures. Prunes rows older than an hour.
CREATE OR REPLACE FUNCTION public.ascend_sign_in_result(p_username text, p_ip text, p_failed boolean)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_failed THEN
    INSERT INTO public.sign_in_failures (key) VALUES ('user:' || lower(p_username));
    IF coalesce(p_ip, '') <> '' THEN
      INSERT INTO public.sign_in_failures (key) VALUES ('ip:' || p_ip);
    END IF;
  ELSE
    DELETE FROM public.sign_in_failures WHERE key = 'user:' || lower(p_username);
  END IF;
  DELETE FROM public.sign_in_failures WHERE failed_at < now() - interval '1 hour';
END;
$$;

REVOKE ALL ON FUNCTION public.ascend_sign_in_blocked(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_sign_in_result(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_sign_in_blocked(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ascend_sign_in_result(text, text, boolean) TO service_role;

-- Verify (read-only):
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sign_in_failures'::regclass;          -- true
--   SELECT has_table_privilege('anon', 'public.sign_in_failures', 'SELECT'),
--          has_table_privilege('authenticated', 'public.sign_in_failures', 'SELECT');             -- false, false
--   SELECT has_function_privilege('anon', 'public.ascend_sign_in_blocked(text,text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.ascend_sign_in_result(text,text,boolean)', 'EXECUTE'); -- false, false
