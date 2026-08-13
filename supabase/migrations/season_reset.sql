-- Migration: 90-Day Season Reset & Trophy Cabinet
-- Description: Adds season_history JSONB column to profiles and creates idempotent execute_season_reset RPC.

-- 1. Ensure season_history column exists on public.profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS season_history JSONB DEFAULT '[]'::jsonb;

-- 2. Create or replace RPC function for executing a 90-Day Season Reset
CREATE OR REPLACE FUNCTION public.execute_season_reset(p_season_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Idempotently update profiles:
  -- Only update profiles with points and where p_season_name does NOT already exist in season_history.
  UPDATE public.profiles
  SET 
    season_history = COALESCE(season_history, '[]'::jsonb) || jsonb_build_object(
      'seasonName', p_season_name,
      'points', COALESCE(total_points, 0),
      'date', CURRENT_DATE::text
    ),
    total_points = 0
  WHERE COALESCE(total_points, 0) > 0
    AND NOT EXISTS (
      SELECT 1 
      FROM jsonb_array_elements(COALESCE(season_history, '[]'::jsonb)) AS elem 
      WHERE elem->>'seasonName' = p_season_name
    );
END;
$$;
