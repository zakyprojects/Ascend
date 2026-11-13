-- Deep Focus: Break v2 (Zakria's go 2026-11-13 12:45 PKT for code + this SQL;
-- knowledge/mode-b-focus-break-v2-2026-11-13.md). Replaces the auto-resume of 20261113120000_focus_break.sql.
--
-- Rules:
--   * A break (5, 10 or 15 min) needs at least 25 FOCUSED minutes in the session (so its first 2 points
--     are already safe), at least 5 minutes of focus left, and at most 2 per session. The focus time is
--     frozen during the break; break minutes never count.
--   * No auto-resume. The user presses Continue (the 3-argument resume RPC), during the break or within
--     10 minutes after its end. Not continued by break end + 10 min: the session ends on its own, closed
--     at the break START (status 'ended', end_reason 'expired', focus_ended_at = paused_at), and is logged
--     by the usual claim with its focused minutes only. This runs in ascend_focus_settled, so it happens
--     on the server whatever device (or none) is open, exactly like the 30-minute pause expiry.
--   * An ended 'expired' row keeps pause_ends_at: the app tells "ended after your break" from the
--     30-minute pause expiry by it.
--   * Logout during a break or in its 10 grace minutes: unchanged, a plain pause from the sign-out (its
--     30-minute window starts there). Away at most 15 + 10 = 25 min before the server ends a break.
--   * "I wasn't back" is gone: ascend_focus_session_back and the helper ascend_focus_break_due are
--     dropped (no other caller: prosrc grep 2026-11-13; old app a68e0f0 never called them).
--
-- New internal helper ascend_focus_resume_deadline(r): the last moment a paused row can still be
-- resumed (break: pause_ends_at + 10 min; plain pause: paused_at + 30 min). Used by settled, resume, end
-- and pause, so the four always agree.
--
-- Old app versions (1.3.0, a68e0f0) share this database: every RPC they call (get, claim, start, pause,
-- resume, end) keeps its signature. A row on a break looks to them like a plain pause; their Resume is
-- Continue. Their "Resume within" shows the 30-minute window, so after the server's shorter deadline
-- their Resume is refused and they follow the ended row (logged by the claim, as for any expiry).
--
-- Mirrors (change together): src/lib/focus/focusSession.ts (FOCUS_BREAK_*, breakBlock, resumeDeadlineMs,
-- settleSession, pauseForSignOut), src/lib/focus/focusServerSession.ts (row mapping).
-- Unchanged: ascend_focus_session_start, ascend_focus_session_locked, get, claim, the points path.
--
-- Rollback: work/snapshots/focus-break-v2-*-2026-11-13.json hold the replaced bodies (re-run their `d`,
-- which also re-creates ascend_focus_session_back and ascend_focus_break_due with their grants), then
-- DROP FUNCTION public.ascend_focus_resume_deadline. Revert the app first.

-- The last moment a paused row can be resumed.
CREATE OR REPLACE FUNCTION public.ascend_focus_resume_deadline(r public.focus_active_sessions)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN r.pause_ends_at IS NOT NULL THEN r.pause_ends_at + interval '10 minutes'
              ELSE r.paused_at + interval '30 minutes' END;
$$;

-- The row as it is at p_at: a running focus part past its planned end has finished (break or ended),
-- a pause past its deadline has expired (closed at the pause: for a break, the break start), an
-- after-session break that ran out has ended.
CREATE OR REPLACE FUNCTION public.ascend_focus_settled(r public.focus_active_sessions, p_at timestamptz)
RETURNS public.focus_active_sessions
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_end timestamptz;
BEGIN
  IF r.user_id IS NULL THEN
    RETURN r;
  END IF;
  IF r.status = 'running' THEN
    v_end := r.stretch_started_at + make_interval(secs => r.stretch_planned_seconds);
    IF v_end <= p_at THEN
      r.marks_at := public.ascend_focus_marks_until(r, v_end);
      r.focus_ended_at := v_end;
      r.end_reason := 'finished';
      r.log_claimed := false;
      r.status := CASE WHEN r.break_minutes > 0 AND v_end + make_interval(mins => r.break_minutes) > p_at
                       THEN 'break' ELSE 'ended' END;
    END IF;
  ELSIF r.status = 'paused' THEN
    IF p_at > public.ascend_focus_resume_deadline(r) THEN
      r.focus_ended_at := r.paused_at;
      r.end_reason := 'expired';
      r.log_claimed := false;
      r.status := 'ended';
    END IF;
  ELSIF r.status = 'break' THEN
    IF r.focus_ended_at + make_interval(mins => r.break_minutes) <= p_at THEN
      r.status := 'ended';
    END IF;
  END IF;
  RETURN r;
END;
$$;

-- Plain pause (logout; old apps' Pause). A break (or its grace minutes) becomes a plain pause from the
-- action time; a break already past its deadline at the action time has expired (nothing to pause).
CREATE OR REPLACE FUNCTION public.ascend_focus_session_pause(p_session_id text, p_revision integer DEFAULT NULL, p_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  r      public.focus_active_sessions;
  v_at   timestamptz;
  v_end  timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('focus_session:' || v_user::text));
  SELECT * INTO r FROM public.focus_active_sessions WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND OR r.session_id IS DISTINCT FROM p_session_id
     OR (p_at IS NOT NULL AND p_revision IS DISTINCT FROM r.revision) THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  IF r.status = 'paused' AND r.pause_ends_at IS NOT NULL THEN
    -- Logout during a break: the normal pause from the sign-out (its 30-minute window starts there).
    v_at := least(greatest(coalesce(p_at, now()), r.paused_at), now());
    IF v_at > public.ascend_focus_resume_deadline(r) THEN
      RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
    END IF;
    UPDATE public.focus_active_sessions
    SET paused_at = v_at, pause_ends_at = NULL, revision = r.revision + 1, updated_at = now()
    WHERE user_id = v_user;
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), true);
  END IF;
  IF r.status <> 'running' THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  v_end := r.stretch_started_at + make_interval(secs => r.stretch_planned_seconds);
  v_at := least(greatest(coalesce(p_at, now()), r.stretch_started_at), now());
  IF v_at >= v_end THEN
    -- The time ran out before the pause: it finished.
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  UPDATE public.focus_active_sessions
  SET status = 'paused',
      stretch_started_at = r.stretch_started_at,
      stretch_planned_seconds = r.stretch_planned_seconds,
      marks_at = public.ascend_focus_marks_until(r, v_at),
      paused_at = v_at,
      paused_remaining_seconds = greatest(0.0, r.stretch_planned_seconds - extract(epoch FROM (v_at - r.stretch_started_at))),
      pause_ends_at = NULL,
      revision = r.revision + 1, updated_at = now()
  WHERE user_id = v_user;
  -- A replayed pause may already be older than the resume window.
  RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), true);
END;
$$;

-- Resume a plain pause, or Continue after a break (during it, or within 10 minutes after its end).
CREATE OR REPLACE FUNCTION public.ascend_focus_session_resume(p_session_id text, p_revision integer DEFAULT NULL, p_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  r      public.focus_active_sessions;
  v_at   timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('focus_session:' || v_user::text));
  SELECT * INTO r FROM public.focus_active_sessions WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND OR r.session_id IS DISTINCT FROM p_session_id
     OR (p_at IS NOT NULL AND p_revision IS DISTINCT FROM r.revision) THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  IF r.status <> 'paused' THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  v_at := least(greatest(coalesce(p_at, now()), r.paused_at), now());
  IF v_at > public.ascend_focus_resume_deadline(r) THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  UPDATE public.focus_active_sessions
  SET status = 'running', stretch_started_at = v_at, stretch_planned_seconds = r.paused_remaining_seconds,
      paused_at = NULL, pause_ends_at = NULL, revision = r.revision + 1, updated_at = now()
  WHERE user_id = v_user;
  RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), true);
END;
$$;

-- Complete / Discard / Skip break. A paused session (also one on a break) ends at its pause, while it
-- can still be resumed; after its deadline it has expired (closed at the pause, logged by a claim).
CREATE OR REPLACE FUNCTION public.ascend_focus_session_end(p_session_id text, p_reason text, p_revision integer DEFAULT NULL, p_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user   uuid := auth.uid();
  r        public.focus_active_sessions;
  v_at     timestamptz;
  v_active numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  IF p_reason NOT IN ('completed', 'discarded', 'break_skipped') THEN
    RAISE EXCEPTION 'bad reason' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('focus_session:' || v_user::text));
  SELECT * INTO r FROM public.focus_active_sessions WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND OR r.session_id IS DISTINCT FROM p_session_id THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;

  IF p_reason = 'break_skipped' THEN
    r := public.ascend_focus_session_locked(v_user);
    IF r.status <> 'break' THEN
      RETURN public.ascend_focus_session_reply(r, false);
    END IF;
    UPDATE public.focus_active_sessions SET status = 'ended', revision = r.revision + 1, updated_at = now()
    WHERE user_id = v_user RETURNING * INTO r;
    RETURN public.ascend_focus_session_reply(r, true);
  END IF;

  IF r.status NOT IN ('running', 'paused')
     OR (p_at IS NOT NULL AND p_reason <> 'completed' AND p_revision IS DISTINCT FROM r.revision) THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  -- End time: now (or the replayed time), never before the stretch, never after the planned end;
  -- a paused session (also one on a break) ends at its pause.
  IF r.status = 'paused' THEN
    v_at := r.paused_at;
    IF least(coalesce(p_at, now()), now()) > public.ascend_focus_resume_deadline(r) THEN
      -- The deadline ran out first: it expired (closed at the pause, logged by a claim).
      RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
    END IF;
  ELSE
    v_at := least(greatest(coalesce(p_at, now()), r.stretch_started_at), now(),
                  r.stretch_started_at + make_interval(secs => r.stretch_planned_seconds));
    IF v_at >= r.stretch_started_at + make_interval(secs => r.stretch_planned_seconds) THEN
      -- The plan ran out first: it finished at its planned end (logged by a claim).
      RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
    END IF;
  END IF;
  v_active := public.ascend_focus_active_seconds(r, v_at);
  IF (p_reason = 'completed' AND v_active < 25 * 60) OR (p_reason = 'discarded' AND v_active >= 25 * 60) THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  UPDATE public.focus_active_sessions
  SET status = 'ended',
      stretch_started_at = r.stretch_started_at,
      stretch_planned_seconds = r.stretch_planned_seconds,
      paused_at = r.paused_at,
      marks_at = CASE WHEN r.status = 'running' THEN public.ascend_focus_marks_until(r, v_at) ELSE r.marks_at END,
      paused_remaining_seconds = CASE WHEN r.status = 'running'
        THEN greatest(0.0, r.stretch_planned_seconds - extract(epoch FROM (v_at - r.stretch_started_at)))
        ELSE r.paused_remaining_seconds END,
      focus_ended_at = v_at, end_reason = p_reason, log_claimed = true,
      revision = r.revision + 1, updated_at = now()
  WHERE user_id = v_user
  RETURNING * INTO r;
  RETURN public.ascend_focus_session_reply(r, true, true);
END;
$$;

-- Break: a running session with at least 25 focused minutes pauses for 5, 10 or 15 minutes. At most 2
-- per session; not with less than 5 minutes of focus left. It runs again only on Continue.
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
  IF r.status <> 'running' OR r.break_count >= 2 THEN
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

-- "I wasn't back" and the auto-resume helper are gone.
DROP FUNCTION IF EXISTS public.ascend_focus_session_back(text, integer, timestamptz);
DROP FUNCTION IF EXISTS public.ascend_focus_break_due(public.focus_active_sessions, timestamptz);

-- Grants: the helper is internal (like ascend_focus_settled); the RPCs are for signed-in users only.
-- Replaced functions keep their grants (CREATE OR REPLACE), restated here.
REVOKE ALL ON FUNCTION public.ascend_focus_resume_deadline(public.focus_active_sessions) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_resume_deadline(public.focus_active_sessions) TO service_role;
REVOKE ALL ON FUNCTION public.ascend_focus_settled(public.focus_active_sessions, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_focus_session_pause(text, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ascend_focus_session_resume(text, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ascend_focus_session_end(text, text, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ascend_focus_session_break(text, integer, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_pause(text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_resume(text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_end(text, text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_break(text, integer, integer, timestamptz) TO authenticated, service_role;
