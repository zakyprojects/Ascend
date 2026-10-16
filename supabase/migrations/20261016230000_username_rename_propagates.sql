-- A rename reaches every row that keeps a copy of the username.
-- partnerships, partner_invites and improvement_plans store the name next to the user id; the app
-- shows those copies and looks partners up by them, so a stale copy showed the old name, put the
-- renamed member on the wrong side of the pair and found no partner stats.
-- Notifications keep the name as it was when they were sent (history), so they are left alone.
-- The trigger fires for every path that changes profiles.username (ascend_change_username and a
-- guest's first username). It runs as the owner because members have no UPDATE on partnerships.
-- The one-time backfill repairs copies that are already stale.

BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_propagate_username()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.partnerships SET user1_username = NEW.username
  WHERE user1_id = NEW.id AND user1_username IS DISTINCT FROM NEW.username;
  UPDATE public.partnerships SET user2_username = NEW.username
  WHERE user2_id = NEW.id AND user2_username IS DISTINCT FROM NEW.username;
  UPDATE public.partner_invites SET from_username = NEW.username
  WHERE from_user_id = NEW.id AND from_username IS DISTINCT FROM NEW.username;
  UPDATE public.partner_invites SET to_username = NEW.username
  WHERE to_user_id = NEW.id AND to_username IS DISTINCT FROM NEW.username;
  UPDATE public.improvement_plans SET creator_username = NEW.username
  WHERE creator_id = NEW.id AND creator_username IS DISTINCT FROM NEW.username;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.profiles_propagate_username() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_propagate_username ON public.profiles;
CREATE TRIGGER profiles_propagate_username
  AFTER UPDATE OF username ON public.profiles
  FOR EACH ROW
  WHEN (OLD.username IS DISTINCT FROM NEW.username AND NEW.username IS NOT NULL)
  EXECUTE FUNCTION public.profiles_propagate_username();

-- Backfill: copies that are already stale.
UPDATE public.partnerships p SET user1_username = pr.username
FROM public.profiles pr
WHERE pr.id = p.user1_id AND pr.username IS NOT NULL AND p.user1_username IS DISTINCT FROM pr.username;
UPDATE public.partnerships p SET user2_username = pr.username
FROM public.profiles pr
WHERE pr.id = p.user2_id AND pr.username IS NOT NULL AND p.user2_username IS DISTINCT FROM pr.username;
UPDATE public.partner_invites i SET from_username = pr.username
FROM public.profiles pr
WHERE pr.id = i.from_user_id AND pr.username IS NOT NULL AND i.from_username IS DISTINCT FROM pr.username;
UPDATE public.partner_invites i SET to_username = pr.username
FROM public.profiles pr
WHERE pr.id = i.to_user_id AND pr.username IS NOT NULL AND i.to_username IS DISTINCT FROM pr.username;
UPDATE public.improvement_plans ip SET creator_username = pr.username
FROM public.profiles pr
WHERE pr.id = ip.creator_id AND pr.username IS NOT NULL AND ip.creator_username IS DISTINCT FROM pr.username;

COMMIT;
