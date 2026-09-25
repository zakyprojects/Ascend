import {
  AppState,
  Habit,
  JournalEntry,
  PointsEntry,
  LeagueArchive,
  WorkoutLog,
  Book,
  ReadingProgressLog,
  Skill,
  SkillSessionLog,
  BadHabit,
  BadHabitLog,
  CravingLog,
  FocusSessionLog,
  DecisionLog,
  EmotionLog,
  WeeklyGoal,
  WeeklyGoalItem,
  WeeklyGoalReflection,
  Goal,
  Project,
  Task,
  TaskSubtask,
  UserBook,
  UserBookStatus,
  ImprovementPlan,
  UserPlanFollow,
  PartnerInvite,
  Partnership,
  SharedChallenge,
  AppNotification,
  EvictedEntryRecord,
  TimeTrackerState,
  TimeTrackerActivity,
  TimeTrackerTemplate,
  TimeTrackerBlock,
  DEFAULT_TIME_TRACKER_ACTIVITIES,
  DEFAULT_TIME_TRACKER_STATE,
  DEFAULT_STATE,
} from '@/types';
import { mergeSharedChallenge } from './pactLifecycle';
import { ensureDefaultActivities } from './timeTracker';
import { parseDate } from './dates';
import { calculateSeasonalTotal } from './leagues';
import { leagueNow, getSeasonNumber, getSeasonStart } from './leagueTime';
import { computeStateDataWeight, type UserDataWeight } from './dataWeight';

function mergeEntityArrays<T extends { id?: string; createdAt?: string | number; updatedAt?: string; timestamp?: string }>(
  baseArr: T[] = [],
  incomingArr: T[] = [],
  tombstoneSet: Set<string>,
  customMerge?: (baseItem: T, incomingItem: T) => T
): T[] {
  const map = new Map<string, T>();

  for (const item of baseArr) {
    if (item && item.id && !tombstoneSet.has(item.id)) {
      map.set(item.id, item);
    }
  }

  for (const item of incomingArr) {
    if (!item || !item.id || tombstoneSet.has(item.id)) continue;

    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      if (customMerge) {
        map.set(item.id, customMerge(existing, item));
      } else {
        const existingTime = existing.updatedAt || (existing.createdAt !== undefined ? String(existing.createdAt) : '') || existing.timestamp || '';
        const incomingTime = item.updatedAt || (item.createdAt !== undefined ? String(item.createdAt) : '') || item.timestamp || '';
        if (incomingTime >= existingTime) {
          map.set(item.id, { ...existing, ...item });
        } else {
          map.set(item.id, { ...item, ...existing });
        }
      }
    }
  }

  return Array.from(map.values());
}

function normalizeHabitCompletions(
  completions: Habit['completions'] | string[] | undefined,
  fallbackTime: string
): Record<string, { done: boolean; updatedAt: string }> {
  if (!completions) return {};
  if (Array.isArray(completions)) {
    const res: Record<string, { done: boolean; updatedAt: string }> = {};
    for (const d of completions) {
      if (typeof d === 'string' && d) {
        res[d] = { done: true, updatedAt: fallbackTime };
      }
    }
    return res;
  }
  const res: Record<string, { done: boolean; updatedAt: string }> = {};
  for (const [key, val] of Object.entries(completions)) {
    if (val && typeof val === 'object') {
      res[key] = {
        done: Boolean((val as { done?: boolean }).done ?? true),
        updatedAt: (val as { updatedAt?: string }).updatedAt || fallbackTime,
      };
    } else if (typeof val === 'boolean') {
      res[key] = { done: val, updatedAt: fallbackTime };
    }
  }
  return res;
}

function mergeHabitCompletions(
  baseCompletions: Record<string, { done: boolean; updatedAt: string }>,
  incomingCompletions: Record<string, { done: boolean; updatedAt: string }>
): Record<string, { done: boolean; updatedAt: string }> {
  const merged: Record<string, { done: boolean; updatedAt: string }> = { ...baseCompletions };
  for (const [dateKey, incEntry] of Object.entries(incomingCompletions || {})) {
    const baseEntry = merged[dateKey];
    if (!baseEntry) {
      merged[dateKey] = incEntry;
    } else {
      const baseTime = baseEntry.updatedAt || '';
      const incTime = incEntry.updatedAt || '';
      if (incTime >= baseTime) {
        merged[dateKey] = incEntry;
      }
    }
  }
  return merged;
}

/**
 * Deduplicate preset habits by normalized name while strictly leaving custom habits untouched.
 * For duplicate preset habits with the same normalized name:
 * - The habit with the earliest createdAt is kept as winner.
 * - Completions across all duplicate members are merged into the winner.
 * - Non-winner habit IDs are added to deletedEntityIds.
 */
export function deduplicatePresetHabits(
  habits: Habit[] = [],
  deletedEntityIds: string[] = []
): { habits: Habit[]; deletedEntityIds: string[] } {
  const customHabits: Habit[] = [];
  const presetGroups = new Map<string, Habit[]>();

  for (const h of habits) {
    if (!h) continue;
    if (!h.isPreset) {
      customHabits.push(h);
    } else {
      const normName = (h.name || '').trim().toLowerCase();
      const existingGroup = presetGroups.get(normName) || [];
      existingGroup.push(h);
      presetGroups.set(normName, existingGroup);
    }
  }

  const newDeletedIds = new Set(deletedEntityIds || []);
  const processedPresetWinners = new Map<string, Habit>();

  for (const [normName, group] of presetGroups.entries()) {
    if (group.length === 1) {
      processedPresetWinners.set(normName, {
        ...group[0],
        completions: normalizeHabitCompletions(
          group[0].completions,
          group[0].updatedAt || group[0].createdAt || new Date().toISOString()
        ),
      });
      continue;
    }

    // Multiple preset habits with same name: find winner with earliest createdAt
    const sorted = [...group].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return (timeA || 0) - (timeB || 0);
    });

    const winner = sorted[0];
    let mergedComps = normalizeHabitCompletions(
      winner.completions,
      winner.updatedAt || winner.createdAt || new Date().toISOString()
    );
    const mergedMissedPeriods = new Set<string>(winner.missedPeriods || []);

    for (const member of group) {
      for (const mp of member.missedPeriods || []) {
        mergedMissedPeriods.add(mp);
      }
      if (member.id && member.id !== winner.id) {
        newDeletedIds.add(member.id);
        const memberComps = normalizeHabitCompletions(
          member.completions,
          member.updatedAt || member.createdAt || new Date().toISOString()
        );
        mergedComps = mergeHabitCompletions(mergedComps, memberComps);
      }
    }

    processedPresetWinners.set(normName, {
      ...winner,
      missedPeriods: Array.from(mergedMissedPeriods),
      completions: mergedComps,
    });
  }

  // Build final array preserving original relative array ordering
  const finalHabits: Habit[] = [];
  const emittedPresetNames = new Set<string>();

  for (const h of habits) {
    if (!h) continue;
    if (!h.isPreset) {
      finalHabits.push(h);
    } else {
      const normName = (h.name || '').trim().toLowerCase();
      if (!emittedPresetNames.has(normName)) {
        emittedPresetNames.add(normName);
        const winnerHabit = processedPresetWinners.get(normName);
        if (winnerHabit) {
          finalHabits.push(winnerHabit);
        }
      }
    }
  }

  const finalDeletedIds = Array.from(newDeletedIds).slice(-500);

  return {
    habits: finalHabits,
    deletedEntityIds: finalDeletedIds,
  };
}

function mergeWeeklyGoals(
  baseList: WeeklyGoal[] = [],
  incomingList: WeeklyGoal[] = [],
  tombstoneSet: Set<string>
): WeeklyGoal[] {
  const map = new Map<string, WeeklyGoal>();

  for (const wg of baseList) {
    if (!wg || !wg.weekKey) continue;
    const filteredGoals = (wg.goals || []).filter((g) => !g.id || !tombstoneSet.has(g.id));
    const filteredReflections = (wg.reflections || []).filter((r) => !r.id || !tombstoneSet.has(r.id));
    map.set(wg.weekKey, {
      ...wg,
      goals: filteredGoals,
      reflections: filteredReflections,
    });
  }

  for (const wg of incomingList) {
    if (!wg || !wg.weekKey) continue;
    const filteredGoals = (wg.goals || []).filter((g) => !g.id || !tombstoneSet.has(g.id));
    const filteredReflections = (wg.reflections || []).filter((r) => !r.id || !tombstoneSet.has(r.id));

    const existing = map.get(wg.weekKey);
    if (!existing) {
      map.set(wg.weekKey, {
        ...wg,
        goals: filteredGoals,
        reflections: filteredReflections,
      });
    } else {
      // Merge goals within week
      const goalsMap = new Map<string, WeeklyGoalItem>();
      for (const g of existing.goals || []) {
        if (g.id && !tombstoneSet.has(g.id)) goalsMap.set(g.id, g);
      }
      for (const g of filteredGoals) {
        if (g.id && !tombstoneSet.has(g.id)) {
          const exG = goalsMap.get(g.id);
          if (!exG) {
            goalsMap.set(g.id, g);
          } else {
            const exTime = exG.createdAt || '';
            const inTime = g.createdAt || '';
            if (inTime >= exTime) {
              goalsMap.set(g.id, { ...exG, ...g });
            } else {
              goalsMap.set(g.id, { ...g, ...exG });
            }
          }
        }
      }

      // Merge reflections within week
      const refMap = new Map<string, WeeklyGoalReflection>();
      for (const r of existing.reflections || []) {
        if (r.id && !tombstoneSet.has(r.id)) refMap.set(r.id, r);
      }
      for (const r of filteredReflections) {
        if (r.id && !tombstoneSet.has(r.id)) {
          const exR = refMap.get(r.id);
          if (!exR) {
            refMap.set(r.id, r);
          } else {
            const exTime = exR.updatedAt || exR.createdAt || '';
            const inTime = r.updatedAt || r.createdAt || '';
            if (inTime >= exTime) {
              refMap.set(r.id, { ...exR, ...r });
            } else {
              refMap.set(r.id, { ...r, ...exR });
            }
          }
        }
      }

      map.set(wg.weekKey, {
        ...existing,
        ...wg,
        goals: Array.from(goalsMap.values()),
        reflections: Array.from(refMap.values()),
      });
    }
  }

  return Array.from(map.values());
}

function mergeBadHabitLogs(
  baseList: BadHabitLog[] = [],
  incomingList: BadHabitLog[] = [],
  tombstoneSet: Set<string>
): BadHabitLog[] {
  const map = new Map<string, BadHabitLog>();

  const processLog = (log: BadHabitLog) => {
    if (!log) return;
    if (log.id && tombstoneSet.has(log.id)) return;
    if (log.badHabitId && tombstoneSet.has(log.badHabitId)) return;

    // Use compositeKey in map to prevent duplicate logs for the same bad habit on the same date via LWW
    const key = `${log.badHabitId}_${log.date}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, log);
    } else {
      const existingParsed = parseDate(existing.updatedAt) || parseDate(existing.createdAt);
      const existingTime = existingParsed ? existingParsed.getTime() : 0;
      const incomingParsed = parseDate(log.updatedAt) || parseDate(log.createdAt);
      const incomingTime = incomingParsed ? incomingParsed.getTime() : 0;
      if (incomingTime >= existingTime) {
        map.set(key, log);
      }
    }
  };

  baseList.forEach(processLog);
  incomingList.forEach(processLog);

  return Array.from(map.values()).sort((a, b) => {
    // BadHabitLog.date is always 'YYYY-MM-DD', createdAt is ISO timestamp.
    // Try parseDate on date first, then fallback to createdAt.
    const timeB = (parseDate(b.date) || parseDate(b.createdAt))?.getTime() ?? 0;
    const timeA = (parseDate(a.date) || parseDate(a.createdAt))?.getTime() ?? 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    // Safe deterministic fallback
    return (b.id || '').localeCompare(a.id || '');
  });
}

function mergeLeagueArchives(
  baseList: LeagueArchive[] = [],
  incomingList: LeagueArchive[] = []
): LeagueArchive[] {
  const map = new Map<string, LeagueArchive>();

  for (const item of baseList) {
    if (!item || !item.id) continue;
    map.set(item.id, item);
  }

  for (const item of incomingList) {
    if (!item || !item.id) continue;
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.archivedAt || 0).getTime() - new Date(a.archivedAt || 0).getTime()
  );
}

/**
 * Pattern matching invalid/poisoned domain-slot composite tombstones.
 * Rejects composite patterns such as:
 * - `<entityId>_<YYYY-MM-DD>` (e.g. `badHabitId_2026-09-01`)
 * - `<entityId>_<periodKey>` or other domain-slot formats.
 * Preserves clean entity UUIDs, points entry IDs (e.g., `p_...`), and standalone IDs.
 */
const POISONED_COMPOSITE_KEY_REGEX = /^[A-Za-z0-9_-]+_\d{4}-\d{2}-\d{2}$/;

export function isLegitimateTombstoneId(id: unknown): id is string {
  if (typeof id !== 'string' || !id.trim()) return false;
  const trimmed = id.trim();
  // Reject composite date-slot keys
  if (POISONED_COMPOSITE_KEY_REGEX.test(trimmed)) {
    return false;
  }
  return true;
}

export type MergeContext = 'hydration' | 'writeSync';

interface MergeInternalOptions {
  tombstoneSetOverride?: Set<string>;
}

function mergeAppStateInternal(
  baseState: AppState,
  incomingState: AppState,
  mergeContext: MergeContext = 'hydration',
  options?: MergeInternalOptions
): AppState {
  if (!baseState) return incomingState || DEFAULT_STATE;
  if (!incomingState) return baseState || DEFAULT_STATE;

  // 1. Tombstones union and cap with Global Ingestion Sanitizer
  const rawTombstones = [
    ...(baseState.deletedEntityIds || []),
    ...(incomingState.deletedEntityIds || []),
  ];

  const sanitizedTombstones = rawTombstones.filter(isLegitimateTombstoneId);
  const historicalTombstoneSet = new Set<string>(sanitizedTombstones);

  // Un-tombstone IDs that were explicitly restored in incomingState
  for (const restoredId of incomingState.restoredEntityIds || []) {
    historicalTombstoneSet.delete(restoredId);
  }

  const mergedDeletedEntityIds = Array.from(historicalTombstoneSet).slice(-500);
  const tombstoneSet = options?.tombstoneSetOverride ?? historicalTombstoneSet;

  // Union restoredEntityIds so restoration signals persist across syncs
  const mergedRestoredEntityIds = Array.from(
    new Set([
      ...(baseState.restoredEntityIds || []),
      ...(incomingState.restoredEntityIds || []),
    ])
  ).slice(-500);

  // 2. Habits (last-write-wins by updatedAt/createdAt, with per-date completions merge)
  const mergedHabitsRaw = mergeEntityArrays(
    baseState.habits || [],
    incomingState.habits || [],
    tombstoneSet,
    (baseH: Habit, incH: Habit) => {
      const baseTime = baseH.updatedAt || baseH.createdAt || '';
      const incTime = incH.updatedAt || incH.createdAt || '';
      const winner = incTime >= baseTime ? incH : baseH;
      const baseComps = normalizeHabitCompletions(baseH.completions, baseTime || new Date().toISOString());
      const incComps = normalizeHabitCompletions(incH.completions, incTime || new Date().toISOString());
      const mergedComps = mergeHabitCompletions(baseComps, incComps);
      const mergedMissed = Array.from(
        new Set([...(baseH.missedPeriods || []), ...(incH.missedPeriods || [])])
      );
      return {
        ...winner,
        missedPeriods: mergedMissed,
        completions: mergedComps,
      };
    }
  );
  const normalizedHabits = mergedHabitsRaw.map((h) => ({
    ...h,
    completions: normalizeHabitCompletions(h.completions, h.updatedAt || h.createdAt || new Date().toISOString()),
  }));

  const { habits, deletedEntityIds: postHabitDeletedEntityIds } = deduplicatePresetHabits(
    normalizedHabits,
    mergedDeletedEntityIds
  );

  // 3. Journal entries
  const journalEntries = mergeEntityArrays(
    baseState.journalEntries || [],
    incomingState.journalEntries || [],
    tombstoneSet
  );

  // 4. Points history & Total points (Epoch-Gated Seasonal Resolution)
  const currentSeason = getSeasonNumber(leagueNow());
  const baseSeason = baseState.seasonId || 1;
  const incSeason = incomingState.seasonId || 1;
  // Clamped to currentSeason — a corrupted/future seasonId from any device must never advance the account beyond the real season. Fixes the wrong-clock vulnerability identified in Phase 4 Mode A (2026-09-20).
  const maxSeason = Math.min(Math.max(baseSeason, incSeason, currentSeason), currentSeason);

  const mergedEvictedEntryIds = mergeEntityArrays(
    baseState.evictedEntryIds || [],
    incomingState.evictedEntryIds || [],
    tombstoneSet,
    (a, b) => ({ ...a, ...b, amount: typeof b.amount === 'number' ? b.amount : (a.amount || 0) })
  )
    .filter((r) => r && r.seasonNumber === maxSeason)
    .slice(-1000);

  const evictedEntryIdSet = new Set(
    mergedEvictedEntryIds.map((r) => r && r.id).filter(Boolean)
  );

  let ledgerSeasonPos = 0;
  let ledgerSeasonNeg = 0;
  for (const record of mergedEvictedEntryIds) {
    const amt = record.amount || 0;
    if (amt > 0) {
      ledgerSeasonPos += amt;
    } else if (amt < 0) {
      ledgerSeasonNeg += Math.abs(amt);
    }
  }

  // Calculate each side's own ledger sum for maxSeason
  let baseOwnLedgerPos = 0;
  let baseOwnLedgerNeg = 0;
  if (baseSeason === maxSeason) {
    for (const r of baseState.evictedEntryIds || []) {
      if (r && r.seasonNumber === maxSeason) {
        const amt = r.amount || 0;
        if (amt > 0) baseOwnLedgerPos += amt;
        else if (amt < 0) baseOwnLedgerNeg += Math.abs(amt);
      }
    }
  }

  let incOwnLedgerPos = 0;
  let incOwnLedgerNeg = 0;
  if (incSeason === maxSeason) {
    for (const r of incomingState.evictedEntryIds || []) {
      if (r && r.seasonNumber === maxSeason) {
        const amt = r.amount || 0;
        if (amt > 0) incOwnLedgerPos += amt;
        else if (amt < 0) incOwnLedgerNeg += Math.abs(amt);
      }
    }
  }

  // Legacy gap = scalar minus own ledger sum (untracked pre-ledger points)
  const baseLegacyGapPos = baseSeason === maxSeason ? Math.max(0, (baseState.seasonEvictedPos || 0) - baseOwnLedgerPos) : 0;
  const baseLegacyGapNeg = baseSeason === maxSeason ? Math.max(0, (baseState.seasonEvictedNeg || 0) - baseOwnLedgerNeg) : 0;

  const incLegacyGapPos = incSeason === maxSeason ? Math.max(0, (incomingState.seasonEvictedPos || 0) - incOwnLedgerPos) : 0;
  const incLegacyGapNeg = incSeason === maxSeason ? Math.max(0, (incomingState.seasonEvictedNeg || 0) - incOwnLedgerNeg) : 0;

  // Resolution of untracked legacy gaps:
  // We take Math.max of the two legacy gaps. This aligns with the codebase's existing pre-ledger merge philosophy
  // (which used Math.max of scalar counters between syncs). In multi-device setups that previously synced before
  // ledger tracking was introduced, both devices frequently shared the same untracked evicted baseline; summing
  // the gaps would double-count that shared pre-ledger history. The residual risk is that if two devices were
  // completely offline/partitioned from each other for their entire pre-ledger history, only the larger legacy gap
  // is credited rather than both. Since new evictions are fully tracked by ID in the ledger and properly summed,
  // this bounded legacy gap only applies to pre-migration data and safely expires at season rollover.
  const resolvedLegacyGapPos = Math.max(baseLegacyGapPos, incLegacyGapPos);
  const resolvedLegacyGapNeg = Math.max(baseLegacyGapNeg, incLegacyGapNeg);

  let mergedSeasonPos = ledgerSeasonPos + resolvedLegacyGapPos;
  let mergedSeasonNeg = ledgerSeasonNeg + resolvedLegacyGapNeg;

  const mergedHistoryFull = mergeEntityArrays(
    baseState.pointsHistory || [],
    incomingState.pointsHistory || [],
    tombstoneSet
  ).sort((a: PointsEntry, b: PointsEntry) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeB - timeA;
  });

  // Deduplicate habit_completed entries by (habitId, periodKey), keeping earliest timestamp (with deterministic id tie-breaker)
  const habitCompletionBest = new Map<string, PointsEntry>();
  const duplicateHabitEntryIds = new Set<string>();

  for (const entry of mergedHistoryFull) {
    if (
      entry &&
      entry.source === 'habit_completed' &&
      entry.metadata &&
      typeof entry.metadata.habitId === 'string' &&
      entry.metadata.habitId &&
      typeof entry.metadata.periodKey === 'string' &&
      entry.metadata.periodKey
    ) {
      const dedupKey = `${entry.metadata.habitId}_${entry.metadata.periodKey}`;
      const existing = habitCompletionBest.get(dedupKey);
      if (!existing) {
        habitCompletionBest.set(dedupKey, entry);
      } else {
        const timeCand = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
        const timeExist = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
        let replace = false;
        if (timeCand !== timeExist) {
          replace = timeCand < timeExist; // earliest timestamp wins
        } else {
          replace = (entry.id || '') < (existing.id || ''); // deterministic tie-breaker
        }
        if (replace) {
          if (existing.id) duplicateHabitEntryIds.add(existing.id);
          habitCompletionBest.set(dedupKey, entry);
        } else {
          if (entry.id) duplicateHabitEntryIds.add(entry.id);
        }
      }
    }
  }

  // Deduplicate weekly_review +20 award entries by weekKey, keeping earliest timestamp (with deterministic id tie-breaker)
  const weeklyReviewBest = new Map<string, PointsEntry>();
  const duplicateWeeklyReviewEntryIds = new Set<string>();

  for (const entry of mergedHistoryFull) {
    if (entry && entry.source === 'weekly_review' && (entry.amount || 0) > 0) {
      let weekKey: string | null = null;
      if (entry.metadata && typeof entry.metadata.weekKey === 'string' && entry.metadata.weekKey) {
        weekKey = entry.metadata.weekKey;
      } else if (entry.reason) {
        const match = entry.reason.match(/\b\d{4}-W\d{2}\b/);
        if (match) {
          weekKey = match[0];
        }
      }

      if (weekKey) {
        const existing = weeklyReviewBest.get(weekKey);
        if (!existing) {
          weeklyReviewBest.set(weekKey, entry);
        } else {
          const timeCand = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
          const timeExist = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
          let replace = false;
          if (timeCand !== timeExist) {
            replace = timeCand < timeExist; // earliest timestamp wins
          } else {
            replace = (entry.id || '') < (existing.id || ''); // deterministic tie-breaker
          }
          if (replace) {
            if (existing.id) duplicateWeeklyReviewEntryIds.add(existing.id);
            weeklyReviewBest.set(weekKey, entry);
          } else {
            if (entry.id) duplicateWeeklyReviewEntryIds.add(entry.id);
          }
        }
      }
    }
  }

  const allDuplicatePointIds = new Set<string>([
    ...duplicateHabitEntryIds,
    ...duplicateWeeklyReviewEntryIds,
  ]);

  const dedupedHistoryFull = allDuplicatePointIds.size > 0
    ? mergedHistoryFull.filter((e) => e && e.id && !allDuplicatePointIds.has(e.id))
    : mergedHistoryFull;

  const postPointsDeletedEntityIds = allDuplicatePointIds.size > 0
    ? Array.from(new Set([...postHabitDeletedEntityIds, ...allDuplicatePointIds])).slice(-500)
    : postHabitDeletedEntityIds;

  const mergedEvictedExcisionRecords = mergeEntityArrays(
    baseState.evictedExcisionRecords || [],
    incomingState.evictedExcisionRecords || [],
    tombstoneSet
  )
    .filter((r) => r && r.seasonNumber === maxSeason)
    .slice(-500);

  const evictedExcisionIdSet = new Set(
    mergedEvictedExcisionRecords.map((r) => r && r.id).filter(Boolean)
  );

  const finalHistory = dedupedHistoryFull.slice(0, 500);
  const droppedHistory = dedupedHistoryFull.slice(500);
  const newEvictedFromMerge: EvictedEntryRecord[] = [];

  if (droppedHistory.length > 0) {
    const activeSeasonStart = getSeasonStart(leagueNow());
    let additionalEvictedPos = 0;
    let additionalEvictedNeg = 0;

    for (const dropEntry of droppedHistory) {
      if (!dropEntry) continue;
      const amt = dropEntry.amount || 0;
      if (amt === 0) continue;

      const dropTime = dropEntry.timestamp ? new Date(dropEntry.timestamp) : new Date(0);
      if (dropTime >= activeSeasonStart) {
        const dropId = dropEntry.id;
        const alreadyRecorded = Boolean(
          dropId &&
            (evictedExcisionIdSet.has(dropId) ||
              evictedExcisionIdSet.has(`ex_${maxSeason}_${dropId}`) ||
              evictedEntryIdSet.has(dropId))
        );
        if (!alreadyRecorded) {
          if (amt > 0) {
            additionalEvictedPos += amt;
          } else {
            additionalEvictedNeg += Math.abs(amt);
          }
          if (dropId) {
            newEvictedFromMerge.push({ id: dropId, seasonNumber: maxSeason, amount: amt });
            evictedEntryIdSet.add(dropId);
          }
        }
      }
    }

    mergedSeasonPos += additionalEvictedPos;
    mergedSeasonNeg += additionalEvictedNeg;
  }

  const finalEvictedEntryIds = [...mergedEvictedEntryIds, ...newEvictedFromMerge].slice(-1000);

  const computedSeasonPoints = calculateSeasonalTotal(
    mergedSeasonPos,
    mergedSeasonNeg,
    finalHistory,
    getSeasonStart(leagueNow()),
    mergedEvictedExcisionRecords,
    maxSeason
  );

  // Clamped to currentSeason — a corrupted/future seasonId from any device must never advance the account beyond the real season. Fixes the wrong-clock vulnerability identified in Phase 4 Mode A (2026-09-20).
  const seasonId = Math.min(maxSeason, currentSeason);
  const seasonPoints = computedSeasonPoints;
  const seasonEvictedPos = mergedSeasonPos;
  const seasonEvictedNeg = mergedSeasonNeg;
  const totalPoints = computedSeasonPoints;
  const pointsHistory = finalHistory;
  const evictedExcisionRecords = mergedEvictedExcisionRecords;
  const evictedEntryIds = finalEvictedEntryIds;

  // 5. Workouts
  const workouts = mergeEntityArrays(
    baseState.workouts || [],
    incomingState.workouts || [],
    tombstoneSet
  );

  // 6. Books & Reading Logs
  const readingLogs = mergeEntityArrays(
    baseState.readingLogs || [],
    incomingState.readingLogs || [],
    tombstoneSet
  );

  // 7. Skills & Skill Logs
  const skills = mergeEntityArrays(
    baseState.skills || [],
    incomingState.skills || [],
    tombstoneSet
  );

  const skillLogs = mergeEntityArrays(
    baseState.skillLogs || [],
    incomingState.skillLogs || [],
    tombstoneSet
  );

  // 8. Bad Habits & Bad Habit Logs
  const badHabits = mergeEntityArrays(
    baseState.badHabits || [],
    incomingState.badHabits || [],
    tombstoneSet
  );

  const badHabitLogs = mergeBadHabitLogs(
    baseState.badHabitLogs || [],
    incomingState.badHabitLogs || [],
    tombstoneSet
  );

  // 9. Cravings, Focus, Decision, Emotion
  const cravingLogs = mergeEntityArrays(
    baseState.cravingLogs || [],
    incomingState.cravingLogs || [],
    tombstoneSet
  );

  const focusLogs = mergeEntityArrays(
    baseState.focusLogs || [],
    incomingState.focusLogs || [],
    tombstoneSet
  );

  const decisionLogs = mergeEntityArrays(
    baseState.decisionLogs || [],
    incomingState.decisionLogs || [],
    tombstoneSet
  );

  const emotionLogs = mergeEntityArrays(
    baseState.emotionLogs || [],
    incomingState.emotionLogs || [],
    tombstoneSet
  );

  // 10. Weekly Goals
  const weeklyGoals = mergeWeeklyGoals(
    baseState.weeklyGoals || [],
    incomingState.weeklyGoals || [],
    tombstoneSet
  );

  // 11. Goals, Projects, Tasks
  const goals = mergeEntityArrays(
    baseState.goals || [],
    incomingState.goals || [],
    tombstoneSet
  );

  const projects = mergeEntityArrays(
    baseState.projects || [],
    incomingState.projects || [],
    tombstoneSet
  );

  const tasks = mergeEntityArrays(
    baseState.tasks || [],
    incomingState.tasks || [],
    tombstoneSet,
    (baseT: Task, incT: Task) => {
      const subtaskMap = new Map<string, TaskSubtask>();
      for (const st of baseT.subtasks || []) {
        if (st.id && !tombstoneSet.has(st.id)) subtaskMap.set(st.id, st);
      }
      for (const st of incT.subtasks || []) {
        if (st.id && !tombstoneSet.has(st.id)) subtaskMap.set(st.id, st);
      }
      const baseTime = baseT.createdAt || '';
      const incTime = incT.createdAt || '';
      const primary = incTime >= baseTime ? incT : baseT;
      return {
        ...primary,
        subtasks: Array.from(subtaskMap.values()),
      };
    }
  );

  // 12. Library Books
  const baseLib = [...(baseState.libraryBooks || [])];
  const incomingLib = [...(incomingState.libraryBooks || [])];

  // Convert any legacy books from base/incoming if not already in libraryBooks
  const absorbLegacyBook = (targetArray: UserBook[], legacyBook: any) => {
    if (!legacyBook || !legacyBook.id) return;
    const exists = targetArray.some((lb) => lb.id === legacyBook.id || lb.linkedBookId === legacyBook.id || lb.title?.toLowerCase() === legacyBook.title?.toLowerCase());
    if (!exists) {
      targetArray.push({
        id: legacyBook.id,
        title: legacyBook.title || 'Untitled Book',
        author: legacyBook.author || 'Unknown Author',
        isCurated: false,
        isCustom: true,
        pointsReward: 0,
        pointsAwarded: 0,
        status: (legacyBook.isFinished ? 'completed' : 'reading') as UserBookStatus,
        totalAmount: legacyBook.totalPages || 200,
        totalPages: legacyBook.totalPages || 200,
        currentAmount: legacyBook.currentPage || 0,
        currentPage: legacyBook.currentPage || 0,
        unit: legacyBook.unit || 'pages',
        targetFinishDate: legacyBook.targetFinishDate,
        addedAt: legacyBook.createdAt || new Date().toISOString(),
        dateCompleted: legacyBook.finishedAt,
        completedAt: legacyBook.finishedAt,
        reflection: legacyBook.reflection,
      });
    }
  };

  (baseState.books || []).forEach((b) => absorbLegacyBook(baseLib, b));
  (incomingState.books || []).forEach((b) => absorbLegacyBook(incomingLib, b));

  const libraryBooks = mergeEntityArrays(
    baseLib,
    incomingLib,
    tombstoneSet,
    (baseB: UserBook, incB: UserBook) => {
      const baseUpdated = baseB.updatedAt;
      const incUpdated = incB.updatedAt;

      let primary: UserBook;
      let secondary: UserBook;
      let resolvedCurrentAmount: number;
      let resolvedStatus: UserBookStatus;

      if (baseUpdated && incUpdated) {
        primary = incUpdated >= baseUpdated ? incB : baseB;
        secondary = incUpdated >= baseUpdated ? baseB : incB;
        resolvedCurrentAmount = primary.currentAmount ?? primary.currentPage ?? 0;
        resolvedStatus = primary.status;
      } else if (incUpdated && !baseUpdated) {
        primary = incB;
        secondary = baseB;
        resolvedCurrentAmount = incB.currentAmount ?? incB.currentPage ?? 0;
        resolvedStatus = incB.status;
      } else if (baseUpdated && !incUpdated) {
        primary = baseB;
        secondary = incB;
        resolvedCurrentAmount = baseB.currentAmount ?? baseB.currentPage ?? 0;
        resolvedStatus = baseB.status;
      } else {
        // Fallback for legacy records that both predate updatedAt tracking:
        const baseTime = baseB.addedAt || '';
        const incTime = incB.addedAt || '';
        primary = incTime >= baseTime ? incB : baseB;
        secondary = incTime >= baseTime ? baseB : incB;
        resolvedCurrentAmount = Math.max(
          baseB.currentAmount ?? baseB.currentPage ?? 0,
          incB.currentAmount ?? incB.currentPage ?? 0
        );
        resolvedStatus = (primary.status === 'completed' || secondary.status === 'completed')
          ? 'completed'
          : (primary.status === 'reading' || secondary.status === 'reading')
          ? 'reading'
          : (primary.status as UserBookStatus);
      }

      return {
        ...secondary,
        ...primary,
        status: resolvedStatus,
        currentAmount: resolvedCurrentAmount,
        currentPage: resolvedCurrentAmount,
        updatedAt: primary.updatedAt,
        totalAmount: incB.totalAmount ?? baseB.totalAmount ?? incB.totalPages ?? baseB.totalPages,
        targetFinishDate: incB.targetFinishDate ?? baseB.targetFinishDate,
        dateStarted: incB.dateStarted ?? baseB.dateStarted ?? incB.startedAt ?? baseB.startedAt,
        dateCompleted: incB.dateCompleted ?? baseB.dateCompleted ?? incB.completedAt ?? baseB.completedAt,
        reflection: incB.reflection ?? baseB.reflection,
      };
    }
  );

  // 13. Social Plans & Follows
  const improvementPlans = mergeEntityArrays(
    baseState.improvementPlans || [],
    incomingState.improvementPlans || [],
    tombstoneSet,
    (baseP: ImprovementPlan, incP: ImprovementPlan) => {
      const baseStatus = baseP.syncStatus || 'synced';
      const incStatus = incP.syncStatus || 'synced';

      let primary: ImprovementPlan;
      // Precedence: 'synced' always wins over 'pending' or 'failed'
      if (incStatus === 'synced' && baseStatus !== 'synced') {
        primary = incP;
      } else if (baseStatus === 'synced' && incStatus !== 'synced') {
        primary = baseP;
      } else {
        // Both are 'synced' or both are unconfirmed ('pending'/'failed'): fall back to timestamp
        const baseTime = baseP.createdAt || '';
        const incTime = incP.createdAt || '';
        primary = incTime >= baseTime ? incP : baseP;
      }

      const notes = (primary.reflectionNotes || []).filter((n) => !n.id || !tombstoneSet.has(n.id));
      return {
        ...primary,
        reflectionNotes: notes,
      };
    }
  );

  const followedPlans = mergeEntityArrays(
    baseState.followedPlans || [],
    incomingState.followedPlans || [],
    tombstoneSet,
    (baseF: UserPlanFollow, incF: UserPlanFollow) => {
      const baseTime = baseF.createdAt || '';
      const incTime = incF.createdAt || '';
      const primary = incTime >= baseTime ? incF : baseF;
      const notes = (primary.reflectionNotes || []).filter((n) => !n.id || !tombstoneSet.has(n.id));
      return {
        ...primary,
        reflectionNotes: notes,
      };
    }
  );

  // 14. Partner invites, partnerships, challenges, notifications
  const partnerInvites = mergeEntityArrays(
    baseState.partnerInvites || [],
    incomingState.partnerInvites || [],
    tombstoneSet
  );

  const rawPartnerships = mergeEntityArrays(
    baseState.partnerships || [],
    incomingState.partnerships || [],
    tombstoneSet
  );

  // Deduplicate partnerships by canonical user pair & username pair
  const partnerPairMap = new Map<string, Partnership>();
  for (const p of rawPartnerships) {
    if (!p || (p.id && tombstoneSet.has(p.id))) continue;
    const u1 = (p.user1Username || '').toLowerCase();
    const u2 = (p.user2Username || '').toLowerCase();
    const usernamePairKey = [u1, u2].sort().join(':::');

    const id1 = p.user1Id || '';
    const id2 = p.user2Id || '';
    const idPairKey = id1 && id2 ? [id1, id2].sort().join(':::') : usernamePairKey;

    const key = idPairKey || usernamePairKey || p.id;
    const existing = partnerPairMap.get(key);
    if (!existing) {
      partnerPairMap.set(key, p);
    } else {
      const existingTime = existing.pairedAt ? new Date(existing.pairedAt).getTime() : 0;
      const incomingTime = p.pairedAt ? new Date(p.pairedAt).getTime() : 0;
      if (incomingTime >= existingTime) {
        partnerPairMap.set(key, p);
      }
    }
  }
  const partnerships = Array.from(partnerPairMap.values());

  const rawSharedChallenges = mergeEntityArrays(
    baseState.sharedChallenges || [],
    incomingState.sharedChallenges || [],
    tombstoneSet,
    (baseC: SharedChallenge, incC: SharedChallenge) => mergeSharedChallenge(baseC, incC)
  );

  // Deduplicate active challenges by (partnershipId + normalized title)
  const challengeMap = new Map<string, SharedChallenge>();
  for (const c of rawSharedChallenges) {
    if (!c || (c.id && tombstoneSet.has(c.id))) continue;
    const normTitle = (c.title || '').trim().toLowerCase();
    const isSpecialActive = c.status === 'active';
    const activeKey = isSpecialActive ? `ACTIVE:::${c.partnershipId}:::${normTitle}` : c.id;

    const existing = challengeMap.get(activeKey);
    if (!existing) {
      challengeMap.set(activeKey, c);
    } else {
      challengeMap.set(activeKey, mergeSharedChallenge(existing, c));
    }
  }
  const sharedChallenges = Array.from(challengeMap.values());

  // Merge notifications with both ID and payload.dedupKey deduplication
  const notifMap = new Map<string, AppNotification>();
  const dedupKeyMap = new Map<string, string>(); // dedupKey -> id

  const allNotifs = [...(baseState.notifications || []), ...(incomingState.notifications || [])];
  for (const n of allNotifs) {
    if (!n || !n.id || tombstoneSet.has(n.id)) continue;
    const dedupKey = n.payload?.dedupKey as string | undefined;

    if (dedupKey && dedupKeyMap.has(dedupKey)) {
      const existingId = dedupKeyMap.get(dedupKey)!;
      const existing = notifMap.get(existingId);
      if (existing) {
        // Keep the more recent one or preserve read state if one is read
        const isRead = existing.read || n.read;
        const newer = (n.createdAt || '') >= (existing.createdAt || '') ? n : existing;
        notifMap.set(existingId, { ...newer, id: existingId, read: isRead });
      }
      continue;
    }

    const existing = notifMap.get(n.id);
    if (!existing) {
      notifMap.set(n.id, n);
      if (dedupKey) dedupKeyMap.set(dedupKey, n.id);
    } else {
      const existingTime = existing.createdAt || '';
      const incomingTime = n.createdAt || '';
      const isRead = existing.read || n.read;
      if (incomingTime >= existingTime) {
        notifMap.set(n.id, { ...existing, ...n, read: isRead });
      } else {
        notifMap.set(n.id, { ...n, ...existing, read: isRead });
      }
    }
  }

  // Apply 30-day TTL + 50-item cap pruning
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const notifications = Array.from(notifMap.values())
    .filter((n) => !n.createdAt || n.createdAt >= thirtyDaysAgoIso)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 50);

  // 15. Leagues, Lessons, Trackers
  const leagueArchives = mergeLeagueArchives(
    baseState.leagueArchives || [],
    incomingState.leagueArchives || []
  );

  const readLessonIds = Array.from(
    new Set([...(baseState.readLessonIds || []), ...(incomingState.readLessonIds || [])])
  );

  // 16. Time Tracker
  const baseTT = baseState.timeTracker || DEFAULT_TIME_TRACKER_STATE;
  const incTT = incomingState.timeTracker || DEFAULT_TIME_TRACKER_STATE;

  const mergedActivities = ensureDefaultActivities(
    mergeEntityArrays(baseTT.activities || [], incTT.activities || [], tombstoneSet)
  );

  const mergedTemplates = mergeEntityArrays(
    baseTT.templates || [],
    incTT.templates || [],
    tombstoneSet
  );

  const dailyLogsMap: Record<string, TimeTrackerBlock[]> = {};
  const allDateKeys = new Set([
    ...Object.keys(baseTT.dailyLogs || {}),
    ...Object.keys(incTT.dailyLogs || {}),
  ]);

  for (const dateKey of allDateKeys) {
    const baseBlocks = baseTT.dailyLogs?.[dateKey] || [];
    const incBlocks = incTT.dailyLogs?.[dateKey] || [];
    const mergedBlocks = mergeEntityArrays(baseBlocks, incBlocks, tombstoneSet);
    dailyLogsMap[dateKey] = mergedBlocks;
  }

  const mergedClearedDates = Array.from(
    new Set([
      ...(baseTT.clearedDates || []),
      ...(incTT.clearedDates || []),
    ])
  );

  const mergedTimeTracker: TimeTrackerState = {
    activities: mergedActivities,
    templates: mergedTemplates,
    dailyLogs: dailyLogsMap,
    clearedDates: mergedClearedDates,
  };

  const isIncomingGuest = incomingState.currentUser?.isAnonymous || (incomingState.currentUser as any)?.is_anonymous;
  const isBasePermanent = baseState.currentUser && !baseState.currentUser.isAnonymous && !(baseState.currentUser as any)?.is_anonymous;
  
  // Parse lastUsernameChangeAt timestamps to guarantee the most recent update takes precedence
  const baseTimeStr = baseState.currentUser?.lastUsernameChangeAt || (baseState.currentUser as any)?.last_username_change_at;
  const incomingTimeStr = incomingState.currentUser?.lastUsernameChangeAt || (incomingState.currentUser as any)?.last_username_change_at;
  const baseChangeTs = baseTimeStr ? new Date(baseTimeStr).getTime() : 0;
  const incomingChangeTs = incomingTimeStr ? new Date(incomingTimeStr).getTime() : 0;

  let currentUser = incomingState.currentUser || baseState.currentUser || null;
  if (isIncomingGuest && isBasePermanent) {
      currentUser = baseState.currentUser; // Upgraded permanent server identity wins
  } else if (baseState.currentUser && incomingState.currentUser) {
      if (incomingChangeTs > baseChangeTs) {
          // Incoming user has a more recent username update
          currentUser = {
              ...baseState.currentUser,
              ...incomingState.currentUser,
              username: incomingState.currentUser.username || baseState.currentUser.username,
              lastUsernameChangeAt: incomingState.currentUser.lastUsernameChangeAt || baseState.currentUser.lastUsernameChangeAt,
          };
      } else if (baseChangeTs > incomingChangeTs) {
          // Base user has a more recent username update (e.g. fresh database fetch)
          currentUser = {
              ...incomingState.currentUser,
              ...baseState.currentUser,
              username: baseState.currentUser.username || incomingState.currentUser.username,
              lastUsernameChangeAt: baseState.currentUser.lastUsernameChangeAt || incomingState.currentUser.lastUsernameChangeAt,
          };
      } else {
          // baseChangeTs === incomingChangeTs (exact tie or both 0/missing)
          if (
            baseChangeTs > 0 &&
            incomingChangeTs > 0 &&
            baseState.currentUser?.username !== incomingState.currentUser?.username
          ) {
            console.warn(
              `[stateMerger] Timestamp collision on lastUsernameChangeAt (${baseChangeTs}). Resolving tie using mergeContext: '${mergeContext}'`
            );
          }

          if (mergeContext === 'writeSync') {
            // writeSync: incoming represents the active user's local write intent; base is existing server JSON
            currentUser = {
              ...baseState.currentUser,
              ...incomingState.currentUser,
              username: incomingState.currentUser.username || baseState.currentUser.username,
              lastUsernameChangeAt: incomingState.currentUser.lastUsernameChangeAt || baseState.currentUser.lastUsernameChangeAt,
            };
          } else {
            // hydration: base represents the authoritative freshly fetched server state; incoming is in-memory state
            currentUser = {
              ...incomingState.currentUser,
              ...baseState.currentUser,
              username: baseState.currentUser.username || incomingState.currentUser.username,
              lastUsernameChangeAt: baseState.currentUser.lastUsernameChangeAt || incomingState.currentUser.lastUsernameChangeAt,
            };
          }
      }
  }
  
  const resolvedUsername = currentUser?.username;
  let username = resolvedUsername;
  if (!username) {
      if (incomingChangeTs > baseChangeTs) {
          username = incomingState.username || baseState.username || 'Guest User';
      } else if (baseChangeTs > incomingChangeTs) {
          username = baseState.username || incomingState.username || 'Guest User';
      } else {
          if (mergeContext === 'writeSync') {
            username = incomingState.username || baseState.username || 'Guest User';
          } else {
            username = baseState.username || incomingState.username || 'Guest User';
          }
      }
  }

  let addictionTracker = incomingState.addictionTracker !== undefined
    ? incomingState.addictionTracker
    : baseState.addictionTracker;

  if (baseState.addictionTracker && incomingState.addictionTracker && baseState.addictionTracker.id === incomingState.addictionTracker.id) {
    const baseAwards = baseState.addictionTracker.awardedMilestones || [];
    const incAwards = incomingState.addictionTracker.awardedMilestones || [];
    const awardsMap = new Map<string, any>();
    for (const a of [...baseAwards, ...incAwards]) {
      if (a && a.milestone && !awardsMap.has(a.milestone)) {
        awardsMap.set(a.milestone, a);
      }
    }
    if (addictionTracker) {
      addictionTracker = {
        ...addictionTracker,
        awardedMilestones: Array.from(awardsMap.values()),
      };
    }
  }

  return {
    ...DEFAULT_STATE,
    ...baseState,
    ...incomingState,
    currentUser,
    username,
    seasonId,
    seasonPoints,
    seasonEvictedPos,
    seasonEvictedNeg,
    evictedExcisionRecords,
    evictedEntryIds,
    totalPoints,
    pointsHistory,
    habits,
    journalEntries,
    workouts,
    exerciseGoal: incomingState.exerciseGoal !== undefined ? incomingState.exerciseGoal : baseState.exerciseGoal,
    books: [],
    readingLogs,
    skills,
    skillLogs,
    badHabits,
    badHabitLogs,
    addictionTracker,
    cravingLogs,
    focusLogs,
    decisionLogs,
    emotionLogs,
    weeklyGoals,
    goals,
    projects,
    tasks,
    libraryBooks,
    improvementPlans,
    followedPlans,
    partnerInvites,
    partnership: incomingState.partnership !== undefined ? incomingState.partnership : baseState.partnership,
    partnerships,
    sharedChallenges,
    notifications,
    leagueArchives,
    readLessonIds,
    deletedEntityIds: postPointsDeletedEntityIds,
    restoredEntityIds: mergedRestoredEntityIds,
    unsyncedEntityIds: Array.from(new Set([...(baseState.unsyncedEntityIds || []), ...(incomingState.unsyncedEntityIds || [])])).slice(-500),
    timeTracker: mergedTimeTracker,
    themePreference: incomingState.themePreference || baseState.themePreference || 'dark',
  };
}

export function mergeAppState(
  baseState: AppState,
  incomingState: AppState,
  mergeContext: MergeContext = 'hydration'
): AppState {
  return mergeAppStateInternal(baseState, incomingState, mergeContext);
}

export interface MergeGuardResult {
  mergedState: AppState;
  retainedState: AppState;
  hasSuspiciousDrop: boolean;
  watermarkCount: number;
  droppedCount: number;
  mergedCount: number;
}

export function mergeAppStateWithGuardResult(
  baseState: AppState,
  incomingState: AppState,
  watermark: UserDataWeight | undefined,
  isHydrated: boolean = true
): MergeGuardResult {
  // Pass 1: standard hydration merge
  const mergedState = mergeAppStateInternal(baseState, incomingState, 'hydration');

  const mergedWeight = computeStateDataWeight(mergedState);
  const mergedCount = mergedWeight.itemCount;
  const watermarkCount = watermark?.itemCount ?? 0;
  const droppedCount = Math.max(0, watermarkCount - mergedCount);

  let hasSuspiciousDrop = false;

  // Guard check: strictly matching supabase.ts Check 2A logic
  if (watermark && watermark.itemCount > 0) {
    const isFloorExempt = watermark.itemCount <= 3 && isHydrated;

    if (!isFloorExempt) {
      // Zero-out wipe: incoming merged is empty (0 items)
      if (mergedCount === 0) {
        hasSuspiciousDrop = true;
      }
      // Abnormal massive drop (>70% vanished at once on accounts with >= 3 items)
      else if (watermark.itemCount >= 3 && mergedCount < Math.ceil(watermark.itemCount * 0.3)) {
        hasSuspiciousDrop = true;
      }
    }
  }

  // Pass 2: only if suspicious drop detected, compute retainedState bypassing tombstones
  const retainedState = hasSuspiciousDrop
    ? mergeAppStateInternal(baseState, incomingState, 'hydration', { tombstoneSetOverride: new Set<string>() })
    : mergedState;

  return {
    mergedState,
    retainedState,
    hasSuspiciousDrop,
    watermarkCount,
    droppedCount,
    mergedCount,
  };
}