import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { AppStore } from '@/lib/store';
import { trustedNowMs } from '@/lib/clock';
import {
  FOCUS_STORAGE_KEY,
  breakIdFor,
  focusLogIdFor,
  newSessionId,
  parseSession,
  readStoredSession,
  remainingSeconds,
  sessionEndMs,
  writeStoredSession,
  type FocusSession,
} from './focusSession';
import { showFocusNotification } from './focusNotifications';

/**
 * The running focus timer for the whole app (mounted around AppShell in App.tsx), so a session
 * ends, logs and alerts whatever page is open, and resumes after a reload or reopening the app.
 *
 * Tabs share the session through localStorage and follow each other's changes (`storage`
 * events). Ending is done once: inside a Web Lock the tab re-reads the stored session and acts
 * only if it is still the one that ended, and the log row id comes from the session id, so a
 * second attempt (another tab, a race in this one) writes the same row, never a second one.
 * A session that ended while the app was closed is logged on the local day it ended.
 */

export interface FocusStartInput {
  taskName: string;
  skillId?: string;
  focusMinutes: number;
  breakMinutes: number;
  isCustom: boolean;
}

export interface FinishedFocusSession {
  logId: string;
  taskName: string;
  minutes: number;
}

interface FocusSessionContextValue {
  session: FocusSession | null;
  /** The session that just ended in this tab, waiting for its reflection. */
  finished: FinishedFocusSession | null;
  start: (input: FocusStartInput) => void;
  pause: () => void;
  resume: () => void;
  /** Stops a focus session without logging it, or ends a break early. */
  stop: () => void;
  clearFinished: () => void;
}

const FocusSessionContext = createContext<FocusSessionContextValue | null>(null);

/** An end noticed later than this (app was closed or asleep) is logged without an alert. */
const LIVE_ALERT_WINDOW_MS = 2 * 60 * 1000;
/** Longest single wait, so a clock re-sync never leaves the end far behind. */
const MAX_WAIT_MS = 60 * 1000;
const LOCK_NAME = 'ascend-focus-session';

type LockManagerLike = { request: (name: string, callback: () => Promise<void> | void) => Promise<unknown> };

/** Runs `task` while no other tab runs it (Web Locks); runs it directly where locks are missing. */
function withFocusLock(task: () => void): Promise<void> {
  let ran = false;
  const run = () => {
    if (ran) return;
    ran = true;
    try {
      task();
    } catch (error) {
      console.error('[focus] ending the session failed', error);
    }
  };
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManagerLike }).locks : undefined;
  if (!locks) {
    run();
    return Promise.resolve();
  }
  return locks.request(LOCK_NAME, run).then(
    () => undefined,
    () => run()
  );
}

export function FocusSessionProvider({
  store,
  onOpenFocus,
  children,
}: {
  store: AppStore;
  /** Opens the PFC page (notification click). */
  onOpenFocus: () => void;
  children: ReactNode;
}) {
  const [session, setSession] = useState<FocusSession | null>(() => readStoredSession());
  const [finished, setFinished] = useState<FinishedFocusSession | null>(null);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const logRef = useRef(store.logFocusSession);
  logRef.current = store.logFocusSession;
  const openRef = useRef(onOpenFocus);
  openRef.current = onOpenFocus;
  /** False after a failed storage write: this tab's copy is then the only one. */
  const storedRef = useRef(true);
  const handlingRef = useRef(new Set<string>());

  const persist = useCallback((next: FocusSession | null) => {
    storedRef.current = writeStoredSession(next);
    setSession(next);
  }, []);

  const finish = useCallback((expected: FocusSession) => {
    if (handlingRef.current.has(expected.id)) return;
    handlingRef.current.add(expected.id);
    void withFocusLock(() => {
      const current = storedRef.current ? readStoredSession() : sessionRef.current;
      if (!current || current.id !== expected.id || current.mode !== expected.mode || current.isPaused) {
        // Another tab ended, stopped or changed it: follow what is stored.
        handlingRef.current.delete(expected.id);
        setSession(current);
        return;
      }
      const endMs = sessionEndMs(current);
      const nowMs = trustedNowMs();
      if (endMs === null || endMs > nowMs) {
        handlingRef.current.delete(expected.id);
        setSession(current);
        return;
      }
      const live = nowMs - endMs < LIVE_ALERT_WINDOW_MS;
      const open = () => openRef.current();

      if (current.mode === 'focus') {
        const breakSeconds = Math.max(0, Math.round(current.breakMinutes * 60));
        // The break follows the focus end in real time, so one that already ran out is skipped.
        const breakSession: FocusSession = {
          ...current,
          id: breakIdFor(current.id),
          mode: 'break',
          startTime: endMs,
          plannedDurationSeconds: breakSeconds,
          isPaused: false,
          pausedRemainingSeconds: breakSeconds,
        };
        const next = breakSeconds > 0 && remainingSeconds(breakSession, nowMs) > 0 ? breakSession : null;
        persist(next);
        const logId = logRef.current(current.taskName, current.focusMinutes, current.skillId, undefined, {
          id: focusLogIdFor(current.id),
          endedAtMs: endMs,
        });
        setFinished({ logId, taskName: current.taskName, minutes: current.focusMinutes });
        if (live) {
          void showFocusNotification(
            'Focus session done',
            `You focused ${current.focusMinutes} min on ${current.taskName}.`,
            open
          );
        }
      } else {
        persist(null);
        if (live) void showFocusNotification('Break over', 'Start your next session when you are ready.', open);
      }
    });
  }, [persist]);

  // Ends the running session on time; re-checks when the page comes back into view.
  useEffect(() => {
    if (!session || session.isPaused) return;
    const endMs = sessionEndMs(session);
    if (endMs === null) return;
    let timer = 0;
    const check = () => {
      window.clearTimeout(timer);
      const left = endMs - trustedNowMs();
      if (left <= 0) {
        finish(session);
        return;
      }
      timer = window.setTimeout(check, Math.min(left + 50, MAX_WAIT_MS));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [session, finish]);

  // Other tabs: start, pause, stop and endings show up here too.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== FOCUS_STORAGE_KEY && event.key !== null) return;
      storedRef.current = true;
      setSession(event.key === null ? null : parseSession(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Another account signed in: its stored session (logout clears the old one) is the one to show.
  const userId = store.state.currentUser?.id ?? null;
  useEffect(() => {
    setSession(readStoredSession());
    setFinished(null);
  }, [userId]);

  const start = useCallback((input: FocusStartInput) => {
    const focusSeconds = Math.round(input.focusMinutes * 60);
    persist({
      id: newSessionId(),
      mode: 'focus',
      taskName: input.taskName.trim() || 'Deep Focus',
      skillId: input.skillId || undefined,
      focusMinutes: input.focusMinutes,
      breakMinutes: input.breakMinutes,
      isCustom: input.isCustom,
      startTime: trustedNowMs(),
      plannedDurationSeconds: focusSeconds,
      isPaused: false,
      pausedRemainingSeconds: focusSeconds,
    });
  }, [persist]);

  const pause = useCallback(() => {
    const current = sessionRef.current;
    if (!current || current.isPaused) return;
    const left = remainingSeconds(current);
    if (left <= 0) {
      finish(current);
      return;
    }
    persist({ ...current, isPaused: true, pausedRemainingSeconds: left });
  }, [finish, persist]);

  const resume = useCallback(() => {
    const current = sessionRef.current;
    if (!current || !current.isPaused) return;
    persist({
      ...current,
      startTime: trustedNowMs(),
      plannedDurationSeconds: current.pausedRemainingSeconds,
      isPaused: false,
    });
  }, [persist]);

  const stop = useCallback(() => persist(null), [persist]);
  const clearFinished = useCallback(() => setFinished(null), []);

  const value = useMemo(
    () => ({ session, finished, start, pause, resume, stop, clearFinished }),
    [session, finished, start, pause, resume, stop, clearFinished]
  );

  return <FocusSessionContext.Provider value={value}>{children}</FocusSessionContext.Provider>;
}

export function useFocusSession(): FocusSessionContextValue {
  const value = useContext(FocusSessionContext);
  if (!value) throw new Error('useFocusSession needs FocusSessionProvider');
  return value;
}

/**
 * Seconds left in the session, re-rendering only the calling component once a second while it
 * runs (the rest of the page does not tick).
 */
export function useFocusCountdown(session: FocusSession | null): number {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!session || session.isPaused) return;
    const endMs = sessionEndMs(session);
    if (endMs === null) return;
    let timer = 0;
    const schedule = () => {
      const left = endMs - trustedNowMs();
      if (left <= 0) return;
      // Wake just after the next whole second of the countdown.
      timer = window.setTimeout(() => {
        tick();
        schedule();
      }, (left % 1000 || 1000) + 20);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session]);
  return session ? remainingSeconds(session) : 0;
}
