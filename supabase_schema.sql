-- =====================================================================
-- ASCEND APP - SUPABASE DATABASE SCHEMA & ROW-LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  uid VARCHAR(6) UNIQUE,
  email TEXT,
  avatar TEXT DEFAULT '🧑',
  is_profile_public BOOLEAN DEFAULT true,
  last_username_change_at TIMESTAMPTZ DEFAULT NULL,
  total_points INTEGER DEFAULT 0,
  points_history JSONB DEFAULT '[]'::jsonb,
  stats JSONB DEFAULT '{}'::jsonb,
  active_habits JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies:
-- Leaderboards & Discover Plans: Username, avatar, total_points, stats, active_habits are publicly readable by authenticated users.
CREATE POLICY "Public profile fields are viewable by signed-in users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- 1B. USER DATA TABLE (Stores full AppState JSONB per user)
CREATE TABLE IF NOT EXISTS public.user_data (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own user_data"
  ON public.user_data FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own user_data"
  ON public.user_data FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own user_data"
  ON public.user_data FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);


-- 2. SHAREABLE IMPROVEMENT PLANS
CREATE TABLE IF NOT EXISTS public.improvement_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  creator_username TEXT NOT NULL,
  creator_avatar TEXT DEFAULT '🧑',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  is_public BOOLEAN DEFAULT true,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  copy_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.improvement_plans ENABLE ROW LEVEL SECURITY;

-- Improvement Plans Policies:
-- Public plans readable by all signed-in users; Private plans readable only by creator.
CREATE POLICY "Public plans are viewable by all authenticated users"
  ON public.improvement_plans FOR SELECT
  TO authenticated
  USING (is_public = true OR auth.uid() = creator_id);

CREATE POLICY "Users can insert their own plans"
  ON public.improvement_plans FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update their own plans"
  ON public.improvement_plans FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id);

CREATE POLICY "Users can delete their own plans"
  ON public.improvement_plans FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- 3. FOLLOWED PLAN INSTANCES
CREATE TABLE IF NOT EXISTS public.user_plan_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  original_plan_id UUID REFERENCES public.improvement_plans(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_completed BOOLEAN DEFAULT false,
  points_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_plan_follows ENABLE ROW LEVEL SECURITY;

-- Followed Plan Instances Policies: Strictly private to individual user
CREATE POLICY "Users can read their own followed plans"
  ON public.user_plan_follows FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own followed plans"
  ON public.user_plan_follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own followed plans"
  ON public.user_plan_follows FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own followed plans"
  ON public.user_plan_follows FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. PARTNER INVITES & PARTNERSHIPS
CREATE TABLE IF NOT EXISTS public.partner_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_username TEXT NOT NULL,
  from_avatar TEXT DEFAULT '🧑',
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_username TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.partner_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view partner invites sent or received by them"
  ON public.partner_invites FOR SELECT
  TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can send partner invites"
  ON public.partner_invites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can update invites sent to them"
  ON public.partner_invites FOR UPDATE
  TO authenticated
  USING (auth.uid() = to_user_id OR auth.uid() = from_user_id);

-- 5. ACTIVE PARTNERSHIPS
CREATE TABLE IF NOT EXISTS public.partnerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user1_username TEXT NOT NULL,
  user2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user2_username TEXT NOT NULL,
  paired_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user1_partner UNIQUE(user1_id),
  CONSTRAINT unique_user2_partner UNIQUE(user2_id)
);

ALTER TABLE public.partnerships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partnerships viewable only by paired users"
  ON public.partnerships FOR SELECT
  TO authenticated
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Partnerships manageable by paired users"
  ON public.partnerships FOR ALL
  TO authenticated
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- 6. SHARED CHALLENGES
CREATE TABLE IF NOT EXISTS public.shared_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id UUID NOT NULL REFERENCES public.partnerships(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_habit_name TEXT NOT NULL,
  duration_days INTEGER DEFAULT 7,
  joint_streak INTEGER DEFAULT 0,
  user1_done_date DATE,
  user2_done_date DATE,
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'broken'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.shared_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shared challenges readable by partners"
  ON public.shared_challenges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partnerships p
      WHERE p.id = shared_challenges.partnership_id
      AND (p.user1_id = auth.uid() OR p.user2_id = auth.uid())
    )
  );

CREATE POLICY "Shared challenges editable by partners"
  ON public.shared_challenges FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partnerships p
      WHERE p.id = shared_challenges.partnership_id
      AND (p.user1_id = auth.uid() OR p.user2_id = auth.uid())
    )
  );

-- 7. PARTNER NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.partner_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- recipient
  partner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- sender
  partner_username TEXT NOT NULL,
  message TEXT NOT NULL,
  habit_name TEXT,
  type TEXT DEFAULT 'missed_habit',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.partner_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notifications viewable only by recipient"
  ON public.partner_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Notifications insertable by partner"
  ON public.partner_notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = partner_id);

CREATE POLICY "Notifications updatable by recipient"
  ON public.partner_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================================
-- 8. SELF IMPROVEMENT BOOKS - CURATED LIBRARY
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  cover_image_url TEXT,
  is_curated BOOLEAN DEFAULT true,
  points_on_completion INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Curated books are viewable by all authenticated users"
  ON public.books FOR SELECT
  TO authenticated
  USING (is_curated = true);

-- Seed curated self-improvement books
INSERT INTO public.books (id, title, author, description, category, is_curated, points_on_completion) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Atomic Habits', 'James Clear', 'An easy & proven way to build good habits & break bad ones. Tiny changes, remarkable results. Focus on 1% improvements every day.', 'Habits', true, 40),
  ('00000000-0000-0000-0000-000000000002', 'The 7 Habits of Highly Effective People', 'Stephen R. Covey', 'A principle-centered framework for personal and interpersonal effectiveness. Move from dependence to independence to interdependence.', 'Habits', true, 45),
  ('00000000-0000-0000-0000-000000000003', 'Deep Work', 'Cal Newport', 'Rules for focused success in a distracted world. Cultivate the ability to focus without distraction on cognitively demanding tasks.', 'Productivity', true, 35),
  ('00000000-0000-0000-0000-000000000004', 'The Power of Now', 'Eckhart Tolle', 'A guide to spiritual enlightenment. Learn to transcend ego-based thinking and embrace the present moment to find peace and fulfillment.', 'Spirituality', true, 30),
  ('00000000-0000-0000-0000-000000000005', 'Can''t Hurt Me', 'David Goggins', 'Master your mind and defy the odds. A story of extreme perseverance showing how to callous your mind, overcome pain, and reach your full potential.', 'Discipline', true, 50),
  ('00000000-0000-0000-0000-000000000006', 'Think and Grow Rich', 'Napoleon Hill', 'The classic guide to wealth-building philosophy. Thirteen proven steps toward riches and the power of organized, personal initiative.', 'Finance', true, 35),
  ('00000000-0000-0000-0000-000000000007', 'The Subtle Art of Not Giving a F*ck', 'Mark Manson', 'A counterintuitive approach to living a good life. Let go of what you think your life should be and embrace the messiness of reality.', 'Mindset', true, 30),
  ('00000000-0000-0000-0000-000000000008', 'Mindset: The New Psychology of Success', 'Carol S. Dweck', 'How we can learn to fulfill our potential by adopting a growth mindset over a fixed mindset. The power of believing you can improve.', 'Mindset', true, 35),
  ('00000000-0000-0000-0000-000000000009', 'The Alchemist', 'Paulo Coelho', 'A mystical fable about following your dreams. A shepherd boy embarks on a journey to find his personal legend and discovers treasures within.', 'Spirituality', true, 25),
  ('00000000-0000-0000-0000-000000000010', 'Ikigai: The Japanese Secret to a Long and Happy Life', 'Hector Garcia & Francesc Miralles', 'Find your reason for being. The intersection of what you love, what you are good at, what the world needs, and what you can be paid for.', 'Mindset', true, 25),
  ('00000000-0000-0000-0000-000000000011', 'The Compound Effect', 'Darren Hardy', 'Multiplying your success, one simple step at a time. Small, smart, consistent choices + time = radical difference between where you are and where you want to be.', 'Productivity', true, 30),
  ('00000000-0000-0000-0000-000000000012', 'Man''s Search for Meaning', 'Viktor E. Frankl', 'Lessons from a Nazi concentration camp on the importance of finding purpose and meaning in suffering, and how that drives the will to survive.', 'Spirituality', true, 40)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 9. USER BOOKS - PER-USER LIBRARY STATUS TRACKING
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  description TEXT,
  category TEXT,
  cover_image_url TEXT,
  is_custom BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'to-read', -- 'to-read', 'reading', 'completed'
  added_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  points_awarded INTEGER DEFAULT 0,
  linked_book_id TEXT
);

ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own user_books"
  ON public.user_books FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own user_books"
  ON public.user_books FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own user_books"
  ON public.user_books FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own user_books"
  ON public.user_books FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_books_user_id ON public.user_books(user_id);
CREATE INDEX IF NOT EXISTS idx_user_books_status ON public.user_books(status);
