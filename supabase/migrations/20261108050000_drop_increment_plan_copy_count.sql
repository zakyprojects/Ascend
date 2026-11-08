-- increment_plan_copy_count has had no caller since the 2026-10-16 security fix pack
-- (copy_count is derived by the user_plan_follows trigger; the client RPC call was removed).
-- Drop it so signed-in users can no longer call an unused SECURITY DEFINER function.
-- Prod-compatible: the production client (9ce3e5b) never calls it.
DROP FUNCTION IF EXISTS public.increment_plan_copy_count(uuid);
