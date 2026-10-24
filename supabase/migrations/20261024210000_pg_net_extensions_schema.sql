-- Move the pg_net extension registration out of schema public (Security Advisor
-- "extension in public"). pg_net is not relocatable, so it is dropped and
-- re-created in schema extensions. Its objects stay in schema net; the only
-- caller, public.notifications_send_push(), calls net.http_post by name.
-- Applied live 2026-10-24 15:10 UTC; net ACLs verified identical afterwards.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension
    WHERE extname = 'pg_net' AND extnamespace = 'public'::regnamespace
  ) THEN
    DROP EXTENSION pg_net;
    CREATE EXTENSION pg_net WITH SCHEMA extensions;
  ELSIF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net WITH SCHEMA extensions;
  END IF;
END
$$;
