-- Rank-up celebration memory (user_data.state -> 'rankCelebrated' = {season, tierIndex}).
-- The settings doc is saved whole (last write wins), so a device holding an older memory, or an
-- older app build that drops the key, could lower it and a fresh browser would replay a rank-up.
-- This trigger keeps the server copy from ever going down: the newer season wins, within a season
-- the higher tierIndex. Mirrors mergeRankCelebrated in src/lib/rankCelebration.ts.

CREATE OR REPLACE FUNCTION public.ascend_rank_celebrated_valid(memory jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT memory IS NOT NULL
     AND jsonb_typeof(memory) = 'object'
     AND jsonb_typeof(memory -> 'season') = 'number'
     AND jsonb_typeof(memory -> 'tierIndex') = 'number'
     AND (memory ->> 'season') ~ '^[0-9]+$'
     AND (memory ->> 'tierIndex') ~ '^[0-9]+$';
$$;

CREATE OR REPLACE FUNCTION public.ascend_keep_rank_celebrated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_memory jsonb := OLD.state -> 'rankCelebrated';
  new_memory jsonb := NEW.state -> 'rankCelebrated';
BEGIN
  IF NEW.state IS NULL OR jsonb_typeof(NEW.state) <> 'object' THEN
    RETURN NEW;
  END IF;
  IF NOT ascend_rank_celebrated_valid(old_memory) THEN
    RETURN NEW;
  END IF;

  IF NOT ascend_rank_celebrated_valid(new_memory)
     OR (old_memory ->> 'season')::bigint > (new_memory ->> 'season')::bigint
     OR ((old_memory ->> 'season')::bigint = (new_memory ->> 'season')::bigint
         AND (old_memory ->> 'tierIndex')::int > (new_memory ->> 'tierIndex')::int) THEN
    NEW.state := jsonb_set(NEW.state, '{rankCelebrated}', old_memory, true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ascend_keep_rank_celebrated ON public.user_data;
CREATE TRIGGER ascend_keep_rank_celebrated
  BEFORE UPDATE OF state ON public.user_data
  FOR EACH ROW
  EXECUTE FUNCTION public.ascend_keep_rank_celebrated();
