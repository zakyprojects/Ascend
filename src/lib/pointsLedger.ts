import { AppState, LeagueArchive, PointsEntry } from '@/types';
import { uid } from './dates';
import {
  calculateSeasonalTotal,
} from './leagues';
import { leagueNow, getSeasonNumber, getSeasonStart } from './leagueTime';

/**
 * Pure reducer function to add points (or apply point deductions) to AppState.
 * Manages:
 * 1. Automatic season rollover (the closing season's archive comes from the server)
 * 2. Deterministic recalculation of seasonPoints via calculateSeasonalTotal
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
  | 'pointsHistory'
  | 'leagueArchives'
> {
  const now = leagueNow();
  const activeSeasonNumber = getSeasonNumber(now);
  const activeSeasonStart = getSeasonStart(now);

  let seasonId = typeof prev.seasonId === 'number' ? prev.seasonId : 1;
  const leagueArchives: LeagueArchive[] = prev.leagueArchives ? [...prev.leagueArchives] : [];

  // Season Rollover Check (the closing season's archive comes from the server)
  if (seasonId < activeSeasonNumber) {
    seasonId = activeSeasonNumber;
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
  const newSeasonPoints = calculateSeasonalTotal(fullHistory, activeSeasonStart);

  return {
    seasonId,
    seasonPoints: newSeasonPoints,
    totalPoints: newSeasonPoints,
    pointsHistory: fullHistory,
    leagueArchives,
  };
}
