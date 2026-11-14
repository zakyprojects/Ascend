-- Batch #8 S6: RLS policies evaluate auth.uid() once per query, not once per row.
-- Same meaning: every bare auth.uid() in these 25 legacy policies (8 tables) becomes (select auth.uid()),
-- the form the 25 sync tables already use. Roles, commands and permissive mode are unchanged
-- (ALTER POLICY only replaces the expressions). No data change.

ALTER POLICY "Public plans are viewable by all authenticated users" ON public.improvement_plans
  USING (((is_public = true) OR ((select auth.uid()) = creator_id)));

ALTER POLICY "Users can delete their own plans" ON public.improvement_plans
  USING (((select auth.uid()) = creator_id));

ALTER POLICY "Users can insert their own plans" ON public.improvement_plans
  WITH CHECK (((select auth.uid()) = creator_id));

ALTER POLICY "Users can update their own improvement plans" ON public.improvement_plans
  USING (((select auth.uid()) = creator_id))
  WITH CHECK (((select auth.uid()) = creator_id));

ALTER POLICY "Users can delete their own notifications" ON public.notifications
  USING (((select auth.uid()) = recipient_id));

ALTER POLICY "Users can read their own notifications" ON public.notifications
  USING (((select auth.uid()) = recipient_id));

ALTER POLICY "Users can update their own notifications" ON public.notifications
  USING (((select auth.uid()) = recipient_id));

ALTER POLICY "Users can delete their own partner invites" ON public.partner_invites
  USING ((((select auth.uid()) = from_user_id) OR ((select auth.uid()) = to_user_id)));

ALTER POLICY "Users can select their own partner invites" ON public.partner_invites
  USING ((((select auth.uid()) = from_user_id) OR ((select auth.uid()) = to_user_id)));

ALTER POLICY "Users can delete their own partnerships" ON public.partnerships
  USING ((((select auth.uid()) = user1_id) OR ((select auth.uid()) = user2_id)));

ALTER POLICY "Users can select their own partnerships" ON public.partnerships
  USING ((((select auth.uid()) = user1_id) OR ((select auth.uid()) = user2_id)));

ALTER POLICY "Users can delete their own profile" ON public.profiles
  USING (((select auth.uid()) = id));

ALTER POLICY "Users can insert their own profile" ON public.profiles
  WITH CHECK (((select auth.uid()) = id));

ALTER POLICY "Users can update their own profile" ON public.profiles
  USING (((select auth.uid()) = id));

ALTER POLICY "Members add shared challenges" ON public.shared_challenges
  WITH CHECK ((EXISTS ( SELECT 1
   FROM partnerships p
  WHERE ((p.id = shared_challenges.partnership_id) AND ((p.user1_id = (select auth.uid())) OR (p.user2_id = (select auth.uid())))))));

ALTER POLICY "Members read their shared challenges" ON public.shared_challenges
  USING ((EXISTS ( SELECT 1
   FROM partnerships p
  WHERE ((p.id = shared_challenges.partnership_id) AND ((p.user1_id = (select auth.uid())) OR (p.user2_id = (select auth.uid())))))));

ALTER POLICY "Members update their shared challenges" ON public.shared_challenges
  USING ((EXISTS ( SELECT 1
   FROM partnerships p
  WHERE ((p.id = shared_challenges.partnership_id) AND ((p.user1_id = (select auth.uid())) OR (p.user2_id = (select auth.uid())))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM partnerships p
  WHERE ((p.id = shared_challenges.partnership_id) AND ((p.user1_id = (select auth.uid())) OR (p.user2_id = (select auth.uid())))))));

ALTER POLICY "Users can delete their own data" ON public.user_data
  USING (((select auth.uid()) = user_id));

ALTER POLICY "Users can insert their own user_data" ON public.user_data
  WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "Users can read their own user_data" ON public.user_data
  USING (((select auth.uid()) = user_id));

ALTER POLICY "Users can update their own data" ON public.user_data
  USING (((select auth.uid()) = user_id))
  WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "Users can delete their own followed plans" ON public.user_plan_follows
  USING (((select auth.uid()) = user_id));

ALTER POLICY "Users can insert their own followed plans" ON public.user_plan_follows
  WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "Users can read their own followed plans" ON public.user_plan_follows
  USING (((select auth.uid()) = user_id));

ALTER POLICY "Users can update their own followed plans" ON public.user_plan_follows
  USING (((select auth.uid()) = user_id))
  WITH CHECK (((select auth.uid()) = user_id));

-- Verify (read-only): 0 rows
--   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
--     AND (qual ~ '(?<!SELECT )auth\.uid\(\)' OR with_check ~ '(?<!SELECT )auth\.uid\(\)');
