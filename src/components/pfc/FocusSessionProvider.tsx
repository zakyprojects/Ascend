import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { AppStore } from '@/lib/store/store';
import { clockSettled, trustedNowMs } from '@/lib/time/clock';
import { isDeviceOffline } from '@/lib/store/deviceOffline';
import { APP_REFRESH_EVENT } from '@/lib/store/appRefresh';
import { supabase, isSupabaseConfigured } from '@/lib/auth/supabase';
import {
  claimLog,
  closeIsLogged,
  fetchRow,
  flushOps,
  reconcile,
  rowClose,
  supabaseFocusTransport,
  type FocusServerRow,
} from '@/lib/focus/focusServerSession';
import {
  FOCUS_MIN_MINUTES_TO_SAVE,
  activeMinutesAt,
  autoResumed,
  backAt,
  breakAt,
  breakBlock,
  breakDue,
  breakIdFor,
  canResume,
  closeAt,
  enqueueFocusOp,
  focusLogIdFor,
  focusStorageKey,
  newSessionId,
  onBreak,
  parseSession,
  readFocusOps,
  readStoredSession,
  breakSecondsLeft,
  remainingSeconds,
  resumeAt,
  resumeDeadlineMs,
  sessionEndMs,
  settleSession,
  writeStoredSession,
  type FocusBreakMinutes,
  type FocusClose,
  type FocusNotice,
  type FocusOp,
  type FocusSession,
} from './focusSession';
import { breakOverFeedback, showFocusNotification } from './focusNotifications';

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
 * A running focus session runs on wall time: in the background, with the screen locked, the tab
 * closed or the device asleep, the time still counts. Opened after its planned end, it ends at
 * the planned end (all its planned minutes, milestones at start + their minutes). Only a break or
 * logout stops it. A break runs again on its own at its end (with a chime when the app is open); a
 * logout pause can be resumed within 30 minutes, later it is closed at the pause (saved from 25
 * active minutes, dropped below). Logs go through the store's outbox, which keeps them until they upload.
 *
 * Every device of the account shares the session (focusServerSession.ts, 2026-11-05): actions run
 * here at once and are queued for the server; the server row is pulled on start-up, when the page
 * comes back into view or online, on a realtime change and every minute while a session shows, and
 * this device follows it. When the server cannot be reached (offline, or a database without the
 * functions), the device-only rules above run as before.
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

export interface FocusSessionContextValue {
  session: FocusSession | null;
  /** The session that just ended in this tab, waiting for its reflection. */
  finished: FinishedFocusSession | null;
  /** Something the timer did on its own (closed after a long break). */
  notice: FocusNotice | null;
  start: (input: FocusStartInput) => void;
  /** A 5, 10 or 15 minute break (ignored when breakBlock refuses it). */
  takeBreak: (minutes: FocusBreakMinutes) => void;
  /** Resumes a logout pause, or ends a break early. */
  resume: () => void;
  /** "I wasn't back": an auto-resumed stretch counts from now. */
  notBack: () => void;
  /** Ends a focus session of 25+ active minutes now and logs it (keeps its points). */
  complete: () => void;
  /** Discards a focus session under 25 active minutes (nothing logged), or ends a break early. */
  stop: () => void;
  clearFinished: () => void;
  clearNotice: () => void;
}

// Exported only so the dev Gallery can wrap FocusTimerChip in a fake session (no timers, no writes).
// Kept in this file so the prod bundle stays the same; the hooks below already share this pattern.
// eslint-disable-next-line react-refresh/only-export-components -- context co-located with its provider
export const FocusSessionContext = createContext<FocusSessionContextValue | null>(null);

/** An end noticed later than this (app was closed or asleep) is logged without an alert. */
const LIVE_ALERT_WINDOW_MS = 2 * 60 * 1000;
/** Longest single wait, so a clock re-sync never leaves the end far behind. */
const MAX_WAIT_MS = 60 * 1000;
const LOCK_NAME = 'ascend-focus-session';
const SYNC_LOCK_NAME = 'ascend-focus-sync';
/** Pull the server row this often while a session is shown and the page is visible. */
const PULL_EVERY_MS = 60 * 1000;

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

/** Runs `task` while no other tab of this browser syncs the session (Web Locks); directly where locks are missing. */
function withSyncLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManagerLike }).locks : undefined;
  if (!locks) return task();
  let result: T;
  return locks.request(SYNC_LOCK_NAME, async () => {
    result = await task();
  }).then(() => result);
}

const sameSession = (a: FocusSession | null, b: FocusSession | null): boolean => JSON.stringify(a) === JSON.stringify(b);

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
  const focusLogsRef = useRef(store.state.focusLogs);
  focusLogsRef.current = store.state.focusLogs;
  const openRef = useRef(onOpenFocus);
  openRef.current = onOpenFocus;
  /** False after a failed storage write: this tab's copy is then the only one. */
  const storedRef = useRef(true);
  /** The database has no session functions (older database): device-only for this page's life. */
  const serverMissingRef = useRef(false);
  const syncingRef = useRef<Promise<boolean> | null>(null);

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

  /** The stored session, run through the resume-window rule and ended when its time is up. */
  const settleNow = useCallback(() => {
    const uid = userRef.current;
    if (!uid || !readyRef.current) return;
    const nowMs = trustedNowMs();
    const stored = storedRef.current ? readStoredSession(uid, nowMs) : sessionRef.current;
    const settled = settleSession(stored, nowMs);
    let current = settled.session;
    if (settled.changed) persist(current);
    else if (JSON.stringify(current) !== JSON.stringify(sessionRef.current)) setSession(current);
    if (settled.close?.save) logClose(settled.close);
    if (settled.notice) setNotice(settled.notice);

    if (!current || current.isPaused) return;
    const endMs = sessionEndMs(current);
    if (endMs === null) return;
    if (endMs > nowMs) return;
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

  const readCurrent = useCallback(
    (uid: string): FocusSession | null => (storedRef.current ? readStoredSession(uid) : sessionRef.current),
    []
  );

  /** The stored session as it is at `nowMs`: a break that ran out is running again (as on the server). */
  const readLive = useCallback(
    (nowMs: number): FocusSession | null => {
      const current = readCurrent(userRef.current ?? '');
      return current ? breakDue(current, nowMs) : null;
    },
    [readCurrent]
  );

  /** Queues an action for the server, based on the revision this copy shows when nothing waits before it. */
  const queueOp = useCallback((op: FocusOp, current: FocusSession | null) => {
    const uid = userRef.current;
    if (!uid) return;
    const waiting = readFocusOps(uid).some((o) => o.sessionId === op.sessionId);
    if (op.kind !== 'start' && !waiting && current?.revision !== undefined) op = { ...op, baseRevision: current.revision };
    enqueueFocusOp(uid, op);
  }, []);

  /** Logs the close of a server row this device claimed (or was handed by a start). */
  const logServerClose = useCallback(
    (row: FocusServerRow, uid: string, live: boolean) => {
      const close = rowClose(row, uid);
      // Already logged on this device (it ended here while the server could not be reached).
      if (close && focusLogsRef.current.some((l) => l.id === focusLogIdFor(close.sessionId))) return;
      if (!close || !closeIsLogged(row, close)) {
        if (close && row.end_reason === 'expired') setNotice({ kind: 'expired', saved: false, minutes: close.activeMinutes });
        return;
      }
      const logId = logClose(close);
      if (row.end_reason === 'expired') setNotice({ kind: 'expired', saved: true, minutes: close.activeMinutes });
      else if (live) setFinished({ logId, taskName: close.taskName, minutes: close.activeMinutes });
    },
    [logClose]
  );

  /**
   * Sends the queued actions, pulls the server row and follows it. False when the server could not
   * be reached (the caller then applies the device-only rules).
   */
  const syncNow = useCallback((): Promise<boolean> => {
    const uid = userRef.current;
    if (!uid || !readyRef.current || serverMissingRef.current || !isSupabaseConfigured || isDeviceOffline()) {
      return Promise.resolve(false);
    }
    if (syncingRef.current) return syncingRef.current;
    const transport = supabaseFocusTransport;
    const run = withSyncLock(async (): Promise<boolean> => {
      for (let round = 0; round < 3; round++) {
        if (userRef.current !== uid) return true;
        const flush = await flushOps(transport, uid, readCurrent(uid)?.revision);
        if (!flush.ok) {
          if (flush.missing) serverMissingRef.current = true;
          return false;
        }
        if (userRef.current !== uid) return true;
        // A start that overwrote a finished/expired session nobody logged: this device logs it.
        for (const prev of flush.previous) logServerClose(prev, uid, false);
        if (flush.startLocalOnly) {
          const cur = readCurrent(uid);
          if (cur && cur.id === flush.startLocalOnly) persist({ ...cur, localOnly: true });
        }
        const got = await fetchRow(transport);
        if (!got.ok) {
          if (got.missing) serverMissingRef.current = true;
          return false;
        }
        if (userRef.current !== uid) return true;
        if (readFocusOps(uid).length > 0) continue; // an action was taken meanwhile: send it first
        const row = got.reply.row;
        const local = readCurrent(uid);
        const rec = reconcile(local, row, uid);
        if (rec.adopt && local) {
          enqueueFocusOp(uid, { kind: 'start', sessionId: local.id, session: local });
          continue;
        }
        const nowMs = trustedNowMs();
        const open = () => openRef.current();
        // Alerts on every device that was showing the session when it ended (as before: live only).
        if (row && local && row.focus_ended_at && row.end_reason === 'finished') {
          const endMs = Date.parse(row.focus_ended_at);
          const breakEndMs = endMs + row.break_minutes * 60 * 1000;
          if (local.mode === 'focus' && local.id === row.session_id && nowMs - endMs < LIVE_ALERT_WINDOW_MS) {
            const minutes = rowClose(row, uid)?.activeMinutes ?? local.focusMinutes;
            void showFocusNotification('Focus session done', `You focused ${minutes} min on ${local.taskName}.`, open);
          } else if (local.mode === 'break' && !rec.session && breakEndMs <= nowMs && nowMs - breakEndMs < LIVE_ALERT_WINDOW_MS) {
            void showFocusNotification('Break over', 'Start your next session when you are ready.', open);
          }
        }
        if (!sameSession(rec.session, local)) persist(rec.session);
        else if (!sameSession(rec.session, sessionRef.current)) setSession(rec.session);
        if (rec.notice) setNotice(rec.notice);
        if (rec.claim && row) {
          const claimed = await claimLog(transport, rec.claim);
          if (claimed.ok && claimed.reply.claimed && userRef.current === uid) {
            const endMs = row.focus_ended_at ? Date.parse(row.focus_ended_at) : 0;
            logServerClose(row, uid, trustedNowMs() - endMs < LIVE_ALERT_WINDOW_MS);
          }
        }
        return true;
      }
      return true;
    }).catch((error) => {
      console.error('[focus] syncing the session failed', error);
      return false;
    });
    syncingRef.current = run;
    void run.finally(() => {
      if (syncingRef.current === run) syncingRef.current = null;
    });
    return run;
  }, [logServerClose, persist, readCurrent]);

  /** Server first; the device-only rules when the server cannot be reached. */
  const settle = useCallback(() => {
    void syncNow().then((synced) => {
      if (!synced) void withFocusLock(settleNow);
    });
  }, [settleNow, syncNow]);

  // Another account signed in, or this one signed out: show only this account's stored session.
  useEffect(() => {
    setSession(readStoredSession(userId));
    setFinished(null);
    setNotice(null);
  }, [userId]);

  // Once the account's data is on screen: apply the resume rule to what is stored and end what ran out.
  useEffect(() => {
    if (ready) settle();
  }, [ready, userId, settle]);

  // Running: end on time, and re-check when the page comes back into view (the end may have
  // passed while it was hidden, locked or asleep).
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
        // Checked again shortly in case the server's clock had not reached the end yet.
        endTimer = window.setTimeout(checkEnd, 2000);
        return;
      }
      endTimer = window.setTimeout(checkEnd, Math.min(left + 50, MAX_WAIT_MS));
    };
    let active = true;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      settle();
      checkEnd();
      // After a device sleep the clock re-reads the server time (its timer may have paused):
      // check again with the corrected time.
      void clockSettled().then(() => {
        if (!active) return;
        settle();
        checkEnd();
      });
    };
    checkEnd();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onVisibility);
    return () => {
      active = false;
      window.clearTimeout(endTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onVisibility);
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

  // On a break: run again at its end. The tab that makes the change (under the lock) plays the cue
  // when the app is open at that moment; then the server is asked (it resumed on its own too).
  const breakEnd = session && onBreak(session) ? session.pauseEndsAt! : null;
  useEffect(() => {
    if (!ready || breakEnd === null) return;
    let timer = 0;
    const endBreak = () => {
      void withFocusLock(() => {
        const nowMs = trustedNowMs();
        const current = readCurrent(userRef.current ?? '');
        if (!current || !onBreak(current) || current.pauseEndsAt !== breakEnd || breakEnd > nowMs) return;
        persist(breakDue(current, nowMs));
        if (nowMs - breakEnd < LIVE_ALERT_WINDOW_MS) {
          breakOverFeedback();
          void showFocusNotification('Break over', `Focus resumed on ${current.taskName}.`, () => openRef.current());
        }
      }).then(settle);
    };
    const check = () => {
      window.clearTimeout(timer);
      const left = breakEnd - trustedNowMs();
      if (left <= 0) endBreak();
      else timer = window.setTimeout(check, Math.min(left + 50, MAX_WAIT_MS));
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
  }, [ready, breakEnd, persist, readCurrent, settle]);

  // The account's other devices: pull when the page comes back into view or online or on a
  // pull-to-refresh, and listen for changes to the session row (a phone drops the socket in the
  // background, so the pull on unlock is what shows a session started on the PC).
  useEffect(() => {
    if (!ready || !userId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') settle();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('online', settle);
    window.addEventListener(APP_REFRESH_EVENT, settle);
    let debounce = 0;
    // The name is matched by ACCOUNT_CHANNEL_TOPIC in auth.ts (closed before sign-out).
    const channel = isSupabaseConfigured
      ? supabase
          .channel(`synced_tables_focus_${userId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'focus_active_sessions', filter: `user_id=eq.${userId}` },
            () => {
              window.clearTimeout(debounce);
              debounce = window.setTimeout(settle, 300);
            }
          )
          .subscribe()
      : null;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('online', settle);
      window.removeEventListener(APP_REFRESH_EVENT, settle);
      window.clearTimeout(debounce);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [ready, userId, settle]);

  // While a session shows: pull every minute (visible page only), so another device's pause,
  // resume or end shows up even when realtime is not delivering.
  const hasSession = Boolean(session);
  useEffect(() => {
    if (!ready || !hasSession) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') settle();
    }, PULL_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [ready, hasSession, settle]);

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
    const next: FocusSession = {
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
    };
    persist(next);
    queueOp({ kind: 'start', sessionId: next.id, session: next }, null);
    void syncNow();
  }, [persist, queueOp, syncNow]);

  const takeBreak = useCallback((minutes: FocusBreakMinutes) => {
    void withFocusLock(() => {
      const nowMs = trustedNowMs();
      const current = readLive(nowMs);
      if (!current || current.mode !== 'focus') return;
      if (remainingSeconds(current, nowMs) <= 0) {
        settle(); // its time is up: it ends instead
        return;
      }
      if (breakBlock(current, nowMs) !== null) return;
      persist(breakAt(current, nowMs, minutes));
      queueOp({ kind: 'break', sessionId: current.id, atMs: nowMs, minutes }, current);
      void syncNow();
    });
  }, [persist, queueOp, readLive, settle, syncNow]);

  const resume = useCallback(() => {
    void withFocusLock(() => {
      const nowMs = trustedNowMs();
      const current = readLive(nowMs);
      if (!current || !current.isPaused) {
        if (current) settle(); // the break was already over: it runs since its end
        return;
      }
      if (!canResume(current, nowMs)) {
        settle(); // the resume window has passed: it closes at the pause
        return;
      }
      persist(resumeAt(current, nowMs));
      queueOp({ kind: 'resume', sessionId: current.id, atMs: nowMs }, current);
      void syncNow();
    });
  }, [persist, queueOp, readLive, settle, syncNow]);

  const notBack = useCallback(() => {
    void withFocusLock(() => {
      const nowMs = trustedNowMs();
      const current = readLive(nowMs);
      if (!current || !autoResumed(current)) return;
      const next = backAt(current, nowMs);
      if (next === current) {
        settle(); // the plan finished meanwhile: it ends as usual
        return;
      }
      persist(next);
      queueOp({ kind: 'back', sessionId: current.id, atMs: nowMs }, current);
      void syncNow();
    });
  }, [persist, queueOp, readLive, settle, syncNow]);

  const complete = useCallback(() => {
    void withFocusLock(() => {
      const nowMs = trustedNowMs();
      const current = readLive(nowMs);
      if (!current || current.mode !== 'focus') return;
      if (!canResume(current, nowMs) || (!current.isPaused && remainingSeconds(current, nowMs) <= 0)) {
        settle(); // expired or finished: closed by the usual rule
        return;
      }
      const close = closeAt(current, nowMs);
      if (!close.save) return;
      persist(null);
      const logId = logClose(close);
      setFinished({ logId, taskName: close.taskName, minutes: close.activeMinutes });
      queueOp({ kind: 'end', sessionId: current.id, reason: 'completed', atMs: nowMs }, current);
      void syncNow();
    });
  }, [logClose, persist, queueOp, readLive, settle, syncNow]);

  const stop = useCallback(() => {
    void withFocusLock(() => {
      const nowMs = trustedNowMs();
      const current = readLive(nowMs);
      if (!current) {
        setSession(null);
        return;
      }
      // From 25 active minutes a session is completed, never discarded.
      if (current.mode === 'focus' && activeMinutesAt(current, nowMs) >= FOCUS_MIN_MINUTES_TO_SAVE) return;
      persist(null);
      const sessionId = current.mode === 'break' ? current.id.replace(/-break$/, '') : current.id;
      queueOp({ kind: 'end', sessionId, reason: current.mode === 'break' ? 'break_skipped' : 'discarded', atMs: nowMs }, current);
      void syncNow();
    });
  }, [persist, queueOp, readLive, syncNow]);

  const clearFinished = useCallback(() => setFinished(null), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({ session, finished, notice, start, takeBreak, resume, notBack, complete, stop, clearFinished, clearNotice }),
    [session, finished, notice, start, takeBreak, resume, notBack, complete, stop, clearFinished, clearNotice]
  );

  return <FocusSessionContext.Provider value={value}>{children}</FocusSessionContext.Provider>;
}

export function useFocusSession(): FocusSessionContextValue {
  const value = useContext(FocusSessionContext);
  if (!value) throw new Error('useFocusSession needs FocusSessionProvider');
  return value;
}

/**
 * Seconds left in the session (on a break: of the break), re-rendering only the calling component
 * once a second while it runs (the rest of the page does not tick).
 */
export function useFocusCountdown(session: FocusSession | null): number {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!session || (session.isPaused && !onBreak(session))) return;
    const endMs = onBreak(session) ? session.pauseEndsAt! : sessionEndMs(session);
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
  if (!session) return 0;
  return onBreak(session) ? breakSecondsLeft(session) : remainingSeconds(session);
}
