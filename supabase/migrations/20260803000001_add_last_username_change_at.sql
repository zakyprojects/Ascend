-- =====================================================================
-- Migration: Add last_username_change_at to public.profiles table
-- =====================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_username_change_at TIMESTAMPTZ DEFAULT NULL;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
