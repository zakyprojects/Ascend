-- Deep Focus: Pause becomes a timed Break (I1; knowledge/mode-a-three-ideas-2026-11-12.md "I1",
-- Zakria's go 2026-11-13 11:13 PKT for code + this SQL).
--
-- A break is a pause with an end: 5, 10 or 15 minutes, only on sessions over 25 minutes, at most 2
-- per session, never with less than 5 minutes of focus left. At its end the session runs again on
-- its own, on the server, so a phone that is closed during the break never loses the session (before
-- this, a pause older than 30 minutes expired at the pause moment). Break minutes earn nothing:
-- they are paused time, which the app already leaves out of a session's active minutes.
--
-- Design:
--   * focus_active_sessions.pause_ends_at: while paused, when the break ends (NULL = a plain pause,
--     which only logout makes now). While running, pause_ends_at = stretch_started_at marks a stretch
--     that started on its own at a break end: the app then offers "I wasn't back", which restarts the
--     stretch from that moment with the same time left (the minutes since the break end are removed).
--     Any other action clears it.
--   * focus_active_sessions.break_count: breaks taken in this session (max 2, every device).
--   * ascend_focus_break_due(r, at): the row with its break over by `at` (running again from the break
--     end, same time left). ascend_focus_settled applies it at now(); pause / resume / end / break /
--     back apply it at the action's own time, so an action replayed later (offline device) is judged
--     against the session as it was when it was taken.
--   * ascend_focus_session_break(p_session_id, p_minutes, p_revision, p_at): new.
--   * ascend_focus_session_back(p_session_id, p_revision, p_at): new ("I wasn't back").
--   * ascend_focus_session_pause (same 3-argument signature, old app 1.3.0 keeps calling it): also turns
--     a break into a plain pause stamped at the action time, which is what logout during a break does
--     (Zakria: logout during a break = the normal 30-minute pause). Old apps never send a pause for a
--     session they show as paused, so they never reach that branch.
--   * ascend_focus_session_resume (same signature) ends a break early; refused when the break was
--     already over at the action time (the session is running since the break end).
--   * ascend_focus_session_start (same signature) resets both new columns when a new session
--     overwrites the row (the upsert kept every column it does not name).
--   * ascend_focus_session_locked stores the stretch columns too, since a settled row can now change them.
--   * Points are NOT touched: focus_logs and its triggers stay exactly as they are.
--
-- Old app versions (1.3.0, a68e0f0): every signature they call is unchanged; the reply carries two
-- extra keys they ignore; a row on a break looks to them like a plain pause (their Resume ends the
-- break early) and turns running again at the break end on their next pull.
--
-- Mirrors (change together): src/lib/focus/focusSession.ts (breakAt, breakDue, FOCUS_BREAK_*),
-- src/lib/focus/focusServerSession.ts (row mapping, ops 'break' / 'back').
--
-- Rollback: work/snapshots/i1-*-2026-11-13.json hold the replaced bodies (re-run their `d`), then
-- DROP FUNCTION the two new RPCs and the helper, then drop the two columns. Revert the app first.

ALTER TABLE public.focus_active_sessions
  ADD COLUMN IF NOT EXISTS pause_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS break_count smallint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'focus_active_sessions_break_count_check'
                 AND conrelid = 'public.focus_active_sessions'::regclass) THEN
    ALTER TABLE public.focus_active_sessions
      ADD CONSTRAINT focus_active_sessions_break_count_check CHECK (break_count BETWEEN 0 AND 2);
  END IF;
END $$;

-- The row with its break over by p_at: running again from the break end with the time it had left.
CREATE OR REPLACE FUNCTION public.ascend_focus_break_due(r public.focus_active_sessions, p_at timestamptz)
RETURNS public.focus_active_sessions
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF r.status = 'paused' AND r.pause_ends_at IS NOT NULL AND r.pause_ends_at <= p_at THEN
    r.status := 'running';
    r.stretch_started_at := r.pause_ends_at;
    r.stretch_planned_seconds := r.paused_remaining_seconds;
    r.paused_at := NULL;
  END IF;
  RETURN r;
END;
$$;

-- The row as it is at p_at: a break that ran out is running again (and may have finished since), a
-- running focus part past its planned end has finished (break or ended), a plain pause older than
-- 30 minutes has expired (closed at the pause), an after-session break that ran out has ended.
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
  r := public.ascend_focus_break_due(r, p_at);
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
    IF p_at > r.paused_at + interval '30 minutes' THEN
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

-- Internal: locks the caller's row, settles it at now() and stores the settled row.
CREATE OR REPLACE FUNCTION public.ascend_focus_session_locked(p_user uuid)
RETURNS public.focus_active_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.focus_active_sessions;
  s public.focus_active_sessions;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('focus_session:' || p_user::text));
  SELECT * INTO r FROM public.focus_active_sessions WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN r;
  END IF;
  s := public.ascend_focus_settled(r, now());
  IF s IS DISTINCT FROM r THEN
    UPDATE public.focus_active_sessions
    SET status = s.status, marks_at = s.marks_at, focus_ended_at = s.focus_ended_at, end_reason = s.end_reason,
        log_claimed = s.log_claimed, stretch_started_at = s.stretch_started_at,
        stretch_planned_seconds = s.stretch_planned_seconds, paused_at = s.paused_at,
        pause_ends_at = s.pause_ends_at, revision = r.revision + 1, updated_at = now()
    WHERE user_id = p_user
    RETURNING * INTO s;
  END IF;
  RETURN s;
END;
$$;

-- Start: unchanged except that a new session starts with no break taken.
CREATE OR REPLACE FUNCTION public.ascend_focus_session_start(p_session jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user      uuid := auth.uid();
  r           public.focus_active_sessions;
  v_prev      jsonb;
  v_id        text := nullif(btrim(p_session->>'id'), '');
  v_focus     integer;
  v_break     integer;
  v_started   timestamptz;
  v_stretch   timestamptz;
  v_planned   numeric;
  v_paused    boolean := coalesce((p_session->>'isPaused')::boolean, false);
  v_paused_at timestamptz;
  v_remain    numeric;
  v_marks     timestamptz[];
  v_shift     interval := interval '0';
  v_floor     timestamptz := now() - interval '24 hours';
  v_rev       integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  IF v_id IS NULL OR length(v_id) > 64 THEN RAISE EXCEPTION 'bad session id' USING ERRCODE = '22023'; END IF;
  r := public.ascend_focus_session_locked(v_user);

  IF r.user_id IS NOT NULL AND r.session_id = v_id THEN
    RETURN public.ascend_focus_session_reply(r, r.status IN ('running', 'paused')); -- already here
  END IF;
  IF r.user_id IS NOT NULL AND r.status IN ('running', 'paused') THEN
    RETURN public.ascend_focus_session_reply(r, false); -- another session is live: never two
  END IF;

  v_focus := least(600, greatest(1, round(coalesce((p_session->>'focusMinutes')::numeric, 25))))::integer;
  v_break := least(120, greatest(0, round(coalesce((p_session->>'breakMinutes')::numeric, 0))))::integer;
  v_started := to_timestamp(coalesce((p_session->>'startedAt')::double precision, 0) / 1000.0);
  v_stretch := to_timestamp(coalesce((p_session->>'startTime')::double precision, 0) / 1000.0);
  v_planned := least(v_focus * 60.0, greatest(0.0, coalesce((p_session->>'plannedDurationSeconds')::numeric, v_focus * 60.0)));
  v_remain := least(v_focus * 60.0, greatest(0.0, coalesce((p_session->>'pausedRemainingSeconds')::numeric, v_planned)));
  v_paused_at := CASE WHEN v_paused THEN to_timestamp(coalesce((p_session->>'pausedAt')::double precision, 0) / 1000.0) END;
  SELECT coalesce(array_agg(to_timestamp(x::double precision / 1000.0) ORDER BY x::double precision), '{}')
  INTO v_marks FROM jsonb_array_elements_text(coalesce(p_session->'marksAt', '[]'::jsonb)) AS x;

  -- A fresh start: the device clock may be a little off, so the server's time is used.
  IF v_started > now() - interval '2 minutes' AND v_started <= now() + interval '2 minutes'
     AND NOT v_paused AND v_planned >= v_focus * 60.0 - 1 THEN
    v_started := now(); v_stretch := now(); v_planned := v_focus * 60.0; v_marks := '{}';
  END IF;
  -- Never in the future: move the whole session back so it ends where it would.
  v_shift := greatest(interval '0', greatest(v_started, v_stretch, coalesce(v_paused_at, v_stretch)) - now());
  v_started := v_started - v_shift; v_stretch := v_stretch - v_shift; v_paused_at := v_paused_at - v_shift;
  IF v_started < v_floor OR v_stretch < v_floor THEN
    RETURN public.ascend_focus_session_reply(r, false); -- too old to be a live session
  END IF;
  v_stretch := greatest(v_stretch, v_started);
  IF v_paused THEN v_paused_at := least(greatest(v_paused_at, v_stretch), now()); END IF;
  SELECT coalesce(array_agg(m ORDER BY m), '{}') INTO v_marks
  FROM unnest(v_marks) AS m WHERE m >= v_started AND m <= now();

  IF r.user_id IS NOT NULL AND r.status IN ('break', 'ended') AND NOT r.log_claimed
     AND r.end_reason IN ('finished', 'expired') THEN
    v_prev := to_jsonb(r);
  END IF;
  v_rev := coalesce(r.revision, 0) + 1;

  INSERT INTO public.focus_active_sessions AS t (
    user_id, session_id, status, task_name, skill_id, focus_minutes, break_minutes, is_custom,
    started_at, stretch_started_at, stretch_planned_seconds, paused_at, paused_remaining_seconds,
    marks_at, focus_ended_at, end_reason, log_claimed, revision, updated_at, pause_ends_at, break_count)
  VALUES (
    v_user, v_id, CASE WHEN v_paused THEN 'paused' ELSE 'running' END,
    left(coalesce(nullif(btrim(p_session->>'taskName'), ''), 'Deep Focus'), 200),
    left(nullif(btrim(p_session->>'skillId'), ''), 100),
    v_focus, v_break, coalesce((p_session->>'isCustom')::boolean, false),
    v_started, v_stretch, v_planned, v_paused_at, CASE WHEN v_paused THEN v_remain ELSE v_planned END,
    v_marks, NULL, NULL, false, v_rev, now(), NULL, 0)
  ON CONFLICT (user_id) DO UPDATE SET
    session_id = EXCLUDED.session_id, status = EXCLUDED.status, task_name = EXCLUDED.task_name,
    skill_id = EXCLUDED.skill_id, focus_minutes = EXCLUDED.focus_minutes, break_minutes = EXCLUDED.break_minutes,
    is_custom = EXCLUDED.is_custom, started_at = EXCLUDED.started_at, stretch_started_at = EXCLUDED.stretch_started_at,
    stretch_planned_seconds = EXCLUDED.stretch_planned_seconds, paused_at = EXCLUDED.paused_at,
    paused_remaining_seconds = EXCLUDED.paused_remaining_seconds, marks_at = EXCLUDED.marks_at,
    focus_ended_at = NULL, end_reason = NULL, log_claimed = false, revision = EXCLUDED.revision, updated_at = now(),
    pause_ends_at = NULL, break_count = 0
  RETURNING * INTO r;

  -- An uploaded session may already be past its end or its resume window.
  r := public.ascend_focus_session_locked(v_user);
  RETURN public.ascend_focus_session_reply(r, true, false, v_prev);
END;
$$;

-- Plain pause (logout; old apps' Pause). A break that is still on becomes a plain pause from the
-- action time; a break that was already over counts as running (it is paused at the action time).
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
  r := public.ascend_focus_break_due(r, least(coalesce(p_at, now()), now()));
  IF r.status = 'paused' AND r.pause_ends_at IS NOT NULL THEN
    -- Logout during a break: the normal pause from the sign-out (its 30-minute window starts there).
    v_at := least(greatest(coalesce(p_at, now()), r.paused_at), now());
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

-- Resume a plain pause, or end a break early ("End break").
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
  -- A break already over at the action time: the session runs since the break end.
  r := public.ascend_focus_break_due(r, least(coalesce(p_at, now()), now()));
  IF r.status <> 'paused' THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  v_at := least(greatest(coalesce(p_at, now()), r.paused_at), now());
  IF v_at > r.paused_at + interval '30 minutes' THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  UPDATE public.focus_active_sessions
  SET status = 'running', stretch_started_at = v_at, stretch_planned_seconds = r.paused_remaining_seconds,
      paused_at = NULL, pause_ends_at = NULL, revision = r.revision + 1, updated_at = now()
  WHERE user_id = v_user;
  RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), true);
END;
$$;

-- Complete / Discard / Skip break: unchanged, except that a break already over at the action time
-- counts as running (Complete then keeps the minutes since the break end).
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

  r := public.ascend_focus_break_due(r, least(coalesce(p_at, now()), now()));
  IF r.status NOT IN ('running', 'paused')
     OR (p_at IS NOT NULL AND p_reason <> 'completed' AND p_revision IS DISTINCT FROM r.revision) THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  -- End time: now (or the replayed time), never before the stretch, never after the planned end;
  -- a paused session (also one on a break) ends at its pause.
  IF r.status = 'paused' THEN
    v_at := r.paused_at;
    IF least(coalesce(p_at, now()), now()) > r.paused_at + interval '30 minutes' THEN
      -- The resume window ran out first: it expired (closed at the pause, logged by a claim).
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

-- Break: a running session over 25 minutes pauses for 5, 10 or 15 minutes and runs again on its own
-- at the break end. At most 2 per session; not with less than 5 minutes of focus left.
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
  r := public.ascend_focus_break_due(r, least(coalesce(p_at, now()), now()));
  IF r.status <> 'running' OR r.focus_minutes <= 25 OR r.break_count >= 2 THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  v_at := least(greatest(coalesce(p_at, now()), r.stretch_started_at), now());
  v_left := r.stretch_planned_seconds - extract(epoch FROM (v_at - r.stretch_started_at));
  IF v_left < 5 * 60 THEN
    -- Under 5 minutes of focus left (or the plan already finished): no break.
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
  -- A replayed break may already be over.
  RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), true);
END;
$$;

-- "I wasn't back": a stretch that started on its own at a break end restarts from the action time
-- with the same time left, so the minutes since the break end are not counted. Only while that
-- stretch still runs (once the plan finished, the session is ended and logged as usual).
CREATE OR REPLACE FUNCTION public.ascend_focus_session_back(p_session_id text, p_revision integer DEFAULT NULL, p_at timestamptz DEFAULT NULL)
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
  r := public.ascend_focus_break_due(r, least(coalesce(p_at, now()), now()));
  IF r.status <> 'running' OR r.pause_ends_at IS DISTINCT FROM r.stretch_started_at THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  v_at := least(greatest(coalesce(p_at, now()), r.stretch_started_at), now());
  IF v_at >= r.stretch_started_at + make_interval(secs => r.stretch_planned_seconds) THEN
    -- The plan finished first.
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  UPDATE public.focus_active_sessions
  SET status = 'running', stretch_started_at = v_at, stretch_planned_seconds = r.stretch_planned_seconds,
      paused_at = NULL, pause_ends_at = NULL, revision = r.revision + 1, updated_at = now()
  WHERE user_id = v_user;
  RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), true);
END;
$$;

-- Grants: the helper is internal (like ascend_focus_settled); the two new RPCs are for signed-in users
-- only. Replaced functions keep their grants (CREATE OR REPLACE), restated here for clarity.
REVOKE ALL ON FUNCTION public.ascend_focus_break_due(public.focus_active_sessions, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_break_due(public.focus_active_sessions, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.ascend_focus_session_break(text, integer, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_break(text, integer, integer, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ascend_focus_session_back(text, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_back(text, integer, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ascend_focus_settled(public.focus_active_sessions, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_focus_session_locked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_focus_session_start(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ascend_focus_session_pause(text, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ascend_focus_session_resume(text, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ascend_focus_session_end(text, text, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_start(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_pause(text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_resume(text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_end(text, text, integer, timestamptz) TO authenticated;
