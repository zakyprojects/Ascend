import { getMonthPeriodId, getSeasonNumber, getWeekPeriodId } from './leagueTime';

/** Polls, tab switches and mounts closer together than this share one fetch (unless `full`). */
const MIN_GAP_MS = 15_000;

/**
 * A poll between full fetches asks only for this week's and month's points (the ones that move);
 * the member list and the 24 earlier periods are fetched again when they are this old.
 */
const FULL_SET_MAX_AGE_MS = 10 * 60_000;

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
  /** 'all' = every period a league view or archive scores; 'live' = this week and month. Null on failure. */
  fetchPoints: (now: Date, scope: 'all' | 'live') => Promise<Record<string, Record<string, number>> | null>;
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
  /** When profiles + all periods last came back together, and what they held (live polls merge into it). */
  let fullSetMs = -Infinity;
  let knownPoints: Record<string, Record<string, number>> | null = null;
  let knownMemberIds = new Set<string>();

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
      const needFullSet =
        full ||
        !knownPoints ||
        fetchedUserId !== userId ||
        fetchedPeriodKey !== leaguePeriodKey(now) ||
        now.getTime() - fullSetMs >= FULL_SET_MAX_AGE_MS;

      if (!needFullSet) {
        const live = await deps.fetchPoints(now, 'live');
        if (myEpoch !== epoch || (await deps.sessionUserId()) !== userId) return;
        if (!live) return;
        const merged = { ...knownPoints, ...live };
        // Someone new scored: the member list must include them, so take the full set this time.
        const hasNewMember = Object.values(live).some((byUser) =>
          Object.keys(byUser).some((id) => !knownMemberIds.has(id))
        );
        if (!hasNewMember) {
          knownPoints = merged;
          deps.apply({ profiles: null, points: merged });
          lastSuccessMs = now.getTime();
          succeeded = true;
          return;
        }
      }

      const [profiles, points] = await Promise.all([deps.fetchProfiles(), deps.fetchPoints(now, 'all')]);
      if (myEpoch !== epoch || (await deps.sessionUserId()) !== userId) return;

      // A real member list always holds at least the signed-in member, so [] means it failed.
      const okProfiles = profiles.length > 0 ? profiles : null;
      if (!okProfiles && !points) return;
      deps.apply({ profiles: okProfiles, points });
      if (points) fetchedPeriodKey = leaguePeriodKey(now);
      if (okProfiles && points) {
        fullSetMs = now.getTime();
        knownPoints = points;
        knownMemberIds = new Set(okProfiles.map((p: any) => String(p?.id)));
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
    fullSetMs = -Infinity;
    knownPoints = null;
    knownMemberIds = new Set();
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
