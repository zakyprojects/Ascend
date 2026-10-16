import { trustedNow } from './clock';
import { todayKey } from './dates';
import { supabase, isSupabaseConfigured, fetchMyPrivateProfile } from './supabase';

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

function dateInZone(date: Date, timeZone: string): string | null {
  try {
    // en-CA formats as YYYY-MM-DD, the same shape as todayKey().
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
  } catch {
    return null;
  }
}

/** Reads the signed-in user's timezone state; null when nothing waits, the user is a guest, or the read fails. */
export async function readTimezoneWait(): Promise<TimezoneWait | null> {
  if (!isSupabaseConfigured) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;

  const data = (await fetchMyPrivateProfile()) as { timezone?: string; timezone_waiting_since?: string } | null;
  if (!data?.timezone || !data.timezone_waiting_since) return null;

  const now = trustedNow();
  const serverDate = dateInZone(now, data.timezone);
  if (!serverDate || serverDate <= todayKey(now)) return null;

  const nextDeviceMidnight = new Date(now);
  nextDeviceMidnight.setHours(24, 0, 0, 0);
  const capMs = Date.parse(data.timezone_waiting_since) + WAIT_CAP_MS;
  const earliestMs = Number.isFinite(capMs)
    ? Math.min(nextDeviceMidnight.getTime(), capMs)
    : nextDeviceMidnight.getTime();
  return { resumesAt: new Date(Math.ceil(earliestMs / HOUR_MS) * HOUR_MS) };
}
