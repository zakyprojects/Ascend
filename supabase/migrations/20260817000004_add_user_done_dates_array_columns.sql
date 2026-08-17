-- =====================================================================
-- ASCEND ADD user1_done_dates AND user2_done_dates COLUMNS MIGRATION
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =====================================================================

ALTER TABLE public.shared_challenges 
ADD COLUMN IF NOT EXISTS user1_done_dates JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS user2_done_dates JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
