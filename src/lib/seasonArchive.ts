import { AppState, LeagueArchive } from '@/types';
import {
  calculateSeasonalTotal,
  createArchive,
  generateCompetitors,
  getLeaguePeriodLabel,
  getUserRank,
} from './leagues';
import { EPOCH_UTC, SEASON_LENGTH_MS, getSeasonPeriodId } from './leagueTime';

/**
 * Season close (90-day league archive).
 *
 * pointsHistory keeps only the newest 500 entries; older entries of the running season live on
 * as the seasonEvictedPos / seasonEvictedNeg counters (minus evictedExcisionRecords). Those
 * counters belong to `state.seasonId` and are reset the moment a state crosses into a new season.
 * A season's final score is therefore only complete while the counters still belong to it, so
 * every place that resets them archives the closing season first (archiveSeasonBeforeRollover).
 */

type SeasonLedgerState = Pick<
  AppState,
  | 'pointsHistory'
  | 'seasonEvictedPos'
  | 'seasonEvictedNeg'
  | 'evictedExcisionRecords'
  | 'leagueArchives'
  | 'currentUser'
  | 'username'
  | 'totalPoints'
> & { seasonId?: number };

function getSeasonBounds(seasonNumber: number): { start: Date; end: Date } {
  const start = new Date(EPOCH_UTC.getTime() + (seasonNumber - 1) * SEASON_LENGTH_MS);
  return { start, end: new Date(start.getTime() + SEASON_LENGTH_MS) };
}

/** Season the evicted counters of this state belong to (missing seasonId = Season 1, as in addPointsInternal). */
function getLedgerSeason(state: { seasonId?: number }): number {
  return typeof state.seasonId === 'number' ? state.seasonId : 1;
}

/**
 * Final points of a season: the same floored ledger maths as the live season score.
 * Evicted counters are included only while they still belong to that season; otherwise
 * only the entries left in pointsHistory can be counted.
 */
export function calculateClosedSeasonPoints(state: SeasonLedgerState, seasonNumber: number): number {
  const { start, end } = getSeasonBounds(seasonNumber);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const ownsCounters = getLedgerSeason(state) === seasonNumber;

  const seasonHistory = (state.pointsHistory || []).filter((entry) => {
    if (!entry) return false;
    const ts = new Date(entry.timestamp).getTime();
    return ts >= startMs && ts < endMs;
  });

  const pos = ownsCounters && typeof state.seasonEvictedPos === 'number' && state.seasonEvictedPos > 0 ? state.seasonEvictedPos : 0;
  const neg = ownsCounters && typeof state.seasonEvictedNeg === 'number' && state.seasonEvictedNeg > 0 ? state.seasonEvictedNeg : 0;
  const excisionRecords = ownsCounters
    ? (state.evictedExcisionRecords || []).filter((r) => r && r.seasonNumber === seasonNumber)
    : [];

  return calculateSeasonalTotal(pos, neg, seasonHistory, start, excisionRecords, seasonNumber);
}

/** Builds the `S:<n>` archive, or null for a zero-point season (zero seasons are not archived). */
export function buildSeasonArchive(state: SeasonLedgerState, seasonNumber: number): LeagueArchive | null {
  const userPoints = calculateClosedSeasonPoints(state, seasonNumber);
  if (userPoints <= 0) return null;

  const seasonRefDate = getSeasonBounds(seasonNumber).start;
  const competitors = generateCompetitors(
    'ninetyDay',
    userPoints,
    state.currentUser,
    state.username,
    state.totalPoints,
    undefined,
    undefined,
    seasonRefDate
  ).filter((c) => !c.isSeed);

  const archive = createArchive(
    'ninetyDay',
    competitors,
    getUserRank(competitors),
    userPoints,
    getLeaguePeriodLabel('ninetyDay', seasonRefDate),
    getSeasonPeriodId(seasonRefDate)
  );
  archive.seasonNumber = seasonNumber;
  // Only a state that explicitly carries this season's counters yields a complete score.
  if (state.seasonId === seasonNumber) archive.scoreSource = 'ledger';
  return archive;
}

/**
 * Call right before a state's evicted counters are reset for a new season.
 * Returns leagueArchives with the closing season archived from its full ledger.
 * An existing archive for that season is kept unless it was scored from pointsHistory
 * alone (no scoreSource), which undercounts once entries were evicted.
 */
export function archiveSeasonBeforeRollover(
  state: SeasonLedgerState,
  activeSeasonNumber: number
): LeagueArchive[] {
  const archives = state.leagueArchives || [];
  const closingSeason = getLedgerSeason(state);
  if (closingSeason >= activeSeasonNumber) return archives;

  const periodId = getSeasonPeriodId(getSeasonBounds(closingSeason).start);
  const existing = archives.find((a) => a && a.id === periodId);
  if (existing && existing.scoreSource === 'ledger') return archives;

  const archive = buildSeasonArchive(state, closingSeason);
  if (!archive) return archives;

  return [archive, ...archives.filter((a) => !(a && a.id === periodId))];
}
