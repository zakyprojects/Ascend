import { useSyncExternalStore } from 'react';
import { trustedNow, trustedNowMs } from './clock';
import { todayKey } from './dates';
import { DEVICE_TIMEZONE_SENT_EVENT } from './deviceTimezone';
import { supabase } from './supabase';
import { readTimezoneWait, type TimezoneWait } from './timezoneStatus';
import { isDeviceOffline } from './deviceOffline';

const REFRESH_MS = 10 * 60 * 1000;

/**
 * One app-wide read of the server's timezone wait, shared by the banner and every points preview
 * (no extra request per reader). Re-read every 10 min, on tab show, on auth change, after a new
 * device timezone was sent, and once the wait should be over (so it ends on its own).
 */
let current: TimezoneWait | null = null;
const listeners = new Set<() => void>();
let stopWatching: (() => void) | null = null;
let readSeq = 0;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;

function publish(next: TimezoneWait | null) {
  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = null;
  if (next) {
    const delay = Math.max(next.resumesAt.getTime() - trustedNowMs(), 0) + 60_000;
    resumeTimer = setTimeout(refresh, delay);
  }
  if (current?.resumesAt.getTime() === next?.resumesAt.getTime()) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function refresh() {
  // Offline the read can only fail; the online event reads again.
  if (isDeviceOffline()) return;
  const seq = ++readSeq;
  readTimezoneWait()
    .then((next) => {
      // Only the newest read counts (an older, slower one must not undo it).
      if (seq === readSeq) publish(next);
    })
    .catch(() => undefined);
}

function startWatching(): () => void {
  const onVisible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  refresh();
  const timer = setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', refresh);
  window.addEventListener(DEVICE_TIMEZONE_SENT_EVENT, refresh);
  // Deferred: Supabase must not be called inside its own auth callback.
  const { data: authListener } = supabase.auth.onAuthStateChange(() => {
    setTimeout(refresh, 0);
  });
  return () => {
    clearInterval(timer);
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = null;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', refresh);
    window.removeEventListener(DEVICE_TIMEZONE_SENT_EVENT, refresh);
    authListener.subscription.unsubscribe();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!stopWatching) stopWatching = startWatching();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopWatching) {
      stopWatching();
      stopWatching = null;
    }
  };
}

const getSnapshot = () => current;

/** The server-side timezone wait, if any: while it is set, today's ticks earn no points. */
export function useTimezoneWait(): TimezoneWait | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** When points resume, on the device clock: "14:00", or "Tue 00:00" when it is not today. */
export function formatTimezoneResume(resumesAt: Date): string {
  const time = resumesAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (todayKey(resumesAt) === todayKey(trustedNow())) return time;
  return `${resumesAt.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

/** The short line a points preview shows instead of a number while the wait is active. */
export function pointsResumeText(wait: TimezoneWait): string {
  return `Earns points from about ${formatTimezoneResume(wait.resumesAt)}.`;
}
