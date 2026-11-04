import { trustedNowMs } from '@/lib/clock';
import { todayKey } from '@/lib/dates';
import { FOCUS_MILESTONES, FOCUS_MIN_MINUTES, focusR1Points } from '@/lib/focusPoints';

/**
 * The running focus timer, kept in localStorage under the signed-in account's own key, so every
 * tab of the app shares it and it survives a reload. Another account on this device never sees it.
 * One session at a time: a focus session, then its break.
 *
 * Time only counts while the app is alive (Zakria 2026-11-04): a running tab writes a heartbeat
 * (focusAliveKey) every FOCUS_ALIVE_INTERVAL_MS. When the app was closed, killed or asleep for
 * longer than FOCUS_ALIVE_GRACE_MS, the session counts as paused at the last heartbeat. Logout
 * pauses it too. A paused session can be resumed within FOCUS_RESUME_WINDOW_MS of its pause;
 * after that it is closed at the pause moment: saved with its points from 25 active minutes,
 * dropped below that. Running sessions have no time limit.
 */
/** Before 2026-11-04 the one key for every account (logout removed it). Read once to adopt it. */
export const FOCUS_STORAGE_KEY = 'ascend_active_focus_session';
export const focusStorageKey = (userId: string): string => `${FOCUS_STORAGE_KEY}:${userId}`;
/** Last moment a tab of this account saw the running session (trusted ms). */
export const focusAliveKey = (userId: string): string => `ascend_focus_alive:${userId}`;
/** Device-local "Focus session alerts" switch (Settings). */
export const FOCUS_NOTIFS_PREF_KEY = 'ascend_focus_notifs_enabled';
/** Path the completion notification opens. */
export const PFC_PATH = '/prefrontal-cortex';

/** How long a paused session can still be resumed (Zakria 2026-11-04: 30 minutes). */
export const FOCUS_RESUME_WINDOW_MINUTES = 30;
export const FOCUS_RESUME_WINDOW_MS = FOCUS_RESUME_WINDOW_MINUTES * 60 * 1000;
/** How often a running tab writes its heartbeat. */
export const FOCUS_ALIVE_INTERVAL_MS = 15 * 1000;
/**
 * A longer silence means the app was closed, killed or asleep. Hidden browser tabs may tick only
 * once a minute, so a shorter gap still counts as running.
 */
export const FOCUS_ALIVE_GRACE_MS = 90 * 1000;

export type FocusMode = 'focus' | 'break';

export interface FocusSession {
  /** Stable id of the focus session; its break is `<id>-break`. */
  id: string;
  mode: FocusMode;
  taskName: string;
  skillId?: string;
  /** Planned focus length. */
  focusMinutes: number;
  breakMinutes: number;
  isCustom: boolean;
  /** When the current running stretch began (trusted ms). */
  startTime: number;
  /** Seconds left at startTime. */
  plannedDurationSeconds: number;
  isPaused: boolean;
  pausedRemainingSeconds: number;
  /** Account the session belongs to. */
  userId?: string;
  /** When the session first started (trusted ms). */
  startedAt: number;
  /** When it was paused (trusted ms); null while running. */
  pausedAt: number | null;
  /** Milestones crossed in earlier running stretches (trusted ms, in order). */
  marksAt: number[];
}

export interface FocusPreset {
  focus: number;
  break: number;
}

export const FOCUS_PRESETS: FocusPreset[] = [
  { focus: 25, break: 5 },
  { focus: 50, break: 10 },
  { focus: 90, break: 15 },
];

/** Points a session of this planned length earns when finished (before the daily cap). */
export const focusFinishedPoints = (minutes: number): number => focusR1Points(minutes, minutes);

/** The focus log row of a session: deterministic, so a second completion (other tab, race) is the same row. */
export const focusLogIdFor = (sessionId: string): string => `focus_${sessionId}`;

export const breakIdFor = (sessionId: string): string => `${sessionId}-break`;

export function newSessionId(): string {
  return `${Math.round(trustedNowMs()).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Seconds left, never below 0 nor above what was planned for this stretch. */
export function remainingSeconds(session: FocusSession, nowMs: number = trustedNowMs()): number {
  if (session.isPaused) return Math.max(0, Math.ceil(session.pausedRemainingSeconds));
  const left = session.plannedDurationSeconds - (nowMs - session.startTime) / 1000;
  return Math.min(session.plannedDurationSeconds, Math.max(0, Math.ceil(left)));
}

/** When a running session ends (trusted ms); null while paused. */
export function sessionEndMs(session: FocusSession): number | null {
  return session.isPaused ? null : session.startTime + session.plannedDurationSeconds * 1000;
}

/** Local day a session that ended at this time belongs to. */
export const endDayKey = (endMs: number): string => todayKey(new Date(endMs));

/** "mm:ss", or "h:mm:ss" from an hour up. */
export function formatClock(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Reads a stored session. Older stored shapes get what they lack: an id from their start time, a
 * first start assuming no pause, and a pause stamped `nowMs` (so its resume window starts now).
 */
export function parseSession(raw: string | null, nowMs: number = trustedNowMs()): FocusSession | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<FocusSession> & { totalSessionMinutes?: number };
    if (!p || typeof p !== 'object' || !isNum(p.startTime) || !isNum(p.plannedDurationSeconds)) return null;
    const mode: FocusMode = p.mode === 'break' ? 'break' : 'focus';
    const focusMinutes = isNum(p.focusMinutes) ? p.focusMinutes : isNum(p.totalSessionMinutes) ? p.totalSessionMinutes : 0;
    if (mode === 'focus' && focusMinutes < 1) return null;
    const isPaused = Boolean(p.isPaused);
    const pausedRemainingSeconds = isNum(p.pausedRemainingSeconds) ? p.pausedRemainingSeconds : p.plannedDurationSeconds;
    const leftAtStart = isPaused ? pausedRemainingSeconds : p.plannedDurationSeconds;
    const guessedStart = p.startTime - Math.max(0, focusMinutes * 60 - leftAtStart) * 1000;
    return {
      id: typeof p.id === 'string' && p.id ? p.id : `s${Math.round(p.startTime).toString(36)}`,
      mode,
      taskName: typeof p.taskName === 'string' && p.taskName.trim() ? p.taskName : 'Deep Focus',
      skillId: typeof p.skillId === 'string' && p.skillId ? p.skillId : undefined,
      focusMinutes,
      breakMinutes: isNum(p.breakMinutes) ? p.breakMinutes : 5,
      isCustom: Boolean(p.isCustom),
      startTime: p.startTime,
      plannedDurationSeconds: p.plannedDurationSeconds,
      isPaused,
      pausedRemainingSeconds,
      userId: typeof p.userId === 'string' && p.userId ? p.userId : undefined,
      startedAt: isNum(p.startedAt) ? p.startedAt : Math.min(guessedStart, p.startTime),
      pausedAt: isPaused ? (isNum(p.pausedAt) ? p.pausedAt : nowMs) : null,
      marksAt: Array.isArray(p.marksAt) ? p.marksAt.filter(isNum) : [],
    };
  } catch {
    return null;
  }
}

/**
 * The account's stored session. A session under the pre-2026-11-04 shared key is adopted once
 * (moved to this account's key): that key was removed at every logout, so it can only be the
 * signed-in account's. A session stamped with another account is never returned.
 */
export function readStoredSession(userId: string | null, nowMs: number = trustedNowMs()): FocusSession | null {
  if (!userId) return null;
  try {
    const own = parseSession(localStorage.getItem(focusStorageKey(userId)), nowMs);
    if (own) return own.userId && own.userId !== userId ? null : { ...own, userId };
    const legacy = parseSession(localStorage.getItem(FOCUS_STORAGE_KEY), nowMs);
    if (!legacy || (legacy.userId && legacy.userId !== userId)) return null;
    const adopted = { ...legacy, userId };
    localStorage.setItem(focusStorageKey(userId), JSON.stringify(adopted));
    localStorage.removeItem(FOCUS_STORAGE_KEY);
    return adopted;
  } catch {
    return null;
  }
}

/** False when storage is unavailable: the session then lives in this tab only. */
export function writeStoredSession(userId: string | null, session: FocusSession | null): boolean {
  if (!userId) return false;
  try {
    if (session) localStorage.setItem(focusStorageKey(userId), JSON.stringify({ ...session, userId }));
    else {
      localStorage.removeItem(focusStorageKey(userId));
      localStorage.removeItem(focusAliveKey(userId));
    }
    return true;
  } catch {
    return false;
  }
}

export function readAlive(userId: string | null): number | null {
  if (!userId) return null;
  try {
    const value = Number(localStorage.getItem(focusAliveKey(userId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeAlive(userId: string | null, atMs: number): void {
  if (!userId) return;
  try {
    localStorage.setItem(focusAliveKey(userId), String(Math.round(atMs)));
  } catch {
    /* storage unavailable: the gap check then has nothing to go on */
  }
}

// --- Session time, milestones and the pause / close rules (pure; tested in __tests__) ---

/** Seconds of focus done by `atMs` (paused time excluded), 0..planned. */
export function activeSecondsAt(session: FocusSession, atMs: number): number {
  const total = session.focusMinutes * 60;
  const left = session.isPaused
    ? session.pausedRemainingSeconds
    : session.plannedDurationSeconds - (Math.max(atMs, session.startTime) - session.startTime) / 1000;
  return Math.min(total, Math.max(0, total - Math.max(0, left)));
}

export const activeMinutesAt = (session: FocusSession, atMs: number): number => Math.floor(activeSecondsAt(session, atMs) / 60);

/** Milestones crossed by `untilMs`: the stored ones plus those of the running stretch (trusted ms). */
export function milestoneTimes(session: FocusSession, untilMs: number): number[] {
  const marks = [...session.marksAt];
  if (session.isPaused || session.mode !== 'focus') return marks;
  const activeAtStretch = session.focusMinutes * 60 - session.plannedDurationSeconds;
  const stretchEnd = Math.min(untilMs, session.startTime + session.plannedDurationSeconds * 1000);
  for (const minutes of FOCUS_MILESTONES) {
    if (minutes > session.focusMinutes) break;
    const need = minutes * 60 - activeAtStretch;
    if (need <= 0) continue; // crossed in an earlier stretch (already in marksAt)
    const at = session.startTime + need * 1000;
    if (at <= stretchEnd) marks.push(at);
  }
  return marks;
}

/** The session paused at `atMs` (never before its current stretch began). */
export function pauseAt(session: FocusSession, atMs: number): FocusSession {
  if (session.isPaused) return session;
  const at = Math.max(atMs, session.startTime);
  const left = Math.max(0, session.plannedDurationSeconds - (at - session.startTime) / 1000);
  return { ...session, marksAt: milestoneTimes(session, at), isPaused: true, pausedRemainingSeconds: left, pausedAt: at };
}

/** The session running again from `atMs` with the time it had left. */
export function resumeAt(session: FocusSession, atMs: number): FocusSession {
  if (!session.isPaused) return session;
  return { ...session, startTime: atMs, plannedDurationSeconds: session.pausedRemainingSeconds, isPaused: false, pausedAt: null };
}

/** When a paused session stops being resumable (trusted ms); null while running. */
export const resumeDeadlineMs = (session: FocusSession): number | null =>
  session.isPaused && session.pausedAt !== null ? session.pausedAt + FOCUS_RESUME_WINDOW_MS : null;

/** True while the pause is within the resume window (30:00 still resumes, 30:01 does not). */
export function canResume(session: FocusSession, nowMs: number): boolean {
  const deadline = resumeDeadlineMs(session);
  return deadline === null || nowMs <= deadline;
}

/** What closing the focus session at `endMs` logs: saved from 25 active minutes. */
export interface FocusClose {
  sessionId: string;
  taskName: string;
  skillId?: string;
  endMs: number;
  startedAtMs: number;
  activeMinutes: number;
  plannedMinutes: number;
  milestonesAt: number[];
  save: boolean;
  points: number;
}

export function closeAt(session: FocusSession, endMs: number): FocusClose {
  const activeMinutes = activeMinutesAt(session, endMs);
  return {
    sessionId: session.id,
    taskName: session.taskName,
    skillId: session.skillId,
    endMs,
    startedAtMs: session.startedAt,
    activeMinutes,
    plannedMinutes: session.focusMinutes,
    milestonesAt: milestoneTimes(session, endMs),
    save: activeMinutes >= FOCUS_MIN_MINUTES,
    points: focusR1Points(activeMinutes, session.focusMinutes),
  };
}

export type FocusNotice =
  | { kind: 'expired'; saved: boolean; minutes: number }
  | { kind: 'gap'; minutes: number };

export interface FocusSettle {
  /** The session to keep (null: none left). */
  session: FocusSession | null;
  /** A focus session closed now: log it when `save`. */
  close: FocusClose | null;
  notice: FocusNotice | null;
  changed: boolean;
}

/**
 * Applies the alive and resume-window rules to a stored focus session at `nowMs`:
 * - Running but the last heartbeat (`aliveMs`) is older than the grace: the app was gone, so it
 *   counts as paused at the heartbeat. Back within the resume window it runs on (the gap is not
 *   counted); later it is closed at the heartbeat. A session whose end came before the heartbeat
 *   is left alone, so it ends normally with its full time.
 * - Paused for longer than the resume window: closed at its pause moment.
 * Breaks and sessions with no heartbeat yet (aliveMs null) are left alone.
 */
export function settleSession(session: FocusSession | null, nowMs: number, aliveMs: number | null): FocusSettle {
  const same: FocusSettle = { session, close: null, notice: null, changed: false };
  if (!session || session.mode !== 'focus') return same;
  let current = session;
  let gapMinutes = 0;
  if (!current.isPaused) {
    if (aliveMs === null || nowMs - aliveMs <= FOCUS_ALIVE_GRACE_MS) return same;
    const endMs = current.startTime + current.plannedDurationSeconds * 1000;
    if (endMs <= aliveMs) return same;
    current = pauseAt(current, aliveMs);
    gapMinutes = Math.max(0, Math.round((nowMs - (current.pausedAt ?? nowMs)) / 60000));
    if (canResume(current, nowMs)) {
      return { session: resumeAt(current, nowMs), close: null, notice: { kind: 'gap', minutes: gapMinutes }, changed: true };
    }
  }
  if (canResume(current, nowMs)) return current === session ? same : { ...same, session: current, changed: true };
  const close = closeAt(current, current.pausedAt ?? nowMs);
  return {
    session: null,
    close,
    notice: { kind: 'expired', saved: close.save, minutes: close.activeMinutes },
    changed: true,
  };
}

/**
 * Logout on this device: a running focus session is paused (at the last heartbeat when the app
 * was already gone, else now) and kept for this account; a break is dropped. A session whose
 * time ran out before is left running, so the next sign-in ends and logs it as usual.
 */
export function pauseForSignOut(session: FocusSession | null, nowMs: number, aliveMs: number | null): FocusSession | null {
  if (!session) return null;
  if (session.mode === 'break') return null;
  if (session.isPaused) return session;
  const at = aliveMs !== null && nowMs - aliveMs > FOCUS_ALIVE_GRACE_MS ? aliveMs : nowMs;
  const endMs = session.startTime + session.plannedDurationSeconds * 1000;
  if (endMs <= at) return session;
  return pauseAt(session, at);
}

/** Pauses every stored session on this device (only one account is ever signed in here). */
export function pauseStoredSessionsForSignOut(nowMs: number = trustedNowMs()): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const prefix = `${FOCUS_STORAGE_KEY}:`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) {
      const userId = key.slice(prefix.length);
      const next = pauseForSignOut(parseSession(localStorage.getItem(key), nowMs), nowMs, readAlive(userId));
      if (next) localStorage.setItem(key, JSON.stringify({ ...next, userId }));
      else localStorage.removeItem(key);
    }
    // A pre-2026-11-04 session under the shared key: pause it as well (adopted at the next sign-in).
    const legacy = parseSession(localStorage.getItem(FOCUS_STORAGE_KEY), nowMs);
    if (legacy) {
      const next = pauseForSignOut(legacy, nowMs, null);
      if (next) localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(FOCUS_STORAGE_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

/** Account deletion: this account's stored session goes with it. */
export function dropStoredSession(userId: string): void {
  writeStoredSession(userId, null);
}

export function focusAlertsEnabled(): boolean {
  try {
    return localStorage.getItem(FOCUS_NOTIFS_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Active minutes from which a session is saved (and Complete replaces Discard). */
export const FOCUS_MIN_MINUTES_TO_SAVE = FOCUS_MIN_MINUTES;
