-- Deep Focus: one running session per account, shared by all the account's devices
-- (knowledge/mode-a-focus-crossdevice-skill-2026-11-05.md §2; Zakria's go 2026-11-05 "han").
--
-- Start on the PC, open the phone: the phone shows the same session and can pause, resume,
-- complete or discard it. Logout on one device pauses it everywhere (resume or complete from any
-- device within 30 minutes). A session whose planned end passed while every device was closed is
-- ended at its planned end by the first device that opens.
--
-- Design:
--   * public.focus_active_sessions: ONE row per user (PK user_id), never deleted while the account
--     lives (an ended session stays as status 'ended' until the next start overwrites it), so
--     realtime only sends INSERT/UPDATE events, which the app filters by user_id.
--   * The app can only SELECT its own row (RLS). Every change goes through the SECURITY DEFINER
--     functions below, which take the time from the server (now()); a time the app sends (an action
--     made offline, replayed later) is clamped into what is possible and is only taken when the app
--     saw the latest revision. Every change adds 1 to `revision`.
--   * Statuses: running / paused (the focus part), break (the focus part finished at its planned
--     end and its break is still running), ended. focus_ended_at + end_reason say how the focus part
--     ended: completed, discarded (Complete/Discard on a device), finished (planned end), expired
--     (paused longer than 30 minutes: closed at the pause), replaced (overwritten by a new start).
--   * log_claimed: the focus log of a finished/expired session is written by ONE device (the one
--     whose claim succeeds), so a device that opens later can never overwrite a reflection saved on
--     another. Completed/discarded are claimed by the device that ended them.
--   * Points are NOT touched: the app still writes the focus_logs row 'focus_<session_id>' through
--     its outbox, and focus_logs_award_points / R1 / late-day / cap stay exactly as they are.
--     This table never writes point_entries.
--   * Old app versions never call these functions and keep their device-only session (harmless).
--
-- Mirrors (change together): src/lib/focusSession.ts (activeSecondsAt, milestoneTimes, pauseAt,
-- resumeAt, FOCUS_RESUME_WINDOW_MS = 30 min, FOCUS_MIN_MINUTES = 25), src/lib/focusPoints.ts
-- (FOCUS_MILESTONES), src/lib/focusServerSession.ts (row mapping and replay).
--
-- Rollback: work/snapshots/focus-crossdevice-2026-11-05/ROLLBACK.md (drop functions + table; revert
-- the app first or it falls back to device-only sessions on its own).

BEGIN;

CREATE TABLE IF NOT EXISTS public.focus_active_sessions (
  user_id                  uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id               text        NOT NULL CHECK (length(session_id) BETWEEN 1 AND 64),
  status                   text        NOT NULL CHECK (status IN ('running', 'paused', 'break', 'ended')),
  task_name                text        NOT NULL DEFAULT 'Deep Focus' CHECK (length(task_name) <= 200),
  skill_id                 text        CHECK (skill_id IS NULL OR length(skill_id) <= 100),
  focus_minutes            integer     NOT NULL CHECK (focus_minutes BETWEEN 1 AND 600),
  break_minutes            integer     NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 120),
  is_custom                boolean     NOT NULL DEFAULT false,
  started_at               timestamptz NOT NULL,
  stretch_started_at       timestamptz NOT NULL,
  stretch_planned_seconds  numeric     NOT NULL CHECK (stretch_planned_seconds >= 0),
  paused_at                timestamptz,
  paused_remaining_seconds numeric     NOT NULL DEFAULT 0 CHECK (paused_remaining_seconds >= 0),
  marks_at                 timestamptz[] NOT NULL DEFAULT '{}',
  focus_ended_at           timestamptz,
  end_reason               text        CHECK (end_reason IN ('completed', 'discarded', 'finished', 'expired', 'replaced')),
  log_claimed              boolean     NOT NULL DEFAULT false,
  revision                 integer     NOT NULL DEFAULT 1,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.focus_active_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner can read" ON public.focus_active_sessions;
CREATE POLICY "Owner can read" ON public.focus_active_sessions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.focus_active_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.focus_active_sessions TO authenticated;
GRANT ALL ON public.focus_active_sessions TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'focus_active_sessions')
     AND EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.focus_active_sessions;
  END IF;
END $$;

-- Seconds of focus done by p_at (paused time excluded), 0..planned. Mirror of activeSecondsAt.
CREATE OR REPLACE FUNCTION public.ascend_focus_active_seconds(r public.focus_active_sessions, p_at timestamptz)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT least(r.focus_minutes * 60.0, greatest(0.0, r.focus_minutes * 60.0 - greatest(0.0,
    CASE WHEN r.status = 'paused' THEN r.paused_remaining_seconds
         ELSE r.stretch_planned_seconds
              - extract(epoch FROM (greatest(p_at, r.stretch_started_at) - r.stretch_started_at)) END)));
$function$;

-- The marks of a running stretch paused at p_at: the stored ones plus the milestones this stretch
-- crossed by p_at. Mirror of milestoneTimes (FOCUS_MILESTONES 25, 35, ..., 85).
CREATE OR REPLACE FUNCTION public.ascend_focus_marks_until(r public.focus_active_sessions, p_at timestamptz)
 RETURNS timestamptz[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT r.marks_at || coalesce(array_agg(t.at ORDER BY t.at), '{}')
  FROM (
    SELECT r.stretch_started_at + make_interval(secs => m * 60 - (r.focus_minutes * 60 - r.stretch_planned_seconds)) AS at
    FROM unnest(ARRAY[25, 35, 45, 55, 65, 75, 85]) AS m
    WHERE m <= r.focus_minutes
      AND m * 60 - (r.focus_minutes * 60 - r.stretch_planned_seconds) > 0
  ) t
  WHERE t.at <= least(p_at, r.stretch_started_at + make_interval(secs => r.stretch_planned_seconds));
$function$;

-- The row as it is at p_at: a running focus part past its planned end has finished (break or
-- ended), a pause older than 30 minutes has expired (closed at the pause), a break that ran out has
-- ended. Pure: the caller stores it when it changed.
CREATE OR REPLACE FUNCTION public.ascend_focus_settled(r public.focus_active_sessions, p_at timestamptz)
 RETURNS public.focus_active_sessions
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
$function$;

-- Internal: locks the caller's row, settles it at now() and stores the settled row. Returns it
-- (user_id NULL when the account has no row yet).
CREATE OR REPLACE FUNCTION public.ascend_focus_session_locked(p_user uuid)
 RETURNS public.focus_active_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        log_claimed = s.log_claimed, revision = r.revision + 1, updated_at = now()
    WHERE user_id = p_user
    RETURNING * INTO s;
  END IF;
  RETURN s;
END;
$function$;

-- Internal: the answer every public function returns.
CREATE OR REPLACE FUNCTION public.ascend_focus_session_reply(
  r public.focus_active_sessions, p_applied boolean, p_claimed boolean DEFAULT false, p_previous jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'row', CASE WHEN r.user_id IS NULL THEN NULL ELSE to_jsonb(r) END,
    'applied', p_applied,
    'claimed', p_claimed,
    'previous', p_previous,
    'server_now', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
$function$;

-- 1. Read (and settle) the caller's session.
CREATE OR REPLACE FUNCTION public.ascend_focus_session_get()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), true);
END;
$function$;

-- 2. Start (or upload a session started offline / before this build). p_session holds the local
-- session: id, taskName, skillId, focusMinutes, breakMinutes, isCustom, startedAt, startTime,
-- plannedDurationSeconds, isPaused, pausedAt, pausedRemainingSeconds, marksAt (ms since epoch).
-- Refused (applied false) while another session is running or paused. Times are clamped: never in
-- the future, never more than 24 h ago; a fresh start (all times within 2 minutes of now) is
-- stamped with now(). A finished/expired session that nobody logged yet is handed back in
-- 'previous' (claimed by this call), so the starting device logs it before it is overwritten.
CREATE OR REPLACE FUNCTION public.ascend_focus_session_start(p_session jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    marks_at, focus_ended_at, end_reason, log_claimed, revision, updated_at)
  VALUES (
    v_user, v_id, CASE WHEN v_paused THEN 'paused' ELSE 'running' END,
    left(coalesce(nullif(btrim(p_session->>'taskName'), ''), 'Deep Focus'), 200),
    left(nullif(btrim(p_session->>'skillId'), ''), 100),
    v_focus, v_break, coalesce((p_session->>'isCustom')::boolean, false),
    v_started, v_stretch, v_planned, v_paused_at, CASE WHEN v_paused THEN v_remain ELSE v_planned END,
    v_marks, NULL, NULL, false, v_rev, now())
  ON CONFLICT (user_id) DO UPDATE SET
    session_id = EXCLUDED.session_id, status = EXCLUDED.status, task_name = EXCLUDED.task_name,
    skill_id = EXCLUDED.skill_id, focus_minutes = EXCLUDED.focus_minutes, break_minutes = EXCLUDED.break_minutes,
    is_custom = EXCLUDED.is_custom, started_at = EXCLUDED.started_at, stretch_started_at = EXCLUDED.stretch_started_at,
    stretch_planned_seconds = EXCLUDED.stretch_planned_seconds, paused_at = EXCLUDED.paused_at,
    paused_remaining_seconds = EXCLUDED.paused_remaining_seconds, marks_at = EXCLUDED.marks_at,
    focus_ended_at = NULL, end_reason = NULL, log_claimed = false, revision = EXCLUDED.revision, updated_at = now()
  RETURNING * INTO r;

  -- An uploaded session may already be past its end or its resume window.
  r := public.ascend_focus_session_locked(v_user);
  RETURN public.ascend_focus_session_reply(r, true, false, v_prev);
END;
$function$;

-- 3. Pause. p_at: when the device paused (an action replayed after being offline); NULL = now.
-- A given p_at is only taken when p_revision is the current revision (else applied false: the
-- server's row wins), and is clamped into the running stretch and never after now().
CREATE OR REPLACE FUNCTION public.ascend_focus_session_pause(p_session_id text, p_revision integer DEFAULT NULL, p_at timestamptz DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  r      public.focus_active_sessions;
  v_at   timestamptz;
  v_end  timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('focus_session:' || v_user::text));
  SELECT * INTO r FROM public.focus_active_sessions WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND OR r.session_id IS DISTINCT FROM p_session_id OR r.status <> 'running'
     OR (p_at IS NOT NULL AND p_revision IS DISTINCT FROM r.revision) THEN
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
      marks_at = public.ascend_focus_marks_until(r, v_at),
      paused_at = v_at,
      paused_remaining_seconds = greatest(0.0, r.stretch_planned_seconds - extract(epoch FROM (v_at - r.stretch_started_at))),
      revision = r.revision + 1, updated_at = now()
  WHERE user_id = v_user;
  -- A replayed pause may already be older than the resume window.
  RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), true);
END;
$function$;

-- 4. Resume within 30 minutes of the pause. p_at / p_revision as for pause (clamped into
-- [paused_at, now()], refused when later than the resume window).
CREATE OR REPLACE FUNCTION public.ascend_focus_session_resume(p_session_id text, p_revision integer DEFAULT NULL, p_at timestamptz DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  r      public.focus_active_sessions;
  v_at   timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('focus_session:' || v_user::text));
  SELECT * INTO r FROM public.focus_active_sessions WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND OR r.session_id IS DISTINCT FROM p_session_id OR r.status <> 'paused'
     OR (p_at IS NOT NULL AND p_revision IS DISTINCT FROM r.revision) THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  v_at := least(greatest(coalesce(p_at, now()), r.paused_at), now());
  IF v_at > r.paused_at + interval '30 minutes' THEN
    RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), false);
  END IF;
  UPDATE public.focus_active_sessions
  SET status = 'running', stretch_started_at = v_at, stretch_planned_seconds = r.paused_remaining_seconds,
      paused_at = NULL, revision = r.revision + 1, updated_at = now()
  WHERE user_id = v_user;
  RETURN public.ascend_focus_session_reply(public.ascend_focus_session_locked(v_user), true);
END;
$function$;

-- 5. End on a device: 'completed' (needs 25 active minutes at the end), 'discarded' (under 25),
-- 'break_skipped' (ends a running break). p_at as for pause; a 'completed' replay is taken even when
-- the revision moved (its log is already written on that device), as long as this session is still
-- live. Idempotent: ending a session that already ended returns it with applied false.
-- claimed true = this call ended it (the caller writes the log; nobody else does).
CREATE OR REPLACE FUNCTION public.ascend_focus_session_end(p_session_id text, p_reason text, p_revision integer DEFAULT NULL, p_at timestamptz DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- a paused session ends at its pause.
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
$function$;

-- 6. Claim the log of a session that finished at its planned end or expired after a long pause.
-- Exactly one call per session gets claimed true; that device writes the focus log.
CREATE OR REPLACE FUNCTION public.ascend_focus_session_claim(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  r      public.focus_active_sessions;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  r := public.ascend_focus_session_locked(v_user);
  IF r.user_id IS NULL OR r.session_id IS DISTINCT FROM p_session_id OR r.status NOT IN ('break', 'ended')
     OR r.log_claimed OR r.end_reason NOT IN ('finished', 'expired') THEN
    RETURN public.ascend_focus_session_reply(r, false);
  END IF;
  UPDATE public.focus_active_sessions SET log_claimed = true, revision = r.revision + 1, updated_at = now()
  WHERE user_id = v_user RETURNING * INTO r;
  RETURN public.ascend_focus_session_reply(r, true, true);
END;
$function$;

REVOKE ALL ON FUNCTION public.ascend_focus_active_seconds(public.focus_active_sessions, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_focus_marks_until(public.focus_active_sessions, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_focus_settled(public.focus_active_sessions, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_focus_session_locked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_focus_session_reply(public.focus_active_sessions, boolean, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ascend_focus_session_get() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ascend_focus_session_start(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ascend_focus_session_pause(text, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ascend_focus_session_resume(text, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ascend_focus_session_end(text, text, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ascend_focus_session_claim(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_get() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_start(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_pause(text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_resume(text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_end(text, text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_focus_session_claim(text) TO authenticated;

COMMIT;
