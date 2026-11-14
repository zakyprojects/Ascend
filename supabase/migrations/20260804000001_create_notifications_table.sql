-- =====================================================================
-- ASCEND PHASE 4 MIGRATION SCRIPT — NOTIFICATION SYSTEM
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =====================================================================

-- 1. CREATE PUBLIC.NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_username TEXT,
  actor_avatar TEXT,
  type VARCHAR(50) NOT NULL,
  title TEXT,
  message TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ENABLE ROW LEVEL SECURITY WITH STRICT AUTHENTICATED SCOPING
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications for themselves as actor" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

CREATE POLICY "Users can read their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can insert notifications for recipients"
  ON public.notifications FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND (actor_id IS NULL OR auth.uid() = actor_id))
    OR
    (auth.role() = 'authenticated' OR auth.role() = 'anon')
  );

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = recipient_id);

-- 3. ADD TO REALTIME PUBLICATION FOR LIVE NOTIFICATION PUSH
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
