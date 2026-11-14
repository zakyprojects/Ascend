-- =====================================================================
-- ASCEND DUPLICATE PARTNERSHIP CLEANUP & PACT RE-PARENTING MIGRATION
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =====================================================================

DO $$
DECLARE
  r RECORD;
  v_canonical_id UUID;
  v_dup_ids UUID[];
BEGIN
  -- Find pairs of users who have more than 1 active partnership row
  FOR r IN (
    SELECT 
      LEAST(LOWER(user1_username), LOWER(user2_username)) AS u1,
      GREATEST(LOWER(user1_username), LOWER(user2_username)) AS u2,
      ARRAY_AGG(id ORDER BY paired_at ASC, id ASC) AS ids,
      COUNT(*) AS cnt
    FROM public.partnerships
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
  ) LOOP
    v_canonical_id := r.ids[1];
    v_dup_ids := r.ids[2:ARRAY_LENGTH(r.ids, 1)];

    RAISE NOTICE 'Consolidating duplicate partnerships for pair %, %: keeping %, deleting %', 
      r.u1, r.u2, v_canonical_id, v_dup_ids;

    -- 1. Re-parent all shared challenges from duplicate partnership IDs to canonical ID
    UPDATE public.shared_challenges
    SET partnership_id = v_canonical_id
    WHERE partnership_id = ANY(v_dup_ids);

    -- 2. Delete duplicate secondary partnership rows
    DELETE FROM public.partnerships
    WHERE id = ANY(v_dup_ids);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
