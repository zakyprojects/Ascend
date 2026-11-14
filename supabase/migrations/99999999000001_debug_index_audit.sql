CREATE OR REPLACE FUNCTION public.get_debug_partnership_audit()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_indexes JSONB;
  v_partnerships JSONB;
  v_challenges JSONB;
BEGIN
  SELECT jsonb_agg(to_jsonb(idx)) INTO v_indexes
  FROM (
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'partnerships'
  ) idx;

  SELECT jsonb_agg(to_jsonb(p)) INTO v_partnerships
  FROM public.partnerships p;

  SELECT jsonb_agg(to_jsonb(c)) INTO v_challenges
  FROM public.shared_challenges c;

  RETURN jsonb_build_object(
    'indexes', COALESCE(v_indexes, '[]'::jsonb),
    'partnerships', COALESCE(v_partnerships, '[]'::jsonb),
    'challenges', COALESCE(v_challenges, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_debug_partnership_audit() TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
