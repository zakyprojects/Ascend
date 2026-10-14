import { AppState, LeagueArchive, PointsEntry } from '@/types';
import { uid } from './dates';
import {
  calculateSeasonalTotal,
} from './leagues';
import { leagueNow, getSeasonNumber, getSeasonStart } from './leagueTime';
import { archiveSeasonBeforeRollover } from './seasonArchive';

/**
 * Pure reducer function to add points (or apply point deductions) to AppState.
 * Manages:
 * 1. Automatic season rollover & league archiving
 * 2. Deterministic recalculation of seasonPoints via calculateSeasonalTotal
 * The ledger is complete (point_entries table, batch D). The evicted counters and
 * evictedEntryIds only carry entries the old 500-entry cap dropped this season;
 * nothing is evicted any more and they reset at rollover.
 */
export function addPointsInternal(
  prev: AppState,
  amount: number,
  reason: string,
  source: string,
  metadata?: Record<string, any>,
  customTimestamp?: string,
  idOverride?: string
): Pick<
  AppState,
  | 'seasonPoints'
  | 'totalPoints'
  | 'seasonId'
  | 'seasonEvictedPos'
  | 'seasonEvictedNeg'
  | 'evictedExcisionRecords'
  | 'evictedEntryIds'
  | 'pointsHistory'
  | 'leagueArchives'
> {
  const now = leagueNow();
  const activeSeasonNumber = getSeasonNumber(now);
  const activeSeasonStart = getSeasonStart(now);

  let seasonId = typeof prev.seasonId === 'number' ? prev.seasonId : 1;
  let prevSeasonPos = typeof prev.seasonEvictedPos === 'number' && prev.seasonEvictedPos >= 0 ? prev.seasonEvictedPos : 0;
  let prevSeasonNeg = typeof prev.seasonEvictedNeg === 'number' && prev.seasonEvictedNeg >= 0 ? prev.seasonEvictedNeg : 0;
  let leagueArchives: LeagueArchive[] = prev.leagueArchives ? [...prev.leagueArchives] : [];

  // Season Rollover Check (archive the closing season while its evicted counters still exist)
  if (seasonId < activeSeasonNumber) {
    leagueArchives = archiveSeasonBeforeRollover(prev, activeSeasonNumber);
    seasonId = activeSeasonNumber;
    prevSeasonPos = 0;
    prevSeasonNeg = 0;
  }

  const currentEvictedExcisionRecords = (prev.evictedExcisionRecords || []).filter(
    (r) => r && r.seasonNumber === seasonId
  );
  const currentEvictedEntryIds = (prev.evictedEntryIds || []).filter(
    (r) => r && r.seasonNumber === seasonId
  );

  // If this deterministic ID was already evicted into the season ledger,
  // return state unchanged to prevent unbounded re-award and re-eviction loops.
  if (idOverride && currentEvictedEntryIds.some((r) => r && r.id === idOverride)) {
    const currentSeasonPoints = calculateSeasonalTotal(
      prevSeasonPos,
      prevSeasonNeg,
      prev.pointsHistory || [],
      activeSeasonStart,
      currentEvictedExcisionRecords,
      seasonId
    );
    return {
      seasonId,
      seasonPoints: currentSeasonPoints,
      seasonEvictedPos: prevSeasonPos,
      seasonEvictedNeg: prevSeasonNeg,
      evictedExcisionRecords: currentEvictedExcisionRecords,
      evictedEntryIds: currentEvictedEntryIds,
      totalPoints: currentSeasonPoints,
      pointsHistory: prev.pointsHistory || [],
      leagueArchives,
    };
  }

  const prevHistory = prev.pointsHistory || [];
  const filteredPrevHistory = idOverride
    ? prevHistory.filter((e) => e && e.id !== idOverride)
    : prevHistory;

  const newEntry: PointsEntry = {
    id: idOverride || uid(),
    amount,
    reason,
    source,
    timestamp: customTimestamp || leagueNow().toISOString(),
    ...(metadata ? { metadata } : {}),
  };

  const fullHistory = [newEntry, ...filteredPrevHistory];
  if (customTimestamp) {
    fullHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  const newSeasonPoints = calculateSeasonalTotal(
    prevSeasonPos,
    prevSeasonNeg,
    fullHistory,
    activeSeasonStart,
    currentEvictedExcisionRecords,
    seasonId
  );

  return {
    seasonId,
    seasonPoints: newSeasonPoints,
    seasonEvictedPos: prevSeasonPos,
    seasonEvictedNeg: prevSeasonNeg,
    evictedExcisionRecords: currentEvictedExcisionRecords,
    evictedEntryIds: currentEvictedEntryIds,
    totalPoints: newSeasonPoints,
    pointsHistory: fullHistory,
    leagueArchives,
  };
}

/**
 * Applies a penalty deduction to AppState using the canonical addPointsInternal reducer.
 */
export function applyPenaltyDeductionInternal(
  state: AppState,
  penaltyAmount: number,
  reason: string,
  source: string,
  metadata?: Record<string, any>,
  customTimestamp?: string
): Pick<
  AppState,
  | 'seasonId'
  | 'seasonPoints'
  | 'seasonEvictedPos'
  | 'seasonEvictedNeg'
  | 'evictedExcisionRecords'
  | 'evictedEntryIds'
  | 'totalPoints'
  | 'pointsHistory'
  | 'leagueArchives'
> {
  return addPointsInternal(state, -penaltyAmount, reason, source, metadata, customTimestamp);
}
