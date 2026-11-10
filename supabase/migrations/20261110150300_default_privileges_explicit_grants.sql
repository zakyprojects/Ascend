-- GLB-L8 (audit 2026-11-10; suggested 10-19 as L4): new public tables, sequences and functions are
-- no longer open to anon/authenticated by default.
--
-- Why: pg_default_acl for role postgres in schema public gives anon and authenticated
-- arwdDxtm on every new table, rwU on every new sequence and EXECUTE on every new function, and
-- Postgres' built-in default gives EXECUTE on new functions to PUBLIC. Every current object is
-- closed only because each migration revokes by hand; one forgotten REVOKE on a new SECURITY
-- DEFINER function or table opens it to anyone with the public key.
--
-- What changes: ONLY objects created after this runs (by role postgres, which owns every app
-- object; the Management API / SQL editor run as postgres). Existing tables, sequences and
-- functions keep exactly their grants: nothing the app or production 1.2.0 uses today changes.
-- From then on each migration must GRANT what the app needs (tables: SELECT/INSERT/UPDATE to
-- authenticated; functions the app calls: EXECUTE to authenticated, or anon for signed-out use;
-- functions used inside RLS policies or SECURITY INVOKER code called by members also need EXECUTE).
-- A forgotten GRANT now fails closed (permission denied in the studio test) instead of open.
-- The function REVOKE FROM PUBLIC is role-wide (all schemas) because the PUBLIC default is the
-- built-in one, which a schema-level entry cannot take away. supabase_admin's own defaults can't be
-- changed by postgres and are not needed (app objects are owned by postgres).
--
-- Order: any time. Must be applied as role postgres.
--
-- Rollback (exact):
--   BEGIN;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   COMMIT;

BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;

-- Verify (read-only):
--   SELECT defaclnamespace::regnamespace, defaclobjtype, defaclacl FROM pg_default_acl
--   WHERE defaclrole = 'postgres'::regrole AND defaclnamespace IN (0, 'public'::regnamespace);
--     -- public r/S/f: postgres + service_role only; global (namespace 0) f: {postgres=X/postgres} (no PUBLIC)
