-- Focus Break: only sessions planned for 35 minutes or more can take a break (Zakria 2026-11-13 19:53 PKT,
-- "Break only at 35+ min"). Before this, a session planned for exactly 30 minutes showed a Break that could
-- never be taken (25 focused AND 5 left meet only at the instant 25:00), and 31-34 had a window of 1-4 min.
-- Only ascend_focus_session_break changes: one more refusal, planned focus_minutes < 35. Everything else
-- (25 focused min, 5/10/15, max 2, not in the last 5 min, Continue + 10 min grace) is unchanged from
-- 20261113140000_focus_break_v2.sql. A break already running is not touched. Re-runnable.

-- Break: a running session planned for 35 minutes or more, with at least 25 focused minutes, pauses for
-- 5, 10 or 15 minutes. At most 2 per session; not with less than 5 minutes of focus left. It runs again
-- only on Continue.
CREATE OR REPLACE FUNCTION public.ascend_focus_session_break(p_session_id text, p_minutes integer, p_revision integer DEFAULT NULL, p_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  r      public.focus_active_sessions;
  v_at   timestamptz;
  v_left numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  IF p_minutes IS NULL OR p_minutes NOT IN (5, 10, 15) THEN
    RAISE EXCEPTION 'bad break length' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('focus_session:' || v_user::text));
  SELECT * INTO r FROM public.focus_active_sessions WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND OR r.session_id IS DISTINCT FROM p_session_id
     OR (p_at IS NOT NULL AND p_revision IS DISTINCT FROM r.revision) THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  -- Planned under 35 minutes: no break at all (the app shows no Break button there).
  IF r.status <> 'running' OR r.break_count >= 2 OR r.focus_minutes < 35 THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  v_at := least(greatest(coalesce(p_at, now()), r.stretch_started_at), now());
  v_left := r.stretch_planned_seconds - extract(epoch FROM (v_at - r.stretch_started_at));
  IF v_left < 5 * 60 OR public.ascend_focus_active_seconds(r, v_at) < 25 * 60 THEN
    -- Under 5 minutes of focus left (or the plan already finished), or under 25 focused minutes: no break.
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  UPDATE public.focus_active_sessions
  SET status = 'paused',
      stretch_started_at = r.stretch_started_at,
      stretch_planned_seconds = r.stretch_planned_seconds,
      marks_at = public.ascend_focus_marks_until(r, v_at),
      paused_at = v_at,
      paused_remaining_seconds = v_left,
      pause_ends_at = v_at + make_interval(mins => p_minutes),
      break_count = r.break_count + 1,
      revision = r.revision + 1, updated_at = now()
  WHERE user_id = v_user;
  -- A replayed break may already be past its deadline.
  RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), true);
END;
$$;

-- Replaced functions keep their grants (CREATE OR REPLACE), restated here.
REVOKE ALL ON FUNCTION public.ascend_focus_session_break(text, integer, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_break(text, integer, integer, timestamptz) TO authenticated, service_role;
