/**
 * The app's only source of the current time.
 *
 * The device clock can be moved by the user (system settings or the console), which used to
 * move every streak, milestone and day boundary with it. Here the time comes from the server
 * (public.server_now) and is carried forward with performance.now(), a monotonic timer that
 * changing the device clock does not touch. It is re-read from the server on start, when the
 * page comes back into view or online, and every 10 minutes.
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

let anchor: { serverMs: number; perfMs: number } | null = null;
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
  anchor = { serverMs, perfMs: (sentAt + receivedAt) / 2 };
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

let started = false;

/** Starts the first server read and the resync triggers. Called once from main.tsx. */
export function startTrustedClock(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  void clockReady();
  // performance.now() can pause while the device sleeps, so re-read when the app comes back.
  document.addEventListener('visibilitychange', () => {
    // Offline the read can only fail; the online event re-reads.
    if (document.visibilityState === 'visible') {
      if (!isDeviceOffline()) void syncClock();
    } else remember();
  });
  window.addEventListener('online', () => void syncClock());
  window.addEventListener('pagehide', remember);
  window.setInterval(() => {
    if (!isDeviceOffline()) void syncClock();
  }, RESYNC_INTERVAL_MS);
}
