-- Release-note seen mark (user_data.state -> 'lastSeenRelease' = id of the newest note already shown).
-- The settings doc is saved whole (last write wins), so an older app build that does not know the
-- key, or a device holding a lower mark, could drop or lower it and the note would pop up again.
-- This trigger keeps the server copy from ever going down: a valid stored mark stays unless the new
-- one is a higher whole number. Mirrors mergeLastSeenRelease in src/lib/whatsNew.ts.
-- AFTER the production push (the app works without it; it only guards against older builds).

CREATE OR REPLACE FUNCTION public.ascend_last_seen_release_valid(mark jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT mark IS NOT NULL
     AND jsonb_typeof(mark) = 'number'
     AND (mark #>> '{}') ~ '^[0-9]{1,9}$';
$$;

CREATE OR REPLACE FUNCTION public.ascend_keep_last_seen_release()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_mark jsonb := OLD.state -> 'lastSeenRelease';
  new_mark jsonb := NEW.state -> 'lastSeenRelease';
BEGIN
  IF NEW.state IS NULL OR jsonb_typeof(NEW.state) <> 'object' THEN
    RETURN NEW;
  END IF;
  IF NOT ascend_last_seen_release_valid(old_mark) THEN
    RETURN NEW;
  END IF;

  IF NOT ascend_last_seen_release_valid(new_mark)
     OR (old_mark #>> '{}')::int > (new_mark #>> '{}')::int THEN
    NEW.state := jsonb_set(NEW.state, '{lastSeenRelease}', old_mark, true);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ascend_keep_last_seen_release() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ascend_keep_last_seen_release ON public.user_data;
CREATE TRIGGER ascend_keep_last_seen_release
  BEFORE UPDATE OF state ON public.user_data
  FOR EACH ROW
  EXECUTE FUNCTION public.ascend_keep_last_seen_release();
