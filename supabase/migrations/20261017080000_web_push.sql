-- Web Push for closed-app notifications (knowledge/mode-a-batch3b-webpush-2026-10-17.md, Batch 3b)
--
-- 1. Evening reminders on the user's own clock. The old jobs ran at 20:00 UTC (daily, UTC date)
--    and 19:00 UTC Sunday, which is 01:00 / 00:00 in Pakistan and reported a day already over.
--    Now one hourly job sends the daily check-in at 20:00 local (that local day) and the Sunday
--    planning notice at 19:00 local on Sunday. create_notification_atomic still applies the
--    user's notification toggles and the dedupKey, so a rerun in the same hour sends nothing new.
-- 2. push_subscriptions: one row per browser (its push endpoint). The app saves and removes its
--    own device only through two RPCs; a browser signed in to another account moves to that one.
-- 3. A new notification is pushed to the recipient's devices: an AFTER INSERT trigger posts only
--    the notification id (pg_net) to the send-push Edge Function, which reads the row itself.
--    Notices issued at local midnight (penalties, partner missed habit) stay in-app only.
--    The trigger needs two Vault secrets, created by hand (never in the repo):
--      ascend_push_url    = https://<project>.supabase.co/functions/v1/send-push
--      ascend_push_secret = the same value as the function's PUSH_WEBHOOK_SECRET
--    Without them it does nothing, and a failed post never blocks the notification.

BEGIN;

-- 1. Evening reminders -------------------------------------------------------------------------

-- Body unchanged from the live process_daily_reminder_notifications, for one user and one local day.
CREATE OR REPLACE FUNCTION public.ascend_send_daily_reminder(p_user uuid, p_today date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_today text := to_char(p_today, 'YYYY-MM-DD');
  v_incomplete_habits int;
  v_missing_items text[] := ARRAY[]::text[];
BEGIN
  -- A. Daily habits (completions: string[] legacy or { date: { done } })
  SELECT count(*) INTO v_incomplete_habits
  FROM public.habits h
  WHERE h.user_id = p_user
    AND h.deleted_at IS NULL
    AND coalesce(h.data->>'frequency', 'daily') <> 'weekly'
    AND NOT (
      coalesce(h.data->'completions' @> to_jsonb(v_today), false) OR
      coalesce((h.data->'completions'->v_today->>'done')::boolean, false)
    );

  IF v_incomplete_habits > 0 THEN
    v_missing_items := array_append(v_missing_items, v_incomplete_habits || ' habit' || CASE WHEN v_incomplete_habits > 1 THEN 's' ELSE '' END);
  END IF;

  -- B. Reading
  IF EXISTS (SELECT 1 FROM public.reading_logs r WHERE r.user_id = p_user AND r.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.reading_logs r WHERE r.user_id = p_user AND r.deleted_at IS NULL AND r.data->>'date' = v_today) THEN
    v_missing_items := array_append(v_missing_items, 'reading log');
  END IF;

  -- C. Journal
  IF EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.user_id = p_user AND j.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.user_id = p_user AND j.deleted_at IS NULL AND j.entry_date = p_today) THEN
    v_missing_items := array_append(v_missing_items, 'journal entry');
  END IF;

  -- D. Skill practice
  IF EXISTS (SELECT 1 FROM public.skill_logs s WHERE s.user_id = p_user AND s.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.skill_logs s WHERE s.user_id = p_user AND s.deleted_at IS NULL AND s.data->>'date' = v_today) THEN
    v_missing_items := array_append(v_missing_items, 'skill practice');
  END IF;

  IF coalesce(array_length(v_missing_items, 1), 0) > 0 THEN
    PERFORM public.create_notification_atomic(
      p_recipient_id => p_user,
      p_actor_id => NULL,
      p_actor_username => 'Ascend System',
      p_actor_avatar => '⚡',
      p_type => 'daily_reminder',
      p_title => 'Evening Tracker Check-in 🌙',
      p_message => 'Don''t break your momentum! You still have incomplete items for today: ' || array_to_string(v_missing_items, ', ') || '.',
      p_payload => jsonb_build_object('date', v_today, 'missing', v_missing_items, 'dedupKey', 'daily_reminder_' || v_today)
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ascend_run_local_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row   record;
  v_local timestamp;
  v_week  text;
BEGIN
  FOR v_row IN
    SELECT pr.id, pr.timezone
    FROM public.profiles pr
    JOIN pg_catalog.pg_timezone_names tz ON tz.name = pr.timezone
  LOOP
    v_local := now() AT TIME ZONE v_row.timezone;
    BEGIN
      IF extract(hour FROM v_local) = 20 THEN
        PERFORM public.ascend_send_daily_reminder(v_row.id, v_local::date);
      END IF;

      IF extract(isodow FROM v_local) = 7 AND extract(hour FROM v_local) = 19 THEN
        v_week := to_char(v_local::date, 'IYYY-"W"IW');
        PERFORM public.create_notification_atomic(
          p_recipient_id => v_row.id,
          p_actor_id => NULL,
          p_actor_username => 'Ascend Executive System',
          p_actor_avatar => '🎯',
          p_type => 'sunday_planning',
          p_title => 'Sunday Evening Goal Planning',
          p_message => 'Take 5 minutes to set your top 3 measurable goals and review last week''s velocity.',
          p_payload => jsonb_build_object('weekKey', v_week, 'dedupKey', 'sunday_planning_' || v_week)
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- One user's failure never blocks the others.
      RAISE WARNING 'ascend_run_local_reminders: user % failed: %', v_row.id, SQLERRM;
    END;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_send_daily_reminder(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_run_local_reminders() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job
  WHERE jobname IN ('daily-evening-reminder', 'sunday-planning-reminder', 'ascend-local-reminders-hourly');
END $$;

SELECT cron.schedule('ascend-local-reminders-hourly', '2 * * * *', 'SELECT public.ascend_run_local_reminders()');

DROP FUNCTION IF EXISTS public.process_daily_reminder_notifications(text);
DROP FUNCTION IF EXISTS public.process_sunday_planning_notifications(text);

-- 2. Push subscriptions ------------------------------------------------------------------------

CREATE TABLE public.push_subscriptions (
  endpoint   text PRIMARY KEY CHECK (endpoint ~ '^https://' AND length(endpoint) <= 1000),
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  p256dh     text NOT NULL CHECK (length(p256dh) BETWEEN 1 AND 200),
  auth       text NOT NULL CHECK (length(auth) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions (user_id);

-- No client access to the table; the RPCs below are the only way in.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  INSERT INTO public.push_subscriptions (endpoint, user_id, p256dh, auth)
  VALUES (p_endpoint, v_user, p_p256dh, p_auth)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = now();

  -- At most 10 devices per account; the oldest goes.
  DELETE FROM public.push_subscriptions ps
  WHERE ps.user_id = v_user
    AND ps.endpoint IN (
      SELECT s.endpoint FROM public.push_subscriptions s
      WHERE s.user_id = v_user
      ORDER BY s.updated_at DESC
      OFFSET 10
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_push_subscription(p_endpoint text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint AND user_id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_push_subscription(text) TO authenticated;

-- 3. Push on new notification ------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notifications_send_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions ps WHERE ps.user_id = NEW.recipient_id) THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT max(ds.decrypted_secret) FILTER (WHERE ds.name = 'ascend_push_url'),
           max(ds.decrypted_secret) FILTER (WHERE ds.name = 'ascend_push_secret')
      INTO v_url, v_secret
    FROM vault.decrypted_secrets ds
    WHERE ds.name IN ('ascend_push_url', 'ascend_push_secret');

    IF v_url IS NULL OR v_secret IS NULL THEN
      RETURN NULL;
    END IF;

    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object('notification_id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-ascend-push-secret', v_secret),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    -- A push is best effort: the in-app notification stands either way.
    RAISE WARNING 'notifications_send_push: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.notifications_send_push() FROM PUBLIC, anon, authenticated;

-- Midnight notices stay in-app only (decision D3, 2026-10-17).
CREATE TRIGGER notifications_send_push AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NEW.type NOT IN ('missed_habit', 'bad_habit_no_report', 'partner_missed_habit', 'missed_exercise_target'))
  EXECUTE FUNCTION public.notifications_send_push();

COMMIT;
