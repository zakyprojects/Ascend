import { trustedNow } from './clock';
import { todayKey, todayKeyInZone } from './dates';
import { supabase, isSupabaseConfigured, fetchMyPrivateProfile, sendDeviceTimezone } from './supabase';

/**
 * A westward timezone change waits on the server until the new local date catches up with the
 * effective one, at most 48 hours (supabase/migrations/20261016120000). While it waits, the app's
 * day (device timezone) is behind the server's, so ticks on it earn no points.
 */
export interface TimezoneWait {
  /** When points resume: the device's next midnight or the 48 hour cap, rounded up to the hourly job. */
  resumesAt: Date;
}

const WAIT_CAP_MS = 48 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Reads the signed-in user's timezone state; null when nothing waits, the user is a guest, or the read fails. */
export async function readTimezoneWait(): Promise<TimezoneWait | null> {
  if (!isSupabaseConfigured) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;

  const data = (await fetchMyPrivateProfile()) as { timezone?: string; timezone_waiting_since?: string } | null;
  if (!data?.timezone || !data.timezone_waiting_since) return null;

  const now = trustedNow();
  const serverDate = todayKeyInZone(data.timezone, now);
  if (!serverDate || serverDate <= todayKey(now)) return null;

  const nextDeviceMidnight = new Date(now);
  nextDeviceMidnight.setHours(24, 0, 0, 0);
  const capMs = Date.parse(data.timezone_waiting_since) + WAIT_CAP_MS;
  const earliestMs = Number.isFinite(capMs)
    ? Math.min(nextDeviceMidnight.getTime(), capMs)
    : nextDeviceMidnight.getTime();
  return { resumesAt: new Date(Math.ceil(earliestMs / HOUR_MS) * HOUR_MS) };
}

const SEND_DELAY_MS = 1000;
let syncStarted = false;

/**
 * Keeps `profiles.device_timezone` current without waiting for a save: at app start (once a
 * session exists), on sign-in, back to the tab and back online. The triggers are coalesced and
 * `sendDeviceTimezone` skips a timezone this tab already sent. Called once from main.tsx.
 */
export function startDeviceTimezoneSync(): void {
  if (syncStarted || typeof window === 'undefined' || !isSupabaseConfigured) return;
  syncStarted = true;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let sending = false;
  const send = async () => {
    timer = null;
    if (sending) return;
    sending = true;
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (userId) await sendDeviceTimezone(userId);
    } catch {
      // Offline or a lapsed sign-in: the next trigger or save sends it.
    } finally {
      sending = false;
    }
  };
  const sendSoon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void send(), SEND_DELAY_MS);
  };

  // INITIAL_SESSION covers app start with a stored sign-in; never call Supabase inside this callback.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') sendSoon();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sendSoon();
  });
  window.addEventListener('online', sendSoon);
}
