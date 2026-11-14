/**
 * The device's IANA timezone, as the app sends it in `profiles.device_timezone`. The server derives
 * `profiles.timezone` (the user's "today") from it, never letting the local date go backwards
 * (supabase/migrations/20261016120000).
 */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Fired on window after `sendDeviceTimezone` writes a new device timezone, so a reader of the
 * server's timezone state (the timezone wait) can re-read it instead of waiting for its next poll.
 */
export const DEVICE_TIMEZONE_SENT_EVENT = 'ascend-device-timezone-sent';

/** The last timezone this tab got onto the server, per account (in memory: each app start sends once). */
let lastSent: { userId: string; timeZone: string } | null = null;

export function markDeviceTimezoneSent(userId: string, timeZone: string): void {
  lastSent = { userId, timeZone };
}

export function deviceTimezoneSent(userId: string, timeZone: string): boolean {
  return lastSent?.userId === userId && lastSent.timeZone === timeZone;
}
