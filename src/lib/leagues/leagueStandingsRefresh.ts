import { getMonthPeriodId, getSeasonNumber, getWeekPeriodId } from '../time/leagueTime';

/** Polls, tab switches and mounts closer together than this share one fetch (unless `full`). */
const MIN_GAP_MS = 15_000;

/**
 * A poll between full fetches asks only for the points (this week's, month's and season's); the
 * member list is fetched again when it is this old.
 */
const FULL_SET_MAX_AGE_MS = 10 * 60_000;

/** The week, month and season a set of league points belongs to; a new one needs a full refresh. */
export function leaguePeriodKey(now: Date): string {
  return `${getWeekPeriodId(now)}|${getMonthPeriodId(now)}|S:${getSeasonNumber(now)}`;
}

export interface LeagueStandingsResult {
  /** Every member, season_points filled in; null for a slim (live points only) result. */
  profiles: any[] | null;
  /** Weekly/monthly points: period id -> member id -> points (members with 0 are absent). */
  points: Record<string, Record<string, number>> | null;
  /**
   * Slim only: this season's points, member id -> points (members with 0 are absent). Absent when
   * the server sent no season board (older SQL): the cached season points stay as they are.
   */
  seasonPoints?: Record<string, number> | null;
}

const BOARD_POINT_TYPES = ['weekly', 'monthly'] as const;

/** [member id, points] pairs of one board, as ascend_league_boards sends them; null if malformed. */
function pointsById(rows: unknown): Record<string, number> | null {
  if (!Array.isArray(rows)) return null;
  const byId: Record<string, number> = {};
  for (const row of rows) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || typeof row[1] !== 'number') return null;
    byId[row[0]] = row[1];
  }
  return byId;
}

/**
 * The ascend_league_boards answer as the league caches hold it: weekly/monthly points per period id,
 * and (full) the member list with each member's season points (0 when the season board omits them).
 * Null when anything the request asked for is missing, so the caches keep what they had.
 */
export function parseLeagueBoards(data: unknown, slim: boolean): LeagueStandingsResult | null {
  if (!data || typeof data !== 'object') return null;
  const boards = data as Record<string, any>;
  const points: Record<string, Record<string, number>> = {};
  for (const type of BOARD_POINT_TYPES) {
    const periodId = boards[type]?.period_id;
    const byId = pointsById(boards[type]?.points);
    if (typeof periodId !== 'string' || !byId) return null;
    points[periodId] = byId;
  }
  const seasonPoints = pointsById(boards.ninetyDay?.points);
  // Slim: the season board is optional (servers before 2026-11-07 send none, a malformed one is
  // ignored), so the live week/month points still apply and the cached season points stay.
  if (slim) return seasonPoints ? { profiles: null, points, seasonPoints } : { profiles: null, points };

  const members = boards.members;
  // A real member list always holds at least the signed-in member.
  if (!seasonPoints || !Array.isArray(members) || members.length === 0) return null;
  const profiles = members.map((m: any) => ({ ...m, season_points: seasonPoints[String(m?.id)] ?? 0 }));
  return { profiles, points };
}

export interface LeagueStandingsDeps {
  /** The signed-in member (guest included), or null with no session. */
  sessionUserId: () => Promise<string | null>;
  /** Full: members + this week's, month's and season's points; slim: the same points without the members (season optional). Null on failure. */
  fetchBoards: (slim: boolean) => Promise<LeagueStandingsResult | null>;
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
  /** Whether the run in flight reads (or was asked to read) the full set. */
  let inflightRun: { full: boolean } | null = null;
  /** A full refresh asked for while a points-only poll ran: it runs once that poll settles. */
  let queuedFull: Promise<void> | null = null;
  let lastSuccessMs = -Infinity;
  let epoch = 0;
  let fetchedPeriodKey: string | null = null;
  let fetchedUserId: string | null = null;
  /** The last attempt ended without a full result (no session, a fetch failed, or it threw). */
  let lastAttemptFailed = false;
  /** When the last full set came back, and the points it held (live polls merge into it). */
  let fullSetMs = -Infinity;
  let knownPoints: Record<string, Record<string, number>> | null = null;
  let knownMemberIds = new Set<string>();

  function refresh({ full = false }: { full?: boolean } = {}): Promise<void> {
    if (inflight) {
      if (!full || inflightRun?.full) return inflight;
      // A pull (or sign-in) during a points-only poll still gets a fresh member list: one full run
      // follows the poll, unless the poll itself took the full set.
      if (!queuedFull) {
        const run = inflightRun;
        const myEpoch = epoch;
        queuedFull = inflight.then(() => {
          queuedFull = null;
          if (myEpoch !== epoch || (run?.full && !lastAttemptFailed)) return;
          return refresh({ full: true });
        });
      }
      return queuedFull;
    }
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
    const thisRun = { full };
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

      if (needFullSet) thisRun.full = true;
      else {
        const live = await deps.fetchBoards(true);
        if (myEpoch !== epoch || (await deps.sessionUserId()) !== userId) return;
        if (!live?.points) return;
        const merged = { ...knownPoints, ...live.points };
        // Someone new scored: the member list must include them, so take the full set this time.
        const hasNewMember = [...Object.values(live.points), live.seasonPoints ?? {}].some((byUser) =>
          Object.keys(byUser).some((id) => !knownMemberIds.has(id))
        );
        thisRun.full = hasNewMember;
        if (!hasNewMember) {
          knownPoints = merged;
          deps.apply(
            live.seasonPoints
              ? { profiles: null, points: merged, seasonPoints: live.seasonPoints }
              : { profiles: null, points: merged }
          );
          lastSuccessMs = now.getTime();
          succeeded = true;
          return;
        }
      }

      const result = await deps.fetchBoards(false);
      if (myEpoch !== epoch || (await deps.sessionUserId()) !== userId) return;
      if (!result?.profiles || !result.points) return;
      deps.apply(result);
      fetchedPeriodKey = leaguePeriodKey(now);
      fullSetMs = now.getTime();
      knownPoints = result.points;
      knownMemberIds = new Set(result.profiles.map((p: any) => String(p?.id)));
      lastSuccessMs = now.getTime();
      fetchedUserId = userId;
      succeeded = true;
    })()
      .catch((e) => console.error('Error refreshing league standings:', e))
      .finally(() => {
        if (inflight === run) {
          inflight = null;
          inflightRun = null;
        }
        // A run from before a sign-out says nothing about the new session.
        if (myEpoch === epoch) {
          lastAttemptFailed = !succeeded;
          deps.onStatusChange?.();
        }
      });
    inflight = run;
    inflightRun = thisRun;
    deps.onStatusChange?.();
    return run;
  }

  /** Sign-out: forget everything; a request still in flight is discarded. */
  function reset() {
    epoch++;
    inflight = null;
    inflightRun = null;
    queuedFull = null;
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
