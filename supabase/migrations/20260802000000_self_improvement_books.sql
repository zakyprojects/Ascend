-- =====================================================================
-- SELF IMPROVEMENT BOOKS MODULE MIGRATION
-- Adds curated library books and user library tracking tables
-- =====================================================================

-- 8. CURATED BOOKS LIBRARY
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

-- 9. USER BOOKS - PER-USER LIBRARY STATUS TRACKING
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
  status TEXT NOT NULL DEFAULT 'to-read',
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
