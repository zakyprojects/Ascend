-- save_shared_challenge_atomic also returns the stored row and the caller's server day.
-- Same signature, same grants (CREATE OR REPLACE keeps the ACL); older apps ignore the extra keys.
-- Run BEFORE the studio test.

CREATE OR REPLACE FUNCTION public.save_shared_challenge_atomic(p_id uuid, p_partnership_id uuid, p_title text, p_target_habit_name text, p_duration_days integer, p_joint_streak integer DEFAULT 0, p_total_joint_days_completed integer DEFAULT 0, p_user1_category text DEFAULT 'habit'::text, p_user1_target text DEFAULT ''::text, p_user2_category text DEFAULT 'habit'::text, p_user2_target text DEFAULT ''::text, p_user1_done_date text DEFAULT NULL::text, p_user2_done_date text DEFAULT NULL::text, p_user1_done_dates jsonb DEFAULT '[]'::jsonb, p_user2_done_dates jsonb DEFAULT '[]'::jsonb, p_status text DEFAULT 'active'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID;
  v_partner_exists BOOLEAN;
  v_challenge public.shared_challenges;
  v_user1_date DATE;
  v_user2_date DATE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You must be authenticated to create or update a joint pact.'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.partnerships p
    WHERE p.id = coalesce((SELECT sc.partnership_id FROM public.shared_challenges sc WHERE sc.id = p_id), p_partnership_id)
    AND (p.user1_id = v_caller_id OR p.user2_id = v_caller_id)
  ) INTO v_partner_exists;

  IF NOT v_partner_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: You are not a member of this partnership.'
    );
  END IF;

  IF p_user1_done_date IS NOT NULL AND TRIM(p_user1_done_date) <> '' THEN
    v_user1_date := p_user1_done_date::DATE;
  ELSE
    v_user1_date := NULL;
  END IF;

  IF p_user2_done_date IS NOT NULL AND TRIM(p_user2_done_date) <> '' THEN
    v_user2_date := p_user2_done_date::DATE;
  ELSE
    v_user2_date := NULL;
  END IF;

  INSERT INTO public.shared_challenges (
    id, partnership_id, title, target_habit_name, duration_days, joint_streak,
    total_joint_days_completed, user1_category, user1_target, user2_category, user2_target,
    user1_done_date, user2_done_date, user1_done_dates, user2_done_dates, status
  )
  VALUES (
    p_id,
    p_partnership_id,
    p_title,
    p_target_habit_name,
    p_duration_days,
    COALESCE(p_joint_streak, 0),
    COALESCE(p_total_joint_days_completed, 0),
    COALESCE(p_user1_category, 'habit'),
    COALESCE(p_user1_target, ''),
    COALESCE(p_user2_category, 'habit'),
    COALESCE(p_user2_target, ''),
    v_user1_date,
    v_user2_date,
    COALESCE(p_user1_done_dates, '[]'::jsonb),
    COALESCE(p_user2_done_dates, '[]'::jsonb),
    COALESCE(p_status, 'active')
  )
  ON CONFLICT (id) DO UPDATE SET
    partnership_id = EXCLUDED.partnership_id,
    title = EXCLUDED.title,
    target_habit_name = EXCLUDED.target_habit_name,
    duration_days = EXCLUDED.duration_days,
    joint_streak = EXCLUDED.joint_streak,
    total_joint_days_completed = EXCLUDED.total_joint_days_completed,
    user1_category = EXCLUDED.user1_category,
    user1_target = EXCLUDED.user1_target,
    user2_category = EXCLUDED.user2_category,
    user2_target = EXCLUDED.user2_target,
    user1_done_date = EXCLUDED.user1_done_date,
    user2_done_date = EXCLUDED.user2_done_date,
    user1_done_dates = EXCLUDED.user1_done_dates,
    user2_done_dates = EXCLUDED.user2_done_dates,
    status = EXCLUDED.status
  RETURNING * INTO v_challenge;

  -- The row as stored: shared_challenges_guard keeps only the caller's tick for today in their
  -- profile time zone, so the app compares this with what it sent and shows the stored row.
  RETURN jsonb_build_object(
    'success', true,
    'challenge_id', v_challenge.id,
    'challenge', to_jsonb(v_challenge),
    'today', to_char((now() AT TIME ZONE coalesce(public.ascend_own_timezone(v_caller_id), 'Asia/Karachi'))::date, 'YYYY-MM-DD')
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;
