import { trustedNowMs } from '@/lib/clock';
import { todayKey } from '@/lib/dates';
import { calculateFocusPoints } from '@/lib/pointsConfig';

/**
 * The running focus timer, kept in localStorage so every tab of the app shares it and it survives
 * a reload or closing the app. One session at a time: a focus session, then its break.
 * Logout clears this key (auth.ts, store.ts SIGNED_OUT).
 */
export const FOCUS_STORAGE_KEY = 'ascend_active_focus_session';
/** Device-local "Focus session alerts" switch (Settings). */
export const FOCUS_NOTIFS_PREF_KEY = 'ascend_focus_notifs_enabled';
/** Path the completion notification opens. */
export const PFC_PATH = '/prefrontal-cortex';

export type FocusMode = 'focus' | 'break';

export interface FocusSession {
  /** Stable id of the focus session; its break is `<id>-break`. */
  id: string;
  mode: FocusMode;
  taskName: string;
  skillId?: string;
  /** Planned focus length: the minutes logged when it ends. */
  focusMinutes: number;
  breakMinutes: number;
  isCustom: boolean;
  /** When the current running stretch began (trusted ms). */
  startTime: number;
  /** Seconds left at startTime. */
  plannedDurationSeconds: number;
  isPaused: boolean;
  pausedRemainingSeconds: number;
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

/** Points a session of this length earns on its own (before the daily cap). */
export const focusTierPoints = (minutes: number): number => calculateFocusPoints(minutes).rawPoints;

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

/** Reads a stored session; older stored shapes (no id) get an id derived from their start time. */
export function parseSession(raw: string | null): FocusSession | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<FocusSession> & { totalSessionMinutes?: number };
    if (!p || typeof p !== 'object' || !isNum(p.startTime) || !isNum(p.plannedDurationSeconds)) return null;
    const mode: FocusMode = p.mode === 'break' ? 'break' : 'focus';
    const focusMinutes = isNum(p.focusMinutes) ? p.focusMinutes : isNum(p.totalSessionMinutes) ? p.totalSessionMinutes : 0;
    if (mode === 'focus' && focusMinutes < 1) return null;
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
      isPaused: Boolean(p.isPaused),
      pausedRemainingSeconds: isNum(p.pausedRemainingSeconds) ? p.pausedRemainingSeconds : p.plannedDurationSeconds,
    };
  } catch {
    return null;
  }
}

export function readStoredSession(): FocusSession | null {
  try {
    return parseSession(localStorage.getItem(FOCUS_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** False when storage is unavailable: the session then lives in this tab only. */
export function writeStoredSession(session: FocusSession | null): boolean {
  try {
    if (session) localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(FOCUS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function focusAlertsEnabled(): boolean {
  try {
    return localStorage.getItem(FOCUS_NOTIFS_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}
