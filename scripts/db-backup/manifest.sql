-- DB backup manifest: one fact per line, "section<TAB>key<TAB>value".
-- The backup job runs it on the live database inside the same snapshot as the dumps; the
-- restore-test job runs it again on the restored copy, and the two outputs must be identical.
-- Lines in section "realtime" exist only live (a public-schema dump has no publication).
-- psql variable :excluded = space-separated public tables whose rows are not backed up.

WITH tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
),
funcs AS (
  SELECT p.oid, p.oid::regprocedure::text AS sig
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
),
api_roles(role) AS (VALUES ('anon'), ('authenticated'), ('service_role'))

SELECT section, key, value FROM (
  -- Exact row counts
  SELECT 'rows' AS section, 'public.' || relname AS key,
         CASE WHEN relname = ANY (string_to_array(:'excluded', ' ')) THEN 'data not backed up'
              ELSE (xpath('/row/n/text()',
                    query_to_xml(format('SELECT count(*) AS n FROM public.%I', relname), false, true, '')))[1]::text
         END AS value
  FROM tables
  UNION ALL SELECT 'rows', 'auth.users', count(*)::text FROM auth.users
  UNION ALL SELECT 'rows', 'auth.identities', count(*)::text FROM auth.identities

  -- Object counts in public (extension members excluded)
  UNION ALL SELECT 'objects', 'tables', count(*)::text FROM tables
  UNION ALL SELECT 'objects', 'tables with RLS on', count(*)::text FROM tables WHERE relrowsecurity
  UNION ALL SELECT 'objects', 'functions', count(*)::text FROM funcs
  UNION ALL SELECT 'objects', 'triggers', count(*)::text
            FROM pg_trigger tg JOIN tables t ON t.oid = tg.tgrelid WHERE NOT tg.tgisinternal
  UNION ALL SELECT 'objects', 'auth.users/identities triggers', count(*)::text
            FROM pg_trigger WHERE tgrelid IN ('auth.users'::regclass, 'auth.identities'::regclass) AND NOT tgisinternal
  UNION ALL SELECT 'objects', 'policies', count(*)::text FROM pg_policy po JOIN tables t ON t.oid = po.polrelid
  UNION ALL SELECT 'objects', 'indexes', count(*)::text FROM pg_index i JOIN tables t ON t.oid = i.indrelid
  UNION ALL SELECT 'objects', 'views', count(*)::text
            FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('v', 'm')
  UNION ALL SELECT 'objects', 'sequences', count(*)::text
            FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'S'

  -- What the API roles may do: table, column and function privileges
  UNION ALL
  SELECT 'grant', format('table %s %s', t.relname, r.role),
         coalesce(string_agg(p.priv, ',' ORDER BY p.priv) FILTER (WHERE has_table_privilege(r.role, t.oid, p.priv)), '-')
  FROM tables t CROSS JOIN api_roles r
       CROSS JOIN unnest(ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']) AS p(priv)
  GROUP BY t.relname, r.role
  UNION ALL
  SELECT 'grant', format('column %s.%s %s', t.relname, a.attname, r.role),
         coalesce(string_agg(p.priv, ',' ORDER BY p.priv)
                  FILTER (WHERE has_column_privilege(r.role, t.oid, a.attnum, p.priv)), '-')
  FROM tables t JOIN pg_attribute a ON a.attrelid = t.oid AND a.attacl IS NOT NULL
       CROSS JOIN api_roles r CROSS JOIN unnest(ARRAY['INSERT', 'SELECT', 'UPDATE']) AS p(priv)
  GROUP BY t.relname, a.attname, r.role
  UNION ALL
  SELECT 'grant', format('function %s %s', f.sig, r.role),
         CASE WHEN has_function_privilege(r.role, f.oid, 'EXECUTE') THEN 'EXECUTE' ELSE '-' END
  FROM funcs f CROSS JOIN api_roles r

  -- Realtime publication (live only; restore-test checks that each table exists)
  UNION ALL
  SELECT 'realtime', schemaname || '.' || tablename, 'published'
  FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
) m
ORDER BY section COLLATE "C", key COLLATE "C";
