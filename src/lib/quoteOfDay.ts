import { getSeasonStartByNumber } from './leagueTime';
import { QUOTES, type Quote } from './quotes';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Which quote a local day shows: whole calendar days from the first season's start date (its
 * UTC calendar date) to `localDayKey` (the device's local YYYY-MM-DD, the same key the
 * Dashboard date line uses), wrapped over the list. One quote per local day, a new one at local
 * midnight, index 0 on the season start date, and no repeat inside any QUOTES.length days.
 * A bad or pre-season clock still gives a valid index (never throws, never NaN).
 * Roman Urdu: season ke pehle din se kitne din guzre, phir 90 se mod; ghalat date par bhi 0..89.
 */
export function quoteIndexForDay(localDayKey: string): number {
  const match = DAY_KEY.exec(localDayKey);
  if (!match) return 0;
  const dayMs = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const start = getSeasonStartByNumber(1);
  const startMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  if (!Number.isFinite(dayMs) || !Number.isFinite(startMs)) return 0;
  // Both values sit on UTC midnights, so the difference is a whole number of days (no DST).
  const days = Math.round((dayMs - startMs) / DAY_MS);
  const count = QUOTES.length;
  return ((days % count) + count) % count;
}

/** The quote shown on the Dashboard for a local day key. */
export function quoteForDay(localDayKey: string): Quote {
  return QUOTES[quoteIndexForDay(localDayKey)];
}
