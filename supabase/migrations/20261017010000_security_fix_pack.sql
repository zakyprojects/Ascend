-- Security fix pack (audit 2026-10-16).
-- 1. improvement_plans.copy_count is server-derived: distinct other users who follow the plan.
-- 2. improvement_plans.creator_username / creator_avatar always come from the creator's profile.
-- 3. Logged-out (anon) role loses table grants; duplicate RLS policies removed.
-- 4. SECURITY DEFINER functions pin search_path.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Follow count
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ascend_plan_follow_count(p_plan uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT f.user_id)::int
  FROM public.user_plan_follows f
  JOIN public.improvement_plans p ON p.id = f.original_plan_id
  WHERE f.original_plan_id = p_plan
    AND f.user_id <> p.creator_id;
$$;
REVOKE ALL ON FUNCTION public.ascend_plan_follow_count(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ascend_refresh_plan_copy_count(p_plan uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_plan IS NULL THEN
    RETURN;
  END IF;
  PERFORM set_config('ascend.copy_count_sync', 'on', true);
  UPDATE public.improvement_plans
  SET copy_count = public.ascend_plan_follow_count(p_plan)
  WHERE id = p_plan
    AND copy_count IS DISTINCT FROM public.ascend_plan_follow_count(p_plan);
  PERFORM set_config('ascend.copy_count_sync', 'off', true);
END;
$$;
REVOKE ALL ON FUNCTION public.ascend_refresh_plan_copy_count(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.user_plan_follows_sync_copy_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.ascend_refresh_plan_copy_count(OLD.original_plan_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.original_plan_id IS DISTINCT FROM OLD.original_plan_id) THEN
    PERFORM public.ascend_refresh_plan_copy_count(NEW.original_plan_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS user_plan_follows_sync_copy_count ON public.user_plan_follows;
CREATE TRIGGER user_plan_follows_sync_copy_count
AFTER INSERT OR DELETE OR UPDATE OF original_plan_id, user_id ON public.user_plan_follows
FOR EACH ROW EXECUTE FUNCTION public.user_plan_follows_sync_copy_count();

-- Guard: the app can never set copy_count, creator_username or creator_avatar.
CREATE OR REPLACE FUNCTION public.improvement_plans_guard_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_avatar text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.copy_count := 0;
  ELSIF coalesce(current_setting('ascend.copy_count_sync', true), 'off') <> 'on' THEN
    NEW.copy_count := OLD.copy_count;
  END IF;

  SELECT pr.username, pr.avatar INTO v_username, v_avatar
  FROM public.profiles pr
  WHERE pr.id = NEW.creator_id;

  NEW.creator_username := coalesce(v_username, 'Member');
  NEW.creator_avatar := coalesce(v_avatar, '🧑');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS improvement_plans_guard_server_fields ON public.improvement_plans;
CREATE TRIGGER improvement_plans_guard_server_fields
BEFORE INSERT OR UPDATE ON public.improvement_plans
FOR EACH ROW EXECUTE FUNCTION public.improvement_plans_guard_server_fields();

-- Kept for older app builds: now read-only, login required, never increments.
CREATE OR REPLACE FUNCTION public.increment_plan_copy_count(target_plan_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT copy_count FROM public.improvement_plans WHERE id = target_plan_id), 0);
END;
$$;
REVOKE ALL ON FUNCTION public.increment_plan_copy_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_plan_copy_count(uuid) TO authenticated;

-- Backfill every plan to its real count.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.improvement_plans LOOP
    PERFORM public.ascend_refresh_plan_copy_count(r.id);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Creator avatar follows the profile (username already propagates).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profiles_propagate_avatar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.improvement_plans SET creator_avatar = NEW.avatar
  WHERE creator_id = NEW.id AND creator_avatar IS DISTINCT FROM NEW.avatar;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS profiles_propagate_avatar ON public.profiles;
CREATE TRIGGER profiles_propagate_avatar
AFTER UPDATE OF avatar ON public.profiles
FOR EACH ROW WHEN (OLD.avatar IS DISTINCT FROM NEW.avatar)
EXECUTE FUNCTION public.profiles_propagate_avatar();

-- ---------------------------------------------------------------------------
-- 3. Logged-out role: no table access. Guests are authenticated (anonymous sign-in).
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE
  public.improvement_plans,
  public.notifications,
  public.partner_invites,
  public.partnerships,
  public.plan_reflection_notes,
  public.shared_challenges,
  public.user_data,
  public.user_plan_follows
FROM anon;

-- profiles: anon keeps column SELECT only (sign-up username check runs before a session exists).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles FROM anon;

-- Duplicate policies (each pair had an equivalent; the kept one has WITH CHECK where it matters).
DROP POLICY IF EXISTS "Users can delete their own improvement plans" ON public.improvement_plans;
DROP POLICY IF EXISTS "Users can insert their own improvement plans" ON public.improvement_plans;
DROP POLICY IF EXISTS "Public plans viewable by everyone" ON public.improvement_plans;
DROP POLICY IF EXISTS "Users can update their own plans" ON public.improvement_plans;  -- kept: "...improvement plans" (WITH CHECK)

DROP POLICY IF EXISTS "Users can insert their own data" ON public.user_data;
DROP POLICY IF EXISTS "Users can read their own data" ON public.user_data;
DROP POLICY IF EXISTS "Users can update their own user_data" ON public.user_data;      -- kept: "...own data" (WITH CHECK)

DROP POLICY IF EXISTS "Users can access their own followed plans" ON public.user_plan_follows;
DROP POLICY IF EXISTS "Users can update their own followed plans" ON public.user_plan_follows;
CREATE POLICY "Users can update their own followed plans" ON public.user_plan_follows
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Shared challenges editable by partners" ON public.shared_challenges;  -- kept: the one with WITH CHECK

-- ---------------------------------------------------------------------------
-- 4. search_path
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.check_partner_invite_allowed() SET search_path = public;

COMMIT;
