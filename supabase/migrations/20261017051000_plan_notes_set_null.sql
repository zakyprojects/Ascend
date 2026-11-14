-- Deleting a plan (or its creator's account) must not delete other users'
-- reflection notes that point at it. Keep the notes and clear the link.
-- original_plan_id is already nullable; the client never reads notes back
-- from this table (notes live in the user_data blob).

BEGIN;

ALTER TABLE public.plan_reflection_notes
  DROP CONSTRAINT IF EXISTS plan_reflection_notes_original_plan_id_fkey;

ALTER TABLE public.plan_reflection_notes
  ADD CONSTRAINT plan_reflection_notes_original_plan_id_fkey
  FOREIGN KEY (original_plan_id) REFERENCES public.improvement_plans(id) ON DELETE SET NULL;

COMMIT;
