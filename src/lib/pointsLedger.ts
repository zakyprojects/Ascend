import { AppState, LeagueArchive, PointsEntry, EvictedEntryRecord } from '@/types';
import { uid } from './dates';
import {
  getSeasonNumber,
  startOfNinetyDayCycle,
  createDeterministicArchiveId,
  calculateSeasonalTotal,
} from './leagues';

/**
 * Pure reducer function to add points (or apply point deductions) to AppState.
 * Manages:
 * 1. Automatic season rollover & league archiving
 * 2. 500-entry pointsHistory cap
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
  const activeSeasonNumber = getSeasonNumber();
  const activeSeasonStart = startOfNinetyDayCycle();

  let seasonId = typeof prev.seasonId === 'number' ? prev.seasonId : 1;
  let prevSeasonPos = typeof prev.seasonEvictedPos === 'number' && prev.seasonEvictedPos >= 0 ? prev.seasonEvictedPos : 0;
  let prevSeasonNeg = typeof prev.seasonEvictedNeg === 'number' && prev.seasonEvictedNeg >= 0 ? prev.seasonEvictedNeg : 0;
  let leagueArchives: LeagueArchive[] = prev.leagueArchives ? [...prev.leagueArchives] : [];

  // Season Rollover Check
  if (seasonId < activeSeasonNumber) {
    const pastSeasonNum = seasonId;
    const pastArchiveId = createDeterministicArchiveId(pastSeasonNum);
    if (!leagueArchives.some((a) => a.id === pastArchiveId || (a.type === 'ninetyDay' && a.seasonNumber === pastSeasonNum))) {
      const pastPoints = typeof prev.seasonPoints === 'number' ? prev.seasonPoints : (prev.totalPoints || 0);
      leagueArchives.push({
        id: pastArchiveId,
        type: 'ninetyDay',
        periodLabel: `Season ${pastSeasonNum}`,
        seasonNumber: pastSeasonNum,
        competitors: [],
        userRank: 1,
        userPoints: pastPoints,
        archivedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        participantCount: 1,
      });
    }
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
  const prevHistory = prev.pointsHistory || [];
  const filteredPrevHistory = idOverride
    ? prevHistory.filter((e) => e && e.id !== idOverride)
    : prevHistory;

  const newEntry: PointsEntry = {
    id: idOverride || uid(),
    amount,
    reason,
    source,
    timestamp: customTimestamp || new Date().toISOString(),
    ...(metadata ? { metadata } : {}),
  };

  const fullHistory = [newEntry, ...filteredPrevHistory];
  if (customTimestamp) {
    fullHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  const keptHistory = fullHistory.slice(0, 500);
  const droppedHistory = fullHistory.slice(500);

  let seasonPosDrop = 0;
  let seasonNegDrop = 0;
  const existingEvictedIdSet = new Set(currentEvictedEntryIds.map((r) => r.id));
  const newEvictedEntries: EvictedEntryRecord[] = [];

  for (const p of droppedHistory) {
    const amt = p.amount || 0;
    if (new Date(p.timestamp) >= activeSeasonStart) {
      if (amt > 0) seasonPosDrop += amt;
      else seasonNegDrop += Math.abs(amt);
      if (p.id && !existingEvictedIdSet.has(p.id)) {
        newEvictedEntries.push({ id: p.id, seasonNumber: seasonId, amount: amt });
        existingEvictedIdSet.add(p.id);
      }
    }
  }

  const keptEvictedEntryIds = [...currentEvictedEntryIds, ...newEvictedEntries].slice(-1000);

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
