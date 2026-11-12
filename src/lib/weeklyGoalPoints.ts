// Weekly goals: points for each week (season splits, held goals), reflection points, linked-goal
// progress, and removing goals linked to deleted items. Pure: state in, state out (moved from store.ts).
import type { WeeklyGoal, WeeklyGoalItem, PointsEntry, AppState, WeeklyGoalReflection } from '@/types';
import { weekKey, todayKey, getWeekDates, addDays, parseDate } from './dates';
import { excisePointsEntriesInternal } from './stateAwards';
import { addPointsInternal } from './pointsLedger';
import { getWeeklyGoalEntryId, getWeeklyGoalSeasonSplitEntryId, getSeasonBoundaryInWeek, isWeeklyGoalSeasonSplitEntryId, isWeekBeforeSeason } from './weeklyGoalSeasons';
import { weeklyScoringGoals, heldCountedGoals, legacyHeldWeeklyPoints, weeklyGoalAwardTimestamp, countedGoalRefs, reflectionWindow, isReflectionWindowOpen } from './weeklyAwards';
import { calculateWeeklyGoalsPoints, calculateWeeklyGoalsPointsBefore, POINTS_V2_START_DATE_KEY, WEEKLY_REFLECTION_POINTS } from './pointsConfig';
import { leagueNow, getSeasonStart } from './leagueTime';
import { computeLinkedGoalProgress, linkedGoalCrossing, linkedEntryPresent } from './linkedGoalMetrics';
import { trustedNow } from './clock';

/**
 * A week doc after this app changed it: it lists the goals deleted from it (removed ids added),
 * so a merge with an older copy can't bring them back. A doc with the list is merged goal by goal
 * on the server (20261019200000_weekly_goals_merge_per_goal.sql); one without it (an older app)
 * keeps last-writer-wins.
 */
export function withDeletedGoalIds(doc: WeeklyGoal, removedIds: string[] = []): WeeklyGoal {
  return { ...doc, deletedGoalIds: Array.from(new Set([...(doc.deletedGoalIds || []), ...removedIds])) };
}

/**
 * Removes the current and future weeks' goals linked to deleted habits, books or skills (past
 * weeks keep theirs). The removed goal ids go to the tombstones (`removedGoalIds`) and to each
 * week's deletedGoalIds, so a sync or merge can't bring them back.
 */
export function removeLinkedWeeklyGoals(
  weeklyGoals: WeeklyGoal[],
  linkedModule: 'habit' | 'skill' | 'reading',
  itemIds: (string | undefined)[],
  currentWeekKey: string
): { weeklyGoals: WeeklyGoal[]; removedGoalIds: string[] } {
  const validIds = new Set(itemIds.filter((id): id is string => Boolean(id)));
  if (validIds.size === 0) return { weeklyGoals, removedGoalIds: [] };
  return removeWeeklyGoalsWhere(
    weeklyGoals,
    (g) => g.linkedModule === linkedModule && Boolean(g.linkedItemId) && validIds.has(g.linkedItemId!),
    currentWeekKey
  );
}

/** Removes the current and future weeks' goals that match (past weeks keep theirs), with tombstones as above. */
export function removeWeeklyGoalsWhere(
  weeklyGoals: WeeklyGoal[],
  isLinked: (g: WeeklyGoalItem) => boolean,
  currentWeekKey: string
): { weeklyGoals: WeeklyGoal[]; removedGoalIds: string[] } {
  const removedGoalIds: string[] = [];
  const updated = weeklyGoals.map((w) => {
    if (w.weekKey < currentWeekKey) return w;
    const removed = w.goals.filter(isLinked).map((g) => g.id);
    if (removed.length === 0) return w;
    removedGoalIds.push(...removed);
    return withDeletedGoalIds({ ...w, goals: w.goals.filter((g) => !isLinked(g)) }, removed);
  });
  return { weeklyGoals: removedGoalIds.length > 0 ? updated : weeklyGoals, removedGoalIds };
}

export function extractWeekKeyFromWeeklyGoalEntry(entry: PointsEntry | null | undefined): string | null {
  if (!entry) return null;
  const isWeeklyGoalEntry =
    entry.source === 'weekly_goal_achieved' ||
    (typeof entry.id === 'string' && entry.id.startsWith('weekly_goal_'));
  if (!isWeeklyGoalEntry) return null;

  if (entry.metadata && typeof entry.metadata.weekKey === 'string' && entry.metadata.weekKey) {
    return entry.metadata.weekKey;
  }
  if (typeof entry.id === 'string') {
    const match = entry.id.match(/\b\d{4}-W\d{2}\b/);
    if (match) return match[0];
  }
  if (entry.reason) {
    const match = entry.reason.match(/\b\d{4}-W\d{2}\b/);
    if (match) return match[0];
  }
  return null;
}

export function groupWeeklyGoalEntriesByWeekKey(
  history: PointsEntry[]
): {
  weeklyGoalsMap: Map<string, PointsEntry[]>;
  otherHistory: PointsEntry[];
} {
  const weeklyGoalsMap = new Map<string, PointsEntry[]>();
  const otherHistory: PointsEntry[] = [];

  for (const entry of history) {
    if (!entry) continue;
    const weekKey = extractWeekKeyFromWeeklyGoalEntry(entry);
    if (weekKey) {
      const group = weeklyGoalsMap.get(weekKey) || [];
      group.push(entry);
      weeklyGoalsMap.set(weekKey, group);
    } else {
      otherHistory.push(entry);
    }
  }

  return { weeklyGoalsMap, otherHistory };
}

const localDayStartMs = (day: string): number => new Date(`${day}T00:00:00`).getTime();

/** The week's reflection award row is live and was earned on today's local day. */
export function weeklyReflectionAwardedToday(state: AppState, weekKey: string): boolean {
  const award = (state.pointsHistory || []).find((e) => e && e.id === `weekly_review_${weekKey}`);
  if (!award) return false;
  const at = new Date(award.timestamp).getTime();
  return Number.isFinite(at) && at >= localDayStartMs(todayKey());
}

export function getWeeklyReflectionNetPoints(state: AppState, weekKey: string): number {
  const awardId = `weekly_review_${weekKey}`;
  const revId = `weekly_review_rev_${weekKey}`;

  let total = 0;
  for (const e of state.pointsHistory || []) {
    if (e && (e.id === awardId || e.id === revId)) {
      total += e.amount || 0;
    }
  }

  return total;
}

/**
 * A week's goal row written before metadata.counted existed keeps what it held before today: the
 * same row with only its amount lowered to `amount` (ascend_recompute_weekly_goal_awards).
 */
function withWeeklyEntryAmount(baseState: AppState, entry: PointsEntry, amount: number): Partial<AppState> {
  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(baseState, (e) => e?.id === entry.id);
  return addPointsInternal({ ...baseState, ...excised }, amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id);
}

/**
 * Weekly Goals points for a week the active season started in.
 * The earlier season's entry (`weekly_goal_<weekKey>`) is frozen with that season; this season
 * gets only what the week earns beyond it, in its own entry, so the weekly cap still holds.
 */
function recomputeSeasonSplitWeeklyGoalsPoints(
  baseState: AppState,
  targetWeekKey: string,
  newGoals: WeeklyGoalItem[],
  seasonStart: Date,
  seasonNumber: number,
  triggerGoalId?: string
): Partial<AppState> {
  const currentHistory = baseState.pointsHistory || [];
  const earlierEntry = currentHistory.find((e) => e && e.id === getWeeklyGoalEntryId(targetWeekKey));
  const entryId = getWeeklyGoalSeasonSplitEntryId(targetWeekKey, seasonNumber);
  const existing = currentHistory.find((e) => e && e.id === entryId);

  // Goals counted on an earlier day stay counted (an earlier day's points never drop).
  const todayStartMs = localDayStartMs(todayKey());
  const scoringGoals = weeklyScoringGoals(newGoals, heldCountedGoals(existing, todayStartMs));
  const score = calculateWeeklyGoalsPoints(scoringGoals);
  const earlierSeasonPoints = earlierEntry
    ? earlierEntry.amount || 0
    : calculateWeeklyGoalsPointsBefore(scoringGoals, seasonStart);
  const newPoints = Math.max(0, score.pointsAwarded - earlierSeasonPoints);

  const legacyHold = legacyHeldWeeklyPoints(existing, todayStartMs);
  if (existing && legacyHold > newPoints) {
    return legacyHold < existing.amount ? withWeeklyEntryAmount(baseState, existing, legacyHold) : {};
  }

  const timestamp = weeklyGoalAwardTimestamp(scoringGoals, seasonStart, leagueNow());
  if (existing ? existing.amount === newPoints && existing.timestamp === timestamp : newPoints === 0) {
    return {};
  }

  if (newPoints === 0) {
    const exciseResult = excisePointsEntriesInternal(baseState, (e) => e?.id === entryId);
    return {
      ...exciseResult,
      deletedEntityIds: Array.from(new Set([...(baseState.deletedEntityIds || []), entryId])).slice(-500),
      restoredEntityIds: (baseState.restoredEntityIds || []).filter((id) => id !== entryId),
    };
  }

  const pointsUpdate = addPointsInternal(
    baseState,
    newPoints,
    `Weekly goals achieved for ${targetWeekKey}, Season ${seasonNumber} (${newPoints} pts)`,
    'weekly_goal_achieved',
    {
      weekKey: targetWeekKey,
      seasonNumber,
      ...(triggerGoalId ? { goalId: triggerGoalId } : {}),
      countedGoalsCount: score.countedGoalsCount,
      completedGoalsCount: score.completedGoalsCount,
      counted: countedGoalRefs(scoringGoals),
    },
    timestamp,
    entryId
  );

  return {
    ...pointsUpdate,
    deletedEntityIds: (baseState.deletedEntityIds || []).filter((id) => id !== entryId).slice(-500),
    restoredEntityIds: Array.from(new Set([...(baseState.restoredEntityIds || []), entryId])).slice(-500),
  };
}

export const recomputeWeeklyGoalsPointsForState = (
  baseState: AppState,
  targetWeekKey: string,
  newGoals: WeeklyGoalItem[],
  triggerGoalId?: string
): Partial<AppState> => {
  const seasonBoundary = getSeasonBoundaryInWeek(targetWeekKey);
  if (seasonBoundary && leagueNow().getTime() >= seasonBoundary.boundary.getTime()) {
    return recomputeSeasonSplitWeeklyGoalsPoints(
      baseState,
      targetWeekKey,
      newGoals,
      seasonBoundary.boundary,
      seasonBoundary.seasonNumber,
      triggerGoalId
    );
  }

  const entryId = getWeeklyGoalEntryId(targetWeekKey);
  const isWeekEntry = (e: PointsEntry | null | undefined) =>
    Boolean(e && (e.id === entryId || (!isWeeklyGoalSeasonSplitEntryId(e.id) && extractWeekKeyFromWeeklyGoalEntry(e) === targetWeekKey)));

  const currentHistory = baseState.pointsHistory || [];
  const allWeekEntries = currentHistory.filter(isWeekEntry);

  // Goals counted on an earlier day stay counted (an earlier day's points never drop).
  const existingEntry = currentHistory.find((e) => e && e.id === entryId);
  const todayStartMs = localDayStartMs(todayKey());
  const scoringGoals = weeklyScoringGoals(newGoals, heldCountedGoals(existingEntry, todayStartMs));
  const score = calculateWeeklyGoalsPoints(scoringGoals);
  const newPoints = score.pointsAwarded;
  const canonicalTimestamp = weeklyGoalAwardTimestamp(scoringGoals, getWeekDates(targetWeekKey).start, leagueNow());

  const legacyHold = legacyHeldWeeklyPoints(existingEntry, todayStartMs);
  if (existingEntry && legacyHold > newPoints) {
    return legacyHold < existingEntry.amount ? withWeeklyEntryAmount(baseState, existingEntry, legacyHold) : {};
  }

  // True no-op: exactly one canonical entry already matching current target points and time
  if (
    allWeekEntries.length === 1 &&
    allWeekEntries[0].id === entryId &&
    allWeekEntries[0].amount === newPoints &&
    allWeekEntries[0].timestamp === canonicalTimestamp
  ) {
    return {};
  }
  // No entries exist and new points are 0 -> nothing to add or remove
  if (allWeekEntries.length === 0 && newPoints === 0) {
    return {};
  }

  if (newPoints === 0) {
    const exciseResult = excisePointsEntriesInternal(baseState, isWeekEntry);
    const updatedDeletedEntityIds = Array.from(
      new Set([
        ...(baseState.deletedEntityIds || []),
        entryId,
        ...(exciseResult.excisedEntryIds || []),
      ])
    ).slice(-500);
    const updatedRestoredEntityIds = (baseState.restoredEntityIds || []).filter((id) => id !== entryId);

    return {
      ...exciseResult,
      deletedEntityIds: updatedDeletedEntityIds,
      restoredEntityIds: updatedRestoredEntityIds,
    };
  }

  // When newPoints > 0:
  // If there are legacy transition-based entries, excise them first so only the canonical entry will remain
  const hasLegacyEntries = allWeekEntries.some((e) => e.id !== entryId);
  const stateToUpdate = hasLegacyEntries
    ? {
        ...baseState,
        ...excisePointsEntriesInternal(
          baseState,
          (e) => isWeekEntry(e) && e.id !== entryId
        ),
      }
    : baseState;

  const pointsUpdate = addPointsInternal(
    stateToUpdate,
    newPoints,
    `Weekly goals achieved for ${targetWeekKey} (${newPoints} pts)`,
    'weekly_goal_achieved',
    {
      weekKey: targetWeekKey,
      ...(triggerGoalId ? { goalId: triggerGoalId } : {}),
      countedGoalsCount: score.countedGoalsCount,
      completedGoalsCount: score.completedGoalsCount,
      counted: countedGoalRefs(scoringGoals),
    },
    canonicalTimestamp,
    entryId
  );

  const updatedDeletedEntityIds = (baseState.deletedEntityIds || [])
    .filter((id) => id !== entryId)
    .slice(-500);

  const updatedRestoredEntityIds = Array.from(
    new Set([...(baseState.restoredEntityIds || []), entryId])
  ).slice(-500);

  return {
    ...pointsUpdate,
    deletedEntityIds: updatedDeletedEntityIds,
    restoredEntityIds: updatedRestoredEntityIds,
  };
};

export function reconcileWeeklyGoalsPointsForAllWeeks(
  state: AppState,
  now: Date = trustedNow()
): AppState {
  // Seasons follow league (UTC) time; the weeks below are the user's personal weeks.
  const activeSeasonStart = getSeasonStart(leagueNow());
  const currentWeek = weekKey(now);
  const currentWeekStart = getWeekDates(currentWeek).start;
  const prevWeekDateKey = addDays(todayKey(currentWeekStart), -7);
  const prevWeek = weekKey(parseDate(prevWeekDateKey) ?? undefined);
  let currentState = state;

  for (const doc of currentState.weeklyGoals || []) {
    if (!doc || !doc.weekKey) continue;
    if (doc.weekKey !== currentWeek && doc.weekKey !== prevWeek) {
      continue;
    }
    try {
      if (isWeekBeforeSeason(doc.weekKey, activeSeasonStart)) {
        continue; // Closed-season weeks are frozen
      }
      const { start } = getWeekDates(doc.weekKey);
      const weekStartKey = todayKey(start);
      if (weekStartKey < POINTS_V2_START_DATE_KEY) {
        continue;
      }
    } catch {
      continue;
    }

    const pointsUpdate = recomputeWeeklyGoalsPointsForState(currentState, doc.weekKey, doc.goals || []);
    if (Object.keys(pointsUpdate).length > 0) {
      currentState = {
        ...currentState,
        ...pointsUpdate,
      };
    }
  }

  return currentState;
}

/**
 * Sets the current week's linked goals' achieved flags from their live progress (the server scores
 * the flags). Runs on load, merges, the minute tick, the Weekly Goals page and inside every action
 * that logs, unticks or deletes a counted log, so a log at 23:59 sets its week's flag at once.
 * A flag comes off only when the log that reached the target is on this device or was deleted
 * here (Zakria 2026-10-19): a device that has not pulled another device's log never unticks its
 * goal. Goals ticked before this rule (no completedByLogId) keep the old rule.
 */
export function reconcileLinkedWeeklyGoals(state: AppState, now: Date = trustedNow()): AppState {
  const currentKey = weekKey(now);
  const docIdx = (state.weeklyGoals || []).findIndex((w) => w.weekKey === currentKey);
  if (docIdx === -1) return state;

  const doc = state.weeklyGoals[docIdx];
  const { dateStrings } = getWeekDates(currentKey);
  const tombstones = new Set(state.deletedEntityIds || []);
  const nowIso = now.toISOString();

  let hasChanges = false;
  const updatedGoals = (doc.goals || []).map((goal) => {
    // Only process active linked-module goals
    if (goal.archived || !goal.linkedModule || goal.linkedModule === 'none') {
      return goal;
    }

    const prog = computeLinkedGoalProgress(goal, state, dateStrings);
    if (prog.needsMetricSelection) {
      return goal;
    }

    const isDone = prog.percent >= 100;
    const flagged = Boolean(goal.completed || goal.done);
    if (isDone && !flagged) {
      hasChanges = true;
      const crossing = linkedGoalCrossing(goal, state, dateStrings);
      // Achieved when its logs reached the target, but never before the goal was made or last
      // re-linked/re-targeted (Zakria 2026-10-19), so its points can't land on an earlier day.
      const reachedAt = goal.completedAt || crossing?.at || nowIso;
      return {
        ...goal,
        completed: true,
        done: true,
        completedAt: [reachedAt, goal.createdAt, goal.linkEditedAt].reduce<string>(
          (latest, t) => (t && Date.parse(t) > Date.parse(latest) ? t : latest),
          reachedAt
        ),
        completedByLogId: crossing?.id,
        updatedAt: nowIso,
      };
    } else if (!isDone && flagged) {
      const by = goal.completedByLogId;
      if (by && !linkedEntryPresent(goal, state, by) && !tombstones.has(by)) return goal;
      hasChanges = true;
      return {
        ...goal,
        completed: false,
        done: false,
        completedAt: undefined,
        completedByLogId: undefined,
        updatedAt: nowIso,
      };
    }

    return goal;
  });

  if (!hasChanges) return state;

  const updatedDoc = withDeletedGoalIds({ ...doc, goals: updatedGoals });
  const newWeeklyGoals = [...state.weeklyGoals];
  newWeeklyGoals[docIdx] = updatedDoc;

  const pointsUpdate = recomputeWeeklyGoalsPointsForState(state, currentKey, updatedGoals);

  return {
    ...state,
    weeklyGoals: newWeeklyGoals,
    ...pointsUpdate,
  };
}

export function isWeeklyReflectionAwarded(
  weekKey: string,
  refId: string,
  state: AppState
): boolean {
  const goalDoc = state.weeklyGoals?.find((w) => w.weekKey === weekKey);
  const reflections = goalDoc?.reflections || [];
  if (reflections.length === 0) return false;

  const latestReflection = reflections.reduce(
    (prevMax, curr) =>
      new Date(curr.createdAt).getTime() > new Date(prevMax.createdAt).getTime()
        ? curr
        : prevMax,
    reflections[0]
  );

  if (!latestReflection || latestReflection.id !== refId) {
    return false;
  }

  // Check net awarded points in active state (active ledger + evicted entries)
  const netPoints = getWeeklyReflectionNetPoints(state, weekKey);
  if (netPoints > 0) return true;

  // Past season check: if weekKey belongs to a completed past season
  try {
    const { start } = getWeekDates(weekKey);
    const activeSeasonStart = getSeasonStart(leagueNow());
    if (start < activeSeasonStart) {
      return new Date(latestReflection.createdAt) < reflectionWindow(weekKey).closesAt;
    }
  } catch {
    // If weekKey fails to parse, return false
  }

  return false;
}

export function reconcileReflectionPoints(
  prevState: AppState,
  weekKey: string,
  reflections: WeeklyGoalReflection[],
  now = trustedNow()
): {
  updatedReflections: WeeklyGoalReflection[];
  nextState: AppState;
} {
  const updatedReflections = [...reflections];
  let currentState = prevState;

  // The server rewards a reflection only inside its week's Reflection Window (weeklyAwards.ts).
  if (!isReflectionWindowOpen(weekKey, now)) {
    return {
      updatedReflections,
      nextState: currentState,
    };
  }

  const netPoints = getWeeklyReflectionNetPoints(prevState, weekKey);
  const isWeekAwarded = netPoints > 0;

  let latest: WeeklyGoalReflection | undefined = undefined;
  if (updatedReflections.length > 0) {
    latest = updatedReflections.reduce(
      (prevMax, curr) =>
        new Date(curr.createdAt).getTime() > new Date(prevMax.createdAt).getTime()
          ? curr
          : prevMax,
      updatedReflections[0]
    );
  }

  if (latest && !isWeekAwarded) {
    // Clean up any old reversal entry so that re-awarding gives a clean net +20
    const revId = `weekly_review_rev_${weekKey}`;
    const cleanedHistory = (currentState.pointsHistory || []).filter((e) => e && e.id !== revId);
    if (cleanedHistory.length !== (currentState.pointsHistory || []).length) {
      currentState = {
        ...currentState,
        pointsHistory: cleanedHistory,
      };
    }

    const pointsAward = addPointsInternal(
      currentState,
      WEEKLY_REFLECTION_POINTS.awarded,
      `Weekly reflection completed for ${weekKey}`,
      'weekly_review',
      { weekKey },
      undefined,
      `weekly_review_${weekKey}`
    );
    currentState = { ...currentState, ...pointsAward };
  } else if (!latest && isWeekAwarded && weeklyReflectionAwardedToday(prevState, weekKey)) {
    // Only a reflection award earned today is taken back; one earned on an earlier day stays
    // (ascend_recompute_weekly_reflection_award). Reverse what the week actually holds: an award
    // kept at an older value (20) is undone in full.
    const pointsDeduct = addPointsInternal(
      currentState,
      -netPoints,
      `Weekly reflection deleted for ${weekKey}`,
      'weekly_review',
      { weekKey },
      undefined,
      `weekly_review_rev_${weekKey}`
    );
    currentState = { ...currentState, ...pointsDeduct };
  }

  return {
    updatedReflections,
    nextState: currentState,
  };
}
