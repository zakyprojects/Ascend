import {
  FOCUS_MIN_MINUTES_TO_SAVE,
  breakIdFor,
  closeAt,
  readFocusOps,
  writeFocusOps,
  type FocusClose,
  type FocusNotice,
  type FocusOp,
  type FocusSession,
} from '@/lib/focus/focusSession';

/**
 * One running Deep Focus session per account, shared by all its devices (Zakria 2026-11-05).
 *
 * The server row (public.focus_active_sessions, supabase/migrations/20261105170000_focus_active_sessions.sql)
 * is the truth; every change goes through its RPCs, which take the time from the server. This
 * device still acts at once on its own copy (localStorage, focusSession.ts), queues the action
 * (readFocusOps) and replays it here; a replayed action carries the time it was taken and the
 * revision it was based on, and the server takes it only when nobody changed the session
 * meanwhile (otherwise the server's row wins and this device follows it).
 *
 * Logs: the focus log of a session is written by exactly one device. Complete/Discard: the device
 * that pressed it (it writes the log at once, as before). Finished at the planned end or expired
 * after a long pause: the device whose claim succeeds (ascend_focus_session_claim), so a device
 * opened later never overwrites a reflection saved on another one.
 *
 * Old app versions never call this and keep a device-only session. When the RPCs are missing
 * (database without the migration) or the network fails, the provider falls back to the
 * device-only rules of focusSession.ts.
 */

export type FocusServerStatus = 'running' | 'paused' | 'break' | 'ended';
export type FocusEndReason = 'completed' | 'discarded' | 'finished' | 'expired' | 'replaced';

export interface FocusServerRow {
  session_id: string;
  status: FocusServerStatus;
  task_name: string;
  skill_id: string | null;
  focus_minutes: number;
  break_minutes: number;
  is_custom: boolean;
  started_at: string;
  stretch_started_at: string;
  stretch_planned_seconds: number | string;
  paused_at: string | null;
  paused_remaining_seconds: number | string;
  marks_at: string[] | null;
  focus_ended_at: string | null;
  end_reason: FocusEndReason | null;
  log_claimed: boolean;
  revision: number;
}

export interface FocusServerReply {
  row: FocusServerRow | null;
  applied: boolean;
  claimed: boolean;
  previous: FocusServerRow | null;
}

const ms = (value: string | null | undefined): number => {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : 0;
};
const num = (value: number | string | null | undefined): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};
const STATUSES: readonly FocusServerStatus[] = ['running', 'paused', 'break', 'ended'];

export function parseRow(raw: unknown): FocusServerRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<FocusServerRow>;
  if (typeof r.session_id !== 'string' || !STATUSES.includes(r.status as FocusServerStatus)) return null;
  if (typeof r.revision !== 'number' || typeof r.stretch_started_at !== 'string') return null;
  return {
    ...(r as FocusServerRow),
    marks_at: Array.isArray(r.marks_at) ? r.marks_at.filter((m) => typeof m === 'string') : [],
  };
}

export function parseReply(raw: unknown): FocusServerReply | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.applied !== 'boolean') return null;
  return { row: parseRow(r.row), applied: r.applied, claimed: r.claimed === true, previous: parseRow(r.previous) };
}

export const isLiveRow = (row: FocusServerRow | null): boolean =>
  Boolean(row && (row.status === 'running' || row.status === 'paused'));

/** What this device shows for a server row: the focus session, its break, or nothing once ended. */
export function rowToSession(row: FocusServerRow | null, userId?: string): FocusSession | null {
  if (!row || row.status === 'ended') return null;
  const base = {
    taskName: row.task_name || 'Deep Focus',
    skillId: row.skill_id || undefined,
    focusMinutes: row.focus_minutes,
    breakMinutes: row.break_minutes,
    isCustom: row.is_custom,
    userId,
    startedAt: ms(row.started_at),
    revision: row.revision,
  };
  if (row.status === 'break') {
    const seconds = Math.max(0, Math.round(row.break_minutes * 60));
    return {
      ...base,
      id: breakIdFor(row.session_id),
      mode: 'break',
      startTime: ms(row.focus_ended_at),
      plannedDurationSeconds: seconds,
      isPaused: false,
      pausedRemainingSeconds: seconds,
      pausedAt: null,
      marksAt: [],
    };
  }
  const paused = row.status === 'paused';
  return {
    ...base,
    id: row.session_id,
    mode: 'focus',
    startTime: ms(row.stretch_started_at),
    plannedDurationSeconds: num(row.stretch_planned_seconds),
    isPaused: paused,
    pausedRemainingSeconds: paused ? num(row.paused_remaining_seconds) : num(row.stretch_planned_seconds),
    pausedAt: paused ? ms(row.paused_at) : null,
    marksAt: (row.marks_at || []).map(ms).filter((t) => t > 0),
  };
}

/** The focus part of an ended (or on-break) row as it was at its end, and what closing it logs. */
export function rowClose(row: FocusServerRow, userId?: string): FocusClose | null {
  if (row.status === 'running' || row.status === 'paused' || !row.focus_ended_at) return null;
  const endMs = ms(row.focus_ended_at);
  const remaining =
    row.end_reason === 'finished'
      ? Math.max(0, num(row.stretch_planned_seconds) - (endMs - ms(row.stretch_started_at)) / 1000)
      : num(row.paused_remaining_seconds);
  const atEnd: FocusSession = {
    id: row.session_id,
    mode: 'focus',
    taskName: row.task_name || 'Deep Focus',
    skillId: row.skill_id || undefined,
    focusMinutes: row.focus_minutes,
    breakMinutes: row.break_minutes,
    isCustom: row.is_custom,
    userId,
    startedAt: ms(row.started_at),
    startTime: ms(row.stretch_started_at),
    plannedDurationSeconds: num(row.stretch_planned_seconds),
    isPaused: true,
    pausedRemainingSeconds: remaining,
    pausedAt: endMs,
    marksAt: (row.marks_at || []).map(ms).filter((t) => t > 0),
  };
  return closeAt(atEnd, endMs);
}

/** A finished plan is always logged (as before); an expired session only from 25 active minutes. */
export const closeIsLogged = (row: FocusServerRow, close: FocusClose): boolean =>
  row.end_reason === 'finished' || (row.end_reason === 'expired' && close.activeMinutes >= FOCUS_MIN_MINUTES_TO_SAVE);

export interface FocusReconcile {
  /** What to store and show on this device. */
  session: FocusSession | null;
  /** Session id whose log should be claimed (finished/expired, nobody logged it yet). */
  claim: string | null;
  /** The local session should be uploaded (started offline, or before this build). */
  adopt: boolean;
  notice: FocusNotice | null;
}

/**
 * Brings this device's copy in line with the server row (no actions are waiting). Pure.
 * - No row: a local focus session the server never had is uploaded (adopt).
 * - A live row (running/paused): shown, whatever this device had. A local session the server
 *   never confirmed with another id lost the race (another device's session was there first): it is
 *   dropped with a notice, never run in parallel.
 * - A break/ended row: its log is claimed when nobody logged it; a local session started here
 *   after it (never confirmed) is uploaded; a session this device was still showing that another
 *   device completed or discarded gets a notice.
 */
export function reconcile(local: FocusSession | null, row: FocusServerRow | null, userId?: string): FocusReconcile {
  const unconfirmed = Boolean(local && local.mode === 'focus' && local.revision === undefined && !local.localOnly);
  if (!row) return { session: local, claim: null, adopt: unconfirmed, notice: null };

  if (row.status === 'running' || row.status === 'paused') {
    const lost = unconfirmed && local!.id !== row.session_id;
    return { session: rowToSession(row, userId), claim: null, adopt: false, notice: lost ? { kind: 'replaced' } : null };
  }

  const claim = !row.log_claimed && (row.end_reason === 'finished' || row.end_reason === 'expired') ? row.session_id : null;
  if (unconfirmed && local!.id !== row.session_id) return { session: local, claim, adopt: true, notice: null };
  if (local?.localOnly && local.id !== row.session_id && local.id !== breakIdFor(row.session_id)) {
    return { session: local, claim, adopt: false, notice: null };
  }
  const endedElsewhere =
    local && local.mode === 'focus' && local.id === row.session_id && (row.end_reason === 'completed' || row.end_reason === 'discarded');
  return {
    session: rowToSession(row, userId),
    claim,
    adopt: false,
    notice: endedElsewhere ? { kind: 'elsewhere', reason: row.end_reason as 'completed' | 'discarded' } : null,
  };
}

// --- Transport ---

export type FocusRpcResult = { ok: true; reply: FocusServerReply } | { ok: false; missing: boolean };

/** The six RPCs (injectable for tests). */
export interface FocusTransport {
  call: (fn: string, args: Record<string, unknown>) => Promise<FocusRpcResult>;
}

/** PostgREST answers this when the function does not exist (database without the migration). */
const isMissingFunction = (error: { code?: string; message?: string } | null): boolean =>
  Boolean(error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || '')));

export const supabaseFocusTransport: FocusTransport = {
  async call(fn, args) {
    try {
      const { supabase, isSupabaseConfigured } = await import('../auth/supabase');
      if (!isSupabaseConfigured) return { ok: false, missing: true };
      const { data, error } = await supabase.rpc(fn, args);
      if (error) return { ok: false, missing: isMissingFunction(error) };
      const reply = parseReply(data);
      return reply ? { ok: true, reply } : { ok: false, missing: false };
    } catch {
      return { ok: false, missing: false };
    }
  },
};

const iso = (t: number): string => new Date(t).toISOString();

/** Sends one queued action. */
export function sendOp(transport: FocusTransport, op: FocusOp, revision: number | undefined): Promise<FocusRpcResult> {
  switch (op.kind) {
    case 'start': {
      const s = op.session;
      return transport.call('ascend_focus_session_start', {
        p_session: {
          id: s.id,
          taskName: s.taskName,
          skillId: s.skillId ?? null,
          focusMinutes: s.focusMinutes,
          breakMinutes: s.breakMinutes,
          isCustom: s.isCustom,
          startedAt: s.startedAt,
          startTime: s.startTime,
          plannedDurationSeconds: s.plannedDurationSeconds,
          isPaused: s.isPaused,
          pausedAt: s.pausedAt,
          pausedRemainingSeconds: s.pausedRemainingSeconds,
          marksAt: s.marksAt,
        },
      });
    }
    case 'pause':
    case 'resume':
      return transport.call(op.kind === 'pause' ? 'ascend_focus_session_pause' : 'ascend_focus_session_resume', {
        p_session_id: op.sessionId,
        p_revision: revision ?? null,
        p_at: iso(op.atMs),
      });
    case 'end':
      return transport.call('ascend_focus_session_end', {
        p_session_id: op.sessionId,
        p_reason: op.reason,
        p_revision: revision ?? null,
        p_at: iso(op.atMs),
      });
  }
}

export interface FocusFlush {
  /** False when the network failed (the queue is kept) or the RPCs are missing. */
  ok: boolean;
  missing: boolean;
  /** The latest server reply seen (null when none was sent or all failed). */
  reply: FocusServerReply | null;
  /** Rows handed back by a start that overwrote an unlogged finished/expired session (claimed). */
  previous: FocusServerRow[];
  /** A start was refused because another session was live (this device's session lost). */
  startRefused: boolean;
  /** A start the server would not take for another reason (older than 24 h): that session id stays device-only. */
  startLocalOnly: string | null;
}

/**
 * Replays this account's queued actions in order. Each one is based on the revision the one before
 * it produced (the first on its own baseRevision / the local copy's revision). An action the server
 * did not take ends the replay: the rest of that session's queue is dropped and the server row wins.
 * A network failure keeps the queue for the next try.
 */
export async function flushOps(transport: FocusTransport, userId: string, startRevision: number | undefined): Promise<FocusFlush> {
  let ops = readFocusOps(userId);
  let revision = startRevision;
  let reply: FocusServerReply | null = null;
  const previous: FocusServerRow[] = [];
  let startRefused = false;
  let startLocalOnly: string | null = null;
  while (ops.length > 0) {
    const op = ops[0];
    const base = op.kind === 'start' ? undefined : (op.baseRevision ?? revision);
    const result = await sendOp(transport, op, base);
    if (!result.ok) return { ok: false, missing: result.missing, reply, previous, startRefused, startLocalOnly };
    reply = result.reply;
    if (reply.previous) previous.push(reply.previous);
    // Re-read: another tab may have queued more meanwhile (the queue is shared through storage).
    const now = readFocusOps(userId);
    const sameHead = now.length > 0 && JSON.stringify(now[0]) === JSON.stringify(op);
    ops = sameHead ? now.slice(1) : now;
    if (reply.applied) {
      revision = reply.row?.revision;
    } else {
      if (op.kind === 'start') {
        if (isLiveRow(reply.row) && reply.row?.session_id !== op.sessionId) startRefused = true;
        else if (reply.row?.session_id !== op.sessionId) startLocalOnly = op.sessionId;
      }
      ops = ops.filter((o) => o.sessionId !== op.sessionId);
      revision = reply.row?.revision;
    }
    writeFocusOps(userId, ops);
  }
  return { ok: true, missing: false, reply, previous, startRefused, startLocalOnly };
}

export async function fetchRow(transport: FocusTransport): Promise<FocusRpcResult> {
  return transport.call('ascend_focus_session_get', {});
}

export async function claimLog(transport: FocusTransport, sessionId: string): Promise<FocusRpcResult> {
  return transport.call('ascend_focus_session_claim', { p_session_id: sessionId });
}
