-- A follower's copy of a public plan keeps the link it was made with: original_plan_id (which
-- plan's copy_count it counts toward) and steps.sourceUsername (the "by <creator>" label).
-- Before this, a raw API PATCH on one's own row could point it at any plan id (even a private one,
-- since the FK ignores RLS) or set any label.
--
-- Rules (only for calls made with a user session; cron / service / SQL editor pass through):
--   * INSERT of a new row: original_plan_id must be another user's public plan, else it is set to
--     NULL (no RAISE: a plan made private between Discover and Copy must not leave the copy's save
--     retrying forever). sourceUsername is set from the plan's creator_username (NULL if unlinked).
--   * INSERT whose id already exists: the client saves with upsert, so BEFORE INSERT fires on every
--     re-save; such rows pass here and the UPDATE branch below guards the ON CONFLICT update.
--   * UPDATE: original_plan_id may only change to NULL (the FK's ON DELETE SET NULL runs as an
--     UPDATE in the plan creator's session when a copied plan is deleted). steps.sourceUsername
--     keeps its stored value (JSON null for older rows saved without it; the app then shows the
--     plan's live creator name, as before).
-- The shipped client never changes either field after the first save, so normal saves are untouched.

CREATE OR REPLACE FUNCTION public.user_plan_follows_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_creator text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.user_plan_follows f WHERE f.id = NEW.id) THEN
      RETURN NEW;
    END IF;
    IF NEW.original_plan_id IS NOT NULL THEN
      SELECT p.creator_username INTO v_creator
      FROM public.improvement_plans p
      WHERE p.id = NEW.original_plan_id AND p.is_public AND p.creator_id <> v_uid;
      IF NOT FOUND THEN
        NEW.original_plan_id := NULL;
      END IF;
    END IF;
    IF jsonb_typeof(NEW.steps) = 'object' THEN
      NEW.steps := jsonb_set(NEW.steps, '{sourceUsername}', coalesce(to_jsonb(v_creator), 'null'::jsonb));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.original_plan_id IS NOT NULL AND NEW.original_plan_id IS DISTINCT FROM OLD.original_plan_id THEN
    NEW.original_plan_id := OLD.original_plan_id;
  END IF;
  IF jsonb_typeof(OLD.steps) = 'object' AND jsonb_typeof(NEW.steps) = 'object' THEN
    NEW.steps := jsonb_set(NEW.steps, '{sourceUsername}', coalesce(OLD.steps -> 'sourceUsername', 'null'::jsonb));
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.user_plan_follows_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_plan_follows_guard() TO service_role;

DROP TRIGGER IF EXISTS user_plan_follows_guard ON public.user_plan_follows;
CREATE TRIGGER user_plan_follows_guard
  BEFORE INSERT OR UPDATE ON public.user_plan_follows
  FOR EACH ROW EXECUTE FUNCTION public.user_plan_follows_guard();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS user_plan_follows_guard ON public.user_plan_follows;
-- DROP FUNCTION IF EXISTS public.user_plan_follows_guard();
