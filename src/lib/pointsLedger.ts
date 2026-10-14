import { AppState, LeagueArchive, PointsEntry, EvictedEntryRecord } from '@/types';
import { uid } from './dates';
import {
  calculateSeasonalTotal,
} from './leagues';
import { leagueNow, getSeasonNumber, getSeasonStart } from './leagueTime';
import { archiveSeasonBeforeRollover } from './seasonArchive';

/** Number of newest entries pointsHistory keeps; older ones move into the season's evicted counters. */
export const POINTS_HISTORY_LIMIT = 500;

/**
 * Trims a newest-first history to POINTS_HISTORY_LIMIT. Dropped entries of the active season are added
 * to the evicted counters once each: an id already in the season's evictedEntryIds is never counted again.
 * evictedEntryIds is season-scoped (reset at rollover) and deliberately uncapped: trimming it would let
 * a re-evicted id be counted twice and break the merge's ledger sums.
 */
export function evictHistoryOverflow(
  history: PointsEntry[],
  activeSeasonStart: Date,
  seasonId: number,
  seasonEvictedEntryIds: EvictedEntryRecord[]
): {
  keptHistory: PointsEntry[];
  seasonPosDrop: number;
  seasonNegDrop: number;
  evictedEntryIds: EvictedEntryRecord[];
} {
  const keptHistory = history.slice(0, POINTS_HISTORY_LIMIT);
  const droppedHistory = history.slice(POINTS_HISTORY_LIMIT);

  let seasonPosDrop = 0;
  let seasonNegDrop = 0;
  const existingEvictedIdSet = new Set(seasonEvictedEntryIds.map((r) => r.id));
  const newEvictedEntries: EvictedEntryRecord[] = [];

  for (const p of droppedHistory) {
    const amt = p.amount || 0;
    if (new Date(p.timestamp) >= activeSeasonStart) {
      if (p.id) {
        if (!existingEvictedIdSet.has(p.id)) {
          if (amt > 0) seasonPosDrop += amt;
          else seasonNegDrop += Math.abs(amt);
          newEvictedEntries.push({ id: p.id, seasonNumber: seasonId, amount: amt });
          existingEvictedIdSet.add(p.id);
        }
      } else {
        if (amt > 0) seasonPosDrop += amt;
        else seasonNegDrop += Math.abs(amt);
      }
    }
  }

  return {
    keptHistory,
    seasonPosDrop,
    seasonNegDrop,
    evictedEntryIds: [...seasonEvictedEntryIds, ...newEvictedEntries],
  };
}

/**
 * Pure reducer function to add points (or apply point deductions) to AppState.
 * Manages:
 * 1. Automatic season rollover & league archiving
 * 2. 500-entry pointsHistory cap (evictHistoryOverflow)
 * 3. Eviction tracking (seasonEvictedPos, seasonEvictedNeg, and evictedEntryIds ledger)
 * 4. Deterministic recalculation of seasonPoints via calculateSeasonalTotal
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
  const {
    keptHistory,
    seasonPosDrop,
    seasonNegDrop,
    evictedEntryIds: keptEvictedEntryIds,
  } = evictHistoryOverflow(fullHistory, activeSeasonStart, seasonId, currentEvictedEntryIds);

  const newSeasonEvictedPos = prevSeasonPos + seasonPosDrop;
  const newSeasonEvictedNeg = prevSeasonNeg + seasonNegDrop;

  const newSeasonPoints = calculateSeasonalTotal(
    newSeasonEvictedPos,
    newSeasonEvictedNeg,
    keptHistory,
    activeSeasonStart,
    currentEvictedExcisionRecords,
    seasonId
  );

  return {
    seasonId,
    seasonPoints: newSeasonPoints,
    seasonEvictedPos: newSeasonEvictedPos,
    seasonEvictedNeg: newSeasonEvictedNeg,
    evictedExcisionRecords: currentEvictedExcisionRecords,
    evictedEntryIds: keptEvictedEntryIds,
    totalPoints: newSeasonPoints,
    pointsHistory: keptHistory,
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
