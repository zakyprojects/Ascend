import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { AppStore } from '@/lib/store';
import { trustedNowMs } from '@/lib/clock';
import {
  FOCUS_ALIVE_INTERVAL_MS,
  FOCUS_MIN_MINUTES_TO_SAVE,
  activeMinutesAt,
  breakIdFor,
  canResume,
  closeAt,
  focusLogIdFor,
  focusStorageKey,
  newSessionId,
  parseSession,
  pauseAt,
  readAlive,
  readStoredSession,
  remainingSeconds,
  resumeAt,
  resumeDeadlineMs,
  sessionEndMs,
  settleSession,
  writeAlive,
  writeStoredSession,
  type FocusClose,
  type FocusNotice,
  type FocusSession,
} from './focusSession';
import { showFocusNotification } from './focusNotifications';

/**
 * The running focus timer for the whole app (mounted around AppShell in App.tsx), so a session
 * ends, logs and alerts whatever page is open, and resumes after a reload.
 *
 * The session is stored per account (focusSession.ts): another account on this device never sees
 * it, and logout pauses it instead of removing it. Tabs of the account share it and follow each
 * other's changes (`storage` events). Every change that can end a session runs inside a Web Lock
 * on the stored copy, and a log row id comes from the session id, so a second attempt (another
 * tab, a race) writes the same row, never a second one.
 *
 * While a focus session runs, a heartbeat is written every 15 s and when the page hides. A
 * longer silence (app closed, killed, asleep) counts as a pause at the last heartbeat: back
 * within 30 minutes the session runs on without the gap; later it is closed at the heartbeat
 * (saved from 25 active minutes, dropped below). A manual or logout pause follows the same
 * 30-minute window. Logs go through the store's outbox, which keeps them until they upload.
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
  /** Something the timer did on its own (closed after a long break, skipped a gap). */
  notice: FocusNotice | null;
  start: (input: FocusStartInput) => void;
  pause: () => void;
  resume: () => void;
  /** Ends a focus session of 25+ active minutes now and logs it (keeps its points). */
  complete: () => void;
  /** Discards a focus session under 25 active minutes (nothing logged), or ends a break early. */
  stop: () => void;
  clearFinished: () => void;
  clearNotice: () => void;
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
      console.error('[focus] updating the session failed', error);
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
  const userId = store.state.currentUser?.id ?? null;
  /** The account's data is on screen: a session may be closed and logged now. */
  const ready = Boolean(userId) && !store.isAuthChecking && !store.isSessionLoading;

  const [session, setSession] = useState<FocusSession | null>(() => readStoredSession(userId));
  const [finished, setFinished] = useState<FinishedFocusSession | null>(null);
  const [notice, setNotice] = useState<FocusNotice | null>(null);

  const userRef = useRef(userId);
  userRef.current = userId;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const logRef = useRef(store.logFocusSession);
  logRef.current = store.logFocusSession;
  const openRef = useRef(onOpenFocus);
  openRef.current = onOpenFocus;
  /** False after a failed storage write: this tab's copy is then the only one. */
  const storedRef = useRef(true);
  /** The account whose stored session was checked against the alive and resume rules. */
  const settledForRef = useRef<string | null>(null);

  const persist = useCallback((next: FocusSession | null) => {
    storedRef.current = writeStoredSession(userRef.current, next);
    setSession(next);
  }, []);

  const logClose = useCallback((close: FocusClose): string => {
    return logRef.current(close.taskName, close.activeMinutes, close.skillId, undefined, {
      id: focusLogIdFor(close.sessionId),
      endedAtMs: close.endMs,
      startedAtMs: close.startedAtMs,
      plannedMinutes: close.plannedMinutes,
      milestonesAt: close.milestonesAt,
    });
  }, []);

  /** The stored session, run through the alive / resume-window rules and ended when its time is up. */
  const settleNow = useCallback(() => {
    const uid = userRef.current;
    if (!uid || !readyRef.current) return;
    const nowMs = trustedNowMs();
    const stored = storedRef.current ? readStoredSession(uid, nowMs) : sessionRef.current;
    const settled = settleSession(stored, nowMs, readAlive(uid));
    let current = settled.session;
    if (settled.changed) persist(current);
    else if (JSON.stringify(current) !== JSON.stringify(sessionRef.current)) setSession(current);
    if (settled.close?.save) logClose(settled.close);
    if (settled.notice) setNotice(settled.notice);
    settledForRef.current = uid;

    if (!current || current.isPaused) return;
    const endMs = sessionEndMs(current);
    if (endMs === null) return;
    if (endMs > nowMs) {
      if (current.mode === 'focus') writeAlive(uid, nowMs);
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
        pausedAt: null,
      };
      const close = closeAt(current, endMs);
      current = breakSeconds > 0 && remainingSeconds(breakSession, nowMs) > 0 ? breakSession : null;
      persist(current);
      // A finished plan is always logged (also under 25 min, earning nothing), as before.
      const logId = logClose(close);
      setFinished({ logId, taskName: close.taskName, minutes: close.activeMinutes });
      if (live) {
        void showFocusNotification('Focus session done', `You focused ${close.activeMinutes} min on ${close.taskName}.`, open);
      }
    } else {
      persist(null);
      if (live) void showFocusNotification('Break over', 'Start your next session when you are ready.', open);
    }
  }, [logClose, persist]);

  const settle = useCallback(() => {
    void withFocusLock(settleNow);
  }, [settleNow]);

  // Another account signed in, or this one signed out: show only this account's stored session.
  useEffect(() => {
    settledForRef.current = null;
    setSession(readStoredSession(userId));
    setFinished(null);
    setNotice(null);
  }, [userId]);

  // Once the account's data is on screen: apply the alive and resume rules to what is stored.
  useEffect(() => {
    if (ready) settle();
  }, [ready, userId, settle]);

  // Running: end on time, write the heartbeat, and re-check when the page comes back into view.
  useEffect(() => {
    if (!ready || !session || session.isPaused) return;
    const endMs = sessionEndMs(session);
    if (endMs === null) return;
    let endTimer = 0;
    const checkEnd = () => {
      window.clearTimeout(endTimer);
      const left = endMs - trustedNowMs();
      if (left <= 0) {
        settle();
        return;
      }
      endTimer = window.setTimeout(checkEnd, Math.min(left + 50, MAX_WAIT_MS));
    };
    // Each beat first checks the silence since the last one (a sleeping device wakes here).
    const beat = window.setInterval(settle, FOCUS_ALIVE_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        settle();
        checkEnd();
      } else if (session.mode === 'focus' && settledForRef.current === userRef.current) {
        writeAlive(userRef.current, trustedNowMs());
      }
    };
    const onHide = () => {
      if (session.mode === 'focus' && settledForRef.current === userRef.current) writeAlive(userRef.current, trustedNowMs());
    };
    checkEnd();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearTimeout(endTimer);
      window.clearInterval(beat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, [ready, session, settle]);

  // Paused: close it when the resume window runs out while the app is open.
  useEffect(() => {
    if (!ready || !session || !session.isPaused) return;
    const deadline = resumeDeadlineMs(session);
    if (deadline === null) return;
    let timer = 0;
    const check = () => {
      const left = deadline - trustedNowMs();
      if (left < 0) {
        settle();
        return;
      }
      timer = window.setTimeout(check, Math.min(left + 1050, MAX_WAIT_MS));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, session, settle]);

  // Other tabs of this account: start, pause, stop and endings show up here too. A storage wipe
  // or another account's key never removes this account's session.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const uid = userRef.current;
      if (!uid) return;
      if (event.key === null) {
        setSession(readStoredSession(uid));
        return;
      }
      if (event.key !== focusStorageKey(uid)) return;
      storedRef.current = true;
      const next = parseSession(event.newValue);
      setSession(next && (!next.userId || next.userId === uid) ? next : null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const start = useCallback((input: FocusStartInput) => {
    const nowMs = trustedNowMs();
    const focusSeconds = Math.round(input.focusMinutes * 60);
    setNotice(null);
    persist({
      id: newSessionId(),
      mode: 'focus',
      taskName: input.taskName.trim() || 'Deep Focus',
      skillId: input.skillId || undefined,
      focusMinutes: input.focusMinutes,
      breakMinutes: input.breakMinutes,
      isCustom: input.isCustom,
      startTime: nowMs,
      plannedDurationSeconds: focusSeconds,
      isPaused: false,
      pausedRemainingSeconds: focusSeconds,
      userId: userRef.current ?? undefined,
      startedAt: nowMs,
      pausedAt: null,
      marksAt: [],
    });
    settledForRef.current = userRef.current;
    writeAlive(userRef.current, nowMs);
  }, [persist]);

  const pause = useCallback(() => {
    void withFocusLock(() => {
      settleNow();
      const current = storedRef.current ? readStoredSession(userRef.current) : sessionRef.current;
      if (!current || current.isPaused) return;
      const nowMs = trustedNowMs();
      if (remainingSeconds(current, nowMs) <= 0) return; // settleNow ended it
      persist(pauseAt(current, nowMs));
    });
  }, [persist, settleNow]);

  const resume = useCallback(() => {
    void withFocusLock(() => {
      settleNow(); // closes it when the resume window has passed
      const current = storedRef.current ? readStoredSession(userRef.current) : sessionRef.current;
      if (!current || !current.isPaused) return;
      const nowMs = trustedNowMs();
      if (!canResume(current, nowMs)) return;
      persist(resumeAt(current, nowMs));
      writeAlive(userRef.current, nowMs);
    });
  }, [persist, settleNow]);

  const complete = useCallback(() => {
    void withFocusLock(() => {
      settleNow();
      const current = storedRef.current ? readStoredSession(userRef.current) : sessionRef.current;
      if (!current || current.mode !== 'focus') return;
      const nowMs = trustedNowMs();
      const close = closeAt(current, nowMs);
      if (!close.save) return;
      persist(null);
      const logId = logClose(close);
      setFinished({ logId, taskName: close.taskName, minutes: close.activeMinutes });
    });
  }, [logClose, persist, settleNow]);

  const stop = useCallback(() => {
    void withFocusLock(() => {
      const current = storedRef.current ? readStoredSession(userRef.current) : sessionRef.current;
      if (!current) {
        setSession(null);
        return;
      }
      // From 25 active minutes a session is completed, never discarded.
      if (current.mode === 'focus' && activeMinutesAt(current, trustedNowMs()) >= FOCUS_MIN_MINUTES_TO_SAVE) return;
      persist(null);
    });
  }, [persist]);

  const clearFinished = useCallback(() => setFinished(null), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({ session, finished, notice, start, pause, resume, complete, stop, clearFinished, clearNotice }),
    [session, finished, notice, start, pause, resume, complete, stop, clearFinished, clearNotice]
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
