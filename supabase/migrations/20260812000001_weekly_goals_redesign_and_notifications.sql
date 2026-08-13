-- =====================================================================
-- ASCEND WEEKLY GOALS & SUNDAY PLANNING NOTIFICATION MIGRATION
-- =====================================================================

-- 1. Add notif_sunday_planning column to public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notif_sunday_planning BOOLEAN DEFAULT TRUE;

-- 2. DROP all potential function overloads to prevent PostgREST HTTP 300 Multiple Choices errors
DROP FUNCTION IF EXISTS public.create_notification_atomic(UUID, UUID, TEXT, TEXT, VARCHAR, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_notification_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

-- 3. Update create_notification_atomic RPC to enforce notif_sunday_planning preference
CREATE OR REPLACE FUNCTION public.create_notification_atomic(
  p_recipient_id UUID,
  p_actor_id UUID DEFAULT NULL,
  p_actor_username TEXT DEFAULT NULL,
  p_actor_avatar TEXT DEFAULT NULL,
  p_type VARCHAR DEFAULT 'system',
  p_title TEXT DEFAULT NULL,
  p_message TEXT DEFAULT '',
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notif public.notifications;
  v_dedup_key TEXT;
  v_notif_partner_activity BOOLEAN := TRUE;
  v_notif_league_updates BOOLEAN := TRUE;
  v_notif_daily_reminder BOOLEAN := TRUE;
  v_notif_sunday_planning BOOLEAN := TRUE;
BEGIN
  -- Query recipient notification preferences from public.profiles
  SELECT 
    COALESCE(notif_partner_activity, TRUE),
    COALESCE(notif_league_updates, TRUE),
    COALESCE(notif_daily_reminder, TRUE),
    COALESCE(notif_sunday_planning, TRUE)
  INTO 
    v_notif_partner_activity,
    v_notif_league_updates,
    v_notif_daily_reminder,
    v_notif_sunday_planning
  FROM public.profiles
  WHERE id = p_recipient_id;

  -- Enforce preference suppression according to notification type:
  IF p_type IN ('partner_nudge', 'challenge_completed') AND v_notif_partner_activity IS FALSE THEN
    RETURN NULL;
  END IF;

  IF p_type IN ('league_reset', 'league_promotion', 'league_demotion', 'league_update') AND v_notif_league_updates IS FALSE THEN
    RETURN NULL;
  END IF;

  IF p_type IN ('daily_reminder') AND v_notif_daily_reminder IS FALSE THEN
    RETURN NULL;
  END IF;

  IF p_type IN ('sunday_planning') AND v_notif_sunday_planning IS FALSE THEN
    RETURN NULL;
  END IF;

  v_dedup_key := p_payload->>'dedupKey';

  -- If dedupKey exists, try to insert ON CONFLICT DO NOTHING
  IF v_dedup_key IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
    )
    VALUES (
      p_recipient_id, p_actor_id, p_actor_username, p_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
    )
    ON CONFLICT (recipient_id, ((payload->>'dedupKey'))) WHERE (payload->>'dedupKey') IS NOT NULL
    DO NOTHING
    RETURNING * INTO v_notif;

    -- If conflict occurred, select existing notification row
    IF v_notif.id IS NULL THEN
      SELECT * INTO v_notif
      FROM public.notifications
      WHERE recipient_id = p_recipient_id AND payload->>'dedupKey' = v_dedup_key
      LIMIT 1;
    END IF;
  ELSE
    -- Standard insert without dedup check
    INSERT INTO public.notifications (
      recipient_id, actor_id, actor_username, actor_avatar, type, title, message, payload, read
    )
    VALUES (
      p_recipient_id, p_actor_id, p_actor_username, p_actor_avatar, p_type, p_title, p_message, p_payload, FALSE
    )
    RETURNING * INTO v_notif;
  END IF;

  RETURN v_notif;
END;
$$;

-- 4. CREATE SERVER-SIDE SUNDAY EVENING PLANNING NOTIFICATION PROCESSOR
CREATE OR REPLACE FUNCTION public.process_sunday_planning_notifications(
  p_week_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_key TEXT;
  v_row RECORD;
  v_dedup_key TEXT;
  v_count INT := 0;
  v_notif RECORD;
BEGIN
  IF p_week_key IS NOT NULL AND length(p_week_key) > 0 THEN
    v_week_key := p_week_key;
  ELSE
    v_week_key := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-"W"IW');
  END IF;

  FOR v_row IN SELECT id FROM public.profiles LOOP
    v_dedup_key := 'sunday_planning_' || v_week_key;

    SELECT * INTO v_notif FROM public.create_notification_atomic(
      p_recipient_id => v_row.id,
      p_actor_id => NULL,
      p_actor_username => 'Ascend Executive System',
      p_actor_avatar => '🎯',
      p_type => 'sunday_planning',
      p_title => 'Sunday Evening Goal Planning',
      p_message => 'Take 5 minutes to set your top 3 measurable goals and review last week''s velocity.',
      p_payload => jsonb_build_object('weekKey', v_week_key, 'dedupKey', v_dedup_key)
    );

    IF v_notif.id IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'weekKey', v_week_key,
    'notifications_created', v_count
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_notification_atomic(UUID, UUID, TEXT, TEXT, VARCHAR, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_sunday_planning_notifications(TEXT) TO anon, authenticated, service_role;

-- 5. SCHEDULE PG_CRON JOB FOR SUNDAY EVENING (19:00 UTC ON SUNDAYS)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('sunday-planning-reminder');
    PERFORM cron.schedule(
      'sunday-planning-reminder',
      '0 19 * * 0',
      'SELECT public.process_sunday_planning_notifications();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
