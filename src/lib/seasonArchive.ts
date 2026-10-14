import { AppState, LeagueArchive, LeagueCompetitor, SeasonHistoryEntry } from '@/types';
import { areProfilesLoaded } from './auth';
import {
  calculateSeasonalTotal,
  createArchive,
  generateCompetitors,
  getLeaguePeriodLabel,
  getSeasonLabel,
  getUserRank,
  toArchivedCompetitor,
} from './leagues';
import { EPOCH_UTC, SEASON_LENGTH_MS, getSeasonPeriodId } from './leagueTime';

/**
 * Season close (90-day league archive). The points ledger is complete (point_entries table),
 * so a season's final score comes from its entries alone. Every place that moves a state into
 * a new season archives the closing season first (archiveSeasonBeforeRollover).
 */

type SeasonLedgerState = Pick<
  AppState,
  | 'pointsHistory'
  | 'leagueArchives'
  | 'currentUser'
  | 'username'
  | 'totalPoints'
> & { seasonId?: number };

function getSeasonBounds(seasonNumber: number): { start: Date; end: Date } {
  const start = new Date(EPOCH_UTC.getTime() + (seasonNumber - 1) * SEASON_LENGTH_MS);
  return { start, end: new Date(start.getTime() + SEASON_LENGTH_MS) };
}

/** Season this state belongs to (missing seasonId = Season 1, as in addPointsInternal). */
function getLedgerSeason(state: { seasonId?: number }): number {
  return typeof state.seasonId === 'number' ? state.seasonId : 1;
}

/** Final points of a season: the same floored ledger maths as the live season score. */
export function calculateClosedSeasonPoints(state: SeasonLedgerState, seasonNumber: number): number {
  const { start, end } = getSeasonBounds(seasonNumber);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const seasonHistory = (state.pointsHistory || []).filter((entry) => {
    if (!entry) return false;
    const ts = new Date(entry.timestamp).getTime();
    return ts >= startMs && ts < endMs;
  });

  return calculateSeasonalTotal(seasonHistory, start);
}

/** Standings of a closed season: every real member's final score for it, seeds excluded. */
function buildSeasonStandings(state: SeasonLedgerState, seasonNumber: number, userPoints: number): LeagueCompetitor[] {
  return generateCompetitors(
    'ninetyDay',
    userPoints,
    state.currentUser,
    state.username,
    state.totalPoints,
    undefined,
    undefined,
    getSeasonBounds(seasonNumber).start
  ).filter((c) => !c.isSeed);
}

/** Builds the `S:<n>` archive, or null for a zero-point season (zero seasons are not archived). */
export function buildSeasonArchive(state: SeasonLedgerState, seasonNumber: number): LeagueArchive | null {
  const userPoints = calculateClosedSeasonPoints(state, seasonNumber);
  if (userPoints <= 0) return null;

  const seasonRefDate = getSeasonBounds(seasonNumber).start;
  const competitors = buildSeasonStandings(state, seasonNumber, userPoints);

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
  // Boot can close a season before other members' profiles arrive; standings are redone then.
  if (!areProfilesLoaded()) archive.standingsPending = true;
  return archive;
}

/**
 * Rebuilds the standings of season archives made before profiles had loaded.
 * The user's own points are final and kept as they are. Returns the same array when nothing changed.
 */
export function refreshPendingSeasonStandings(state: SeasonLedgerState): LeagueArchive[] {
  const archives = state.leagueArchives || [];
  if (!areProfilesLoaded() || !archives.some((a) => a && a.standingsPending)) return archives;

  return archives.map((archive) => {
    if (!archive || !archive.standingsPending || typeof archive.seasonNumber !== 'number') return archive;
    const competitors = buildSeasonStandings(state, archive.seasonNumber, archive.userPoints);
    const { standingsPending: _pending, ...rest } = archive;
    return { ...rest, competitors: competitors.map(toArchivedCompetitor), userRank: getUserRank(competitors) };
  });
}

/** The member's closed seasons as published on their profile, newest first. */
export function toSeasonHistory(archives: LeagueArchive[] = []): SeasonHistoryEntry[] {
  return archives
    .filter((a) => a && a.type === 'ninetyDay' && typeof a.seasonNumber === 'number' && a.userPoints > 0)
    .sort((a, b) => (b.seasonNumber as number) - (a.seasonNumber as number))
    .map((a) => ({
      seasonNumber: a.seasonNumber,
      seasonName: getSeasonLabel(getSeasonBounds(a.seasonNumber as number).start),
      points: a.userPoints,
      // Last day of the season (UTC), stable however often the archive is rebuilt.
      date: new Date(getSeasonBounds(a.seasonNumber as number).end.getTime() - 1).toISOString().slice(0, 10),
    }));
}

/**
 * Call right before a state moves into a new season.
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
