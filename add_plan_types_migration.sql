-- Migration: Add 3 new plan types to improvement_plans table (Phase B)

ALTER TABLE public.improvement_plans 
ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'milestone',
ADD COLUMN IF NOT EXISTS target_value numeric,
ADD COLUMN IF NOT EXISTS target_unit text,
ADD COLUMN IF NOT EXISTS current_progress numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS target_date text,
ADD COLUMN IF NOT EXISTS cadence text,
ADD COLUMN IF NOT EXISTS duration integer,
ADD COLUMN IF NOT EXISTS start_date text,
ADD COLUMN IF NOT EXISTS streak_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_completed_date text,
ADD COLUMN IF NOT EXISTS target_review_date text,
ADD COLUMN IF NOT EXISTS reflection_notes jsonb DEFAULT '[]'::jsonb;

-- Ensure plan_type defaults to 'milestone' for existing nulls
UPDATE public.improvement_plans 
SET plan_type = 'milestone' 
WHERE plan_type IS NULL;
