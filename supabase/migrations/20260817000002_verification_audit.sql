-- =====================================================================
-- ASCEND PARTNERSHIP INDEX & TIMESTAMP VERIFICATION RPC
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_verification_audit()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_indexes JSONB;
  v_partnerships JSONB;
BEGIN
  -- 1. Query active indexes on public.partnerships
  SELECT jsonb_agg(to_jsonb(idx)) INTO v_indexes
  FROM (
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'partnerships'
  ) idx;

  -- 2. Query all partnership rows for asdf and qwer with paired_at timestamps
  SELECT jsonb_agg(to_jsonb(p)) INTO v_partnerships
  FROM (
    SELECT id, user1_id, user1_username, user2_id, user2_username, paired_at
    FROM public.partnerships
    WHERE (LOWER(user1_username) = 'asdf' AND LOWER(user2_username) = 'qwer')
       OR (LOWER(user1_username) = 'qwer' AND LOWER(user2_username) = 'asdf')
    ORDER BY paired_at ASC
  ) p;

  RETURN jsonb_build_object(
    'active_indexes', COALESCE(v_indexes, '[]'::jsonb),
    'asdf_qwer_partnerships', COALESCE(v_partnerships, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_verification_audit() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
