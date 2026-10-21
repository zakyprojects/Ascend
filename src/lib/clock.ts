/**
 * The app's only source of the current time.
 *
 * The device clock can be moved by the user (system settings or the console), which used to
 * move every streak, milestone and day boundary with it. Here the time comes from the server
 * (public.server_now) and is carried forward with performance.now(), a monotonic timer that
 * changing the device clock does not touch. It is re-read from the server on start, when the
 * page comes back online, every 10 minutes, and when the page comes back into view after the
 * device slept (performance.now() paused, so it fell behind the device clock).
 *
 * Before the first server read (offline start) the device clock is used, but never earlier
 * than the last trusted time this device saw. The database rejects writes dated in the
 * future, so a device clock moved forward while offline cannot reach the server either.
 *
 * Every time read in the app goes through trustedNow() / trustedNowMs() (enforced by ESLint).
 */
import { isDeviceOffline } from './deviceOffline';

const LAST_TRUSTED_KEY = 'ascend_last_trusted_ms';
const RESYNC_INTERVAL_MS = 10 * 60 * 1000;
const READY_TIMEOUT_MS = 3000;
/** A server read whose round trip takes longer than this is too imprecise to use. */
const MAX_ROUND_TRIP_MS = 10_000;
/** performance.now() behind the device clock by more than this since the last read = the device slept. */
const SLEEP_DRIFT_MS = 2000;

// deviceMs: the device clock at the read, used only to notice that performance.now() paused.
let anchor: { serverMs: number; perfMs: number; deviceMs: number } | null = null;
let syncing: Promise<void> | null = null;
let readyPromise: Promise<void> | null = null;

function readLastTrusted(): number {
  try {
    const raw = Number(localStorage.getItem(LAST_TRUSTED_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
}

const lastTrustedAtStart = readLastTrusted();

/** Current time in epoch milliseconds. */
export function trustedNowMs(): number {
  if (anchor) return anchor.serverMs + (performance.now() - anchor.perfMs);
  // eslint-disable-next-line no-restricted-syntax -- the one fallback to the device clock
  return Math.max(Date.now(), lastTrustedAtStart);
}

/** Current time as a Date. */
export function trustedNow(): Date {
  return new Date(trustedNowMs());
}

function remember(): void {
  if (!anchor) return;
  try {
    localStorage.setItem(LAST_TRUSTED_KEY, String(Math.round(trustedNowMs())));
  } catch {
    /* storage unavailable */
  }
}

async function readServerTime(): Promise<void> {
  // Loaded lazily: supabase.ts reads the clock itself, so a static import would be a cycle.
  const { supabase, isSupabaseConfigured } = await import('./supabase');
  if (!isSupabaseConfigured) return;
  const sentAt = performance.now();
  const { data, error } = await supabase.rpc('server_now');
  const receivedAt = performance.now();
  if (error || typeof data !== 'string') return;
  const serverMs = Date.parse(data);
  if (!Number.isFinite(serverMs) || receivedAt - sentAt > MAX_ROUND_TRIP_MS) return;
  // The server read its clock about half way through the round trip.
  // eslint-disable-next-line no-restricted-syntax -- device clock kept only to detect sleep
  anchor = { serverMs, perfMs: (sentAt + receivedAt) / 2, deviceMs: Date.now() - (receivedAt - sentAt) / 2 };
  remember();
}

/** Re-reads the server time; concurrent calls share one request. Never rejects. */
export function syncClock(): Promise<void> {
  if (!syncing) {
    syncing = readServerTime()
      .catch(() => undefined)
      .finally(() => {
        syncing = null;
      });
  }
  return syncing;
}

/**
 * Resolves once the server time is known, or after a short timeout (offline), so code that
 * decides days and periods on start-up does not run on an unchecked device clock.
 */
export function clockReady(): Promise<void> {
  if (anchor) return Promise.resolve();
  if (!readyPromise) {
    readyPromise = Promise.race([
      syncClock(),
      new Promise<void>((resolve) => setTimeout(resolve, READY_TIMEOUT_MS)),
    ]);
  }
  return readyPromise;
}

/**
 * True when performance.now() and the device clock no longer agree since the last server read:
 * the device slept (performance.now() can pause) or its clock was moved. Either way, re-read.
 */
function anchorDrifted(): boolean {
  if (!anchor) return true;
  // eslint-disable-next-line no-restricted-syntax -- compared with performance.now(), never used as the time
  const deviceElapsed = Date.now() - anchor.deviceMs;
  return Math.abs(deviceElapsed - (performance.now() - anchor.perfMs)) > SLEEP_DRIFT_MS;
}

/**
 * A mark for "how long ago" checks that must also count time the device slept (performance.now()
 * can pause then). Device clock based, so only compare it with isMarkOlderThan(), never show it.
 */
export function elapsedMark(): number {
  // eslint-disable-next-line no-restricted-syntax -- elapsed time only, never a date
  return Date.now();
}

/** True when no mark yet, or `ms` or more passed since it (a device clock moved back also counts). */
export function isMarkOlderThan(mark: number | null, ms: number): boolean {
  if (mark === null) return true;
  const elapsed = elapsedMark() - mark;
  return elapsed < 0 || elapsed >= ms;
}

let started = false;

/** Starts the first server read and the resync triggers. Called once from main.tsx. */
export function startTrustedClock(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  void clockReady();
  // performance.now() can pause while the device sleeps, so re-read when the app comes back from
  // a sleep. A plain tab switch keeps the anchor: performance.now() kept running, nothing drifted.
  document.addEventListener('visibilitychange', () => {
    // Offline the read can only fail; the online event re-reads.
    if (document.visibilityState === 'visible') {
      if (!isDeviceOffline() && anchorDrifted()) void syncClock();
    } else remember();
  });
  window.addEventListener('online', () => void syncClock());
  window.addEventListener('pagehide', remember);
  window.setInterval(() => {
    if (!isDeviceOffline()) void syncClock();
  }, RESYNC_INTERVAL_MS);
}
