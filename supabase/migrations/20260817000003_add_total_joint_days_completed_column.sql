-- =====================================================================
-- ASCEND ADD total_joint_days_completed COLUMN MIGRATION
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =====================================================================

ALTER TABLE public.shared_challenges 
ADD COLUMN IF NOT EXISTS total_joint_days_completed INTEGER DEFAULT 0;

NOTIFY pgrst, 'reload schema';
