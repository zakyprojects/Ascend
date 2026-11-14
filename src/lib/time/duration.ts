import { compactNumber } from '../leagues/numberFormat';

/**
 * A length of time in the one style the app uses for logged and planned time (Zakria 2026-11-12):
 * "45m", "1h 30m", "2h", "1,234h 5m"; whole minutes (rounded), never below 0. From 10,000 hours the
 * minutes are left out and the hours are short ("12.5k h"). Used by the member card, Dashboard,
 * Skills and the Time Tracker.
 */
export function durationText(minutes: number): string {
  const total = Math.round(Number.isFinite(minutes) ? Math.max(0, minutes) : 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (h >= 10_000) return `${compactNumber(h)} h`;
  return m === 0 ? `${compactNumber(h)}h` : `${compactNumber(h)}h ${m}m`;
}
