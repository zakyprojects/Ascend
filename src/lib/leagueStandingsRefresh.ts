import { getMonthPeriodId, getSeasonNumber, getWeekPeriodId } from './leagueTime';

/** Polls, tab switches and mounts closer together than this share one fetch (unless `full`). */
const MIN_GAP_MS = 15_000;

/** The week, month and season a set of league points belongs to; a new one needs a full refresh. */
export function leaguePeriodKey(now: Date): string {
  return `${getWeekPeriodId(now)}|${getMonthPeriodId(now)}|S:${getSeasonNumber(now)}`;
}

export interface LeagueStandingsResult {
  /** null when that fetch failed: the cache keeps what it had. */
  profiles: any[] | null;
  points: Record<string, Record<string, number>> | null;
}

export interface LeagueStandingsDeps {
  /** The signed-in member (guest included), or null with no session. */
  sessionUserId: () => Promise<string | null>;
  /** Returns [] on failure. */
  fetchProfiles: () => Promise<any[]>;
  /** Returns null on failure. */
  fetchPoints: (now: Date) => Promise<Record<string, Record<string, number>> | null>;
  now: () => Date;
  isOnline: () => boolean;
  apply: (result: LeagueStandingsResult) => void;
  /** A refresh started or settled (so views can show loading / failed). */
  onStatusChange?: () => void;
}

/**
 * Other members' league standings (profiles + weekly/monthly points), refetched on demand.
 * One request at a time, throttled, and a result from a previous sign-in is dropped.
 */
export function createLeagueStandingsRefresher(deps: LeagueStandingsDeps) {
  let inflight: Promise<void> | null = null;
  let lastSuccessMs = -Infinity;
  let epoch = 0;
  let fetchedPeriodKey: string | null = null;
  let fetchedUserId: string | null = null;
  /** The last attempt ended without a full result (no session, a fetch failed, or it threw). */
  let lastAttemptFailed = false;

  function refresh({ full = false }: { full?: boolean } = {}): Promise<void> {
    if (inflight) return inflight;
    if (!deps.isOnline()) {
      if (!lastAttemptFailed) {
        lastAttemptFailed = true;
        deps.onStatusChange?.();
      }
      return Promise.resolve();
    }
    if (!full && deps.now().getTime() - lastSuccessMs < MIN_GAP_MS) return Promise.resolve();

    const myEpoch = epoch;
    let succeeded = false;
    const run = (async () => {
      const userId = await deps.sessionUserId();
      // The server returns no members without a session.
      if (!userId) return;
      const now = deps.now();
      const [profiles, points] = await Promise.all([deps.fetchProfiles(), deps.fetchPoints(now)]);
      if (myEpoch !== epoch || (await deps.sessionUserId()) !== userId) return;

      // A real member list always holds at least the signed-in member, so [] means it failed.
      const okProfiles = profiles.length > 0 ? profiles : null;
      if (!okProfiles && !points) return;
      deps.apply({ profiles: okProfiles, points });
      if (points) fetchedPeriodKey = leaguePeriodKey(now);
      if (okProfiles && points) {
        lastSuccessMs = now.getTime();
        fetchedUserId = userId;
        succeeded = true;
      }
    })()
      .catch((e) => console.error('Error refreshing league standings:', e))
      .finally(() => {
        if (inflight === run) inflight = null;
        // A run from before a sign-out says nothing about the new session.
        if (myEpoch === epoch) {
          lastAttemptFailed = !succeeded;
          deps.onStatusChange?.();
        }
      });
    inflight = run;
    deps.onStatusChange?.();
    return run;
  }

  /** Sign-out: forget everything; a request still in flight is discarded. */
  function reset() {
    epoch++;
    inflight = null;
    lastSuccessMs = -Infinity;
    fetchedPeriodKey = null;
    fetchedUserId = null;
    lastAttemptFailed = false;
  }

  return {
    refresh,
    reset,
    /** Period key of the last successful points fetch (null before one). */
    fetchedPeriodKey: () => fetchedPeriodKey,
    /** Member the last full success was for (null before one). */
    fetchedUserId: () => fetchedUserId,
    /** A request is running now. */
    isRefreshing: () => inflight !== null,
    /** The last attempt (or the device being offline) left no full result. */
    lastAttemptFailed: () => lastAttemptFailed,
  };
}
