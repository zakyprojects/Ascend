-- =====================================================================
-- ASCEND PROFILES MISSING STATS COLUMNS MIGRATION
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =====================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS user1_allow_stats BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS user2_allow_stats BOOLEAN DEFAULT TRUE;
