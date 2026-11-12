// Normalises a state loaded from storage or the server (sanitizeLoadedState) and the retired-preset
// migration, which authSession also runs. Pure: state in, state out (moved from store.ts).
import { DEFAULT_STATE, DEFAULT_TIME_TRACKER_ACTIVITIES, DEFAULT_TIME_TRACKER_STATE, type AppState, type UserProfile, type PointsEntry, type LeagueArchive, type BadHabitLog, type Book, type UserBook, type UserBookStatus, type WeeklyGoalReflection, type WeeklyGoalItem } from '@/types';
import { removeLinkedWeeklyGoals, groupWeeklyGoalEntriesByWeekKey, reconcileWeeklyGoalsPointsForAllWeeks, reconcileLinkedWeeklyGoals } from './weeklyGoalPoints';
import { withoutRetiredKeys } from './retiredStateKeys';
import { isRetiredAppHabitAward } from './habitAwards';
import { isRetiredAppBadHabitAward } from './badHabitAwards';
import { isRetiredAppWorkoutAward } from './workoutAwards';
import { isRetiredAppSkillAward } from './skillAwards';
import { isRetiredAppReadingAward } from './readingAwards';
import { isRetiredAppJournalAward } from './journalAwards';
import { isRetiredAppFocusAward } from './focusAwards';
import { weekKey, uid, todayKey } from './dates';
import { WEEKLY_REFLECTION_POINTS, calculateWeeklyGoalsPoints } from './pointsConfig';
import { trustedNow, trustedNowMs } from './clock';
import { leagueNow, getSeasonNumber, getSeasonStart } from './leagueTime';
import { isWeekBeforeSeason, getSeasonBoundaryInWeek } from './weeklyGoalSeasons';
import { toArchivedCompetitor, getUserRank, calculateSeasonalTotal } from './leagues';
import { findCuratedBook } from './books';
import { isLegitimateTombstoneId, deduplicatePresetHabits } from './stateMerger';
import { normalizeThemePreference, deviceThemeFields } from './theme';
import { reconcileSharedChallengeLifecycle } from './pactLifecycle';
import { NOTIFICATION_MAX_AGE_DAYS, NOTIFICATION_WINDOW } from './supabase';
import { ensureDefaultActivities, autoHydrateDailyLog } from './timeTracker';

export const RETIRED_PRESET_HABIT_NAMES = new Set<string>([
  'Exercise / workout',
  'Deep work session',
  'Practice a skill',
  'No porn',
  'No social media before bed',
  'No junk food',
  'Journaling',
  // Retired 2026-10-19 (server copies soft-deleted the same day; a device's offline copy still leaves here)
  'No phone for first hour after waking',
  'Digital detox hour',
  'No procrastination (complete top priority task)',
]);

/**
 * Migration: Retires preset habits from user state, tombstones removed IDs and detaches linked
 * weekly goals. Points are not reversed: the first 7 left the server with no completions
 * (20261015120000_server_habit_awards.sql); earlier days' awards always stay. A copy ticked
 * today waits for a later day, because removing it would take back today's award.
 */
export function applyPresetHabitRemovalMigration(state: AppState, currentWeekKey: string, today: string): AppState {
  const habitsToRetire = (state.habits || []).filter(
    (h) =>
      h &&
      h.isPreset === true &&
      RETIRED_PRESET_HABIT_NAMES.has(h.name) &&
      !(Array.isArray(h.completions) ? h.completions.includes(today) : h.completions?.[today]?.done === true)
  );

  if (habitsToRetire.length === 0) {
    return state;
  }

  let runningState = state;

  const retiredHabitIds = habitsToRetire.map((h) => h.id).filter(Boolean);
  const retiredIdSet = new Set(retiredHabitIds);

  const updatedHabits = (runningState.habits || []).filter(
    (h) => !h || !retiredIdSet.has(h.id)
  );
  const linkedRemoval = removeLinkedWeeklyGoals(runningState.weeklyGoals || [], 'habit', retiredHabitIds, currentWeekKey);
  const updatedDeletedEntityIds = Array.from(
    new Set([...(runningState.deletedEntityIds || []), ...retiredHabitIds, ...linkedRemoval.removedGoalIds])
  ).slice(-500);

  runningState = {
    ...runningState,
    habits: updatedHabits,
    weeklyGoals: linkedRemoval.weeklyGoals,
    deletedEntityIds: updatedDeletedEntityIds,
  };

  return runningState;
}

export function sanitizeLoadedState(loaded: Partial<AppState>, profile: UserProfile | null): AppState {
  const st = withoutRetiredKeys(loaded);
  // Weekly Review Points Consolidation Migration (Idempotent)
  const rawHistory = st.pointsHistory ?? [];
  const weeklyReviewMap = new Map<string, PointsEntry[]>();
  const nonReviewHistory: PointsEntry[] = [];

  for (const entry of rawHistory) {
    if (entry && (isRetiredAppHabitAward(entry) || isRetiredAppBadHabitAward(entry) || isRetiredAppWorkoutAward(entry) || isRetiredAppSkillAward(entry) || isRetiredAppReadingAward(entry) || isRetiredAppJournalAward(entry) || isRetiredAppFocusAward(entry))) continue;
    if (entry && entry.source === 'weekly_review') {
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
        const group = weeklyReviewMap.get(weekKey) || [];
        group.push(entry);
        weeklyReviewMap.set(weekKey, group);
      } else {
        nonReviewHistory.push(entry);
      }
    } else if (entry) {
      nonReviewHistory.push(entry);
    }
  }

  const { weeklyGoalsMap, otherHistory } = groupWeeklyGoalEntriesByWeekKey(nonReviewHistory);

  const consolidatedWeeklyEntries: PointsEntry[] = [];
  for (const [weekKey, entries] of weeklyReviewMap.entries()) {
    const netAmount = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
    if (netAmount <= 0) {
      // Deleted week / non-positive net -> drop all entries
      continue;
    }
    // Net > 0 (a single award, or a corrupted duplicate) -> consolidate to one award.
    // The award keeps the amount it was given (Zakria, 2026-10-14: an old 20-point
    // reflection stays 20), never more than the week's net.
    const sorted = [...entries].sort(
      (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
    );
    const earliest = sorted[0];
    const firstAward = sorted.find((e) => (e.amount || 0) > 0);
    consolidatedWeeklyEntries.push({
      id: `weekly_review_${weekKey}`,
      amount: Math.min(netAmount, firstAward?.amount || WEEKLY_REFLECTION_POINTS.awarded),
      reason: `Weekly reflection completed for ${weekKey}`,
      source: 'weekly_review',
      timestamp: earliest.timestamp || trustedNow().toISOString(),
      metadata: { weekKey },
    });
  }

  const currentLeagueNow = leagueNow();
  const activeSeasonNumber = getSeasonNumber(currentLeagueNow);
  const activeSeasonStart = getSeasonStart(currentLeagueNow);

  // Weekly Goals Points Consolidation Migration (Narrowed Scope)
  // Only handles what reconcileWeeklyGoalsPointsForAllWeeks explicitly does NOT cover:
  // 1. Closed/frozen season weeks (start < activeSeasonStart)
  // 2. Orphaned weeks with no matching weeklyGoals doc
  // Active-season weeks with a matching doc pass their raw entries through to pointsHistory
  // and are consolidated canonically via reconcileWeeklyGoalsPointsForAllWeeks.
  const allWeeklyGoalWeekKeys = new Set<string>([
    ...weeklyGoalsMap.keys(),
    ...(st.weeklyGoals || []).map((w) => w?.weekKey).filter((k): k is string => Boolean(k)),
  ]);

  const consolidatedWeeklyGoalEntries: PointsEntry[] = [];
  const passthroughActiveGoalEntries: PointsEntry[] = [];

  for (const weekKey of allWeeklyGoalWeekKeys) {
    const doc = (st.weeklyGoals || []).find((w) => w && w.weekKey === weekKey);
    const isClosedSeason = isWeekBeforeSeason(weekKey, activeSeasonStart);

    // Active season week with a matching doc: skip manual consolidation here.
    // Pass raw entries through so reconcileWeeklyGoalsPointsForAllWeeks can canonically
    // reconcile via addPointsInternal / excisePointsEntriesInternal later in sweep.
    // A week a season started in keeps its per-season entries as they are (never merged into one).
    if (doc && (!isClosedSeason || getSeasonBoundaryInWeek(weekKey))) {
      const activeEntries = weeklyGoalsMap.get(weekKey) || [];
      passthroughActiveGoalEntries.push(...activeEntries);
      continue;
    }

    // Closed-season week OR orphaned week with no matching doc:
    // If no matching doc exists, targetAmount is 0 (orphaned -> drop previous entries)
    const goals = doc?.goals || [];
    const score = calculateWeeklyGoalsPoints(goals);
    const targetAmount = score.pointsAwarded;

    if (targetAmount <= 0) {
      // 0 completed goals or orphaned doc -> drop all previous weekly goal entries for this week
      continue;
    }

    const previousEntries = weeklyGoalsMap.get(weekKey) || [];
    const sorted = [...previousEntries].sort(
      (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
    );
    const earliestTimestamp = sorted[0]?.timestamp || doc?.createdAt || trustedNow().toISOString();

    consolidatedWeeklyGoalEntries.push({
      id: `weekly_goal_${weekKey}`,
      amount: targetAmount,
      reason: `Weekly goals achieved for ${weekKey} (${targetAmount} pts)`,
      source: 'weekly_goal_achieved',
      timestamp: earliestTimestamp,
      metadata: {
        weekKey,
        countedGoalsCount: score.countedGoalsCount,
        completedGoalsCount: score.completedGoalsCount,
      },
    });
  }

  // Full sorted history (the ledger is complete: point_entries table).
  const sortedHistory = [
    ...otherHistory,
    ...consolidatedWeeklyEntries,
    ...consolidatedWeeklyGoalEntries,
    ...passthroughActiveGoalEntries,
  ].sort(
    (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );

  let seasonId = typeof st.seasonId === 'number' ? st.seasonId : 1;
  // Archives saved before standings were slimmed still carry other members' stats and habits,
  // and the retired seed (filler) accounts; drop those and re-rank the user without them.
  const leagueArchives: LeagueArchive[] = (st.leagueArchives || [])
    .filter((a) => !!a.id)
    .map((a) => {
      const competitors = a.competitors || [];
      const realCompetitors = competitors.filter((c) => !c.isSeed);
      return {
        ...a,
        competitors: realCompetitors.map(toArchivedCompetitor),
        ...(realCompetitors.length !== competitors.length ? { userRank: getUserRank(realCompetitors) } : {}),
      };
    });

  // Check if loaded state belongs to an older season (Rollover Check).
  // The closing season's archive comes from the server.
  if (st.seasonId === undefined || st.seasonId < activeSeasonNumber) {
    seasonId = activeSeasonNumber;
  }

  const pointsHistory = sortedHistory;


  const computedSeasonPoints = calculateSeasonalTotal(pointsHistory, activeSeasonStart);

  // Deduplicate badHabitLogs by (badHabitId, date) keeping latest entry
  const logsMap = new Map<string, BadHabitLog>();
  (st.badHabitLogs ?? []).forEach((l) => {
    if (!l || !l.badHabitId || !l.date) return;
    const key = `${l.badHabitId}_${l.date}`;
    const existing = logsMap.get(key);
    if (!existing) {
      logsMap.set(key, l);
    } else {
      const existingTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
      const newTime = l.createdAt ? new Date(l.createdAt).getTime() : 0;
      if (newTime >= existingTime) {
        logsMap.set(key, l);
      }
    }
  });
  const sanitizedBadHabitLogs = Array.from(logsMap.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  // Backward compatibility migration: Merge legacy books into libraryBooks
  const legacyBooks = (st.books ?? []) as Array<Book & Partial<UserBook>>;
  const rawLibraryBooks: UserBook[] = st.libraryBooks ?? [];
  const tombstoneSet = new Set(st.deletedEntityIds || []);

  const libraryMap = new Map<string, UserBook>();
  rawLibraryBooks.forEach((lb) => {
    if (lb && lb.id && !tombstoneSet.has(lb.id)) {
      const normalizedStatus: UserBookStatus = (lb.status === 'to_read' || lb.status === 'to-read')
        ? 'to-read'
        : lb.status === 'completed'
        ? 'completed'
        : 'reading';

      const totalAmt = lb.totalAmount ?? lb.totalPages ?? 250;
      const currentAmt = lb.currentAmount ?? lb.currentPage ?? (normalizedStatus === 'completed' ? totalAmt : 0);
      const isFin = normalizedStatus === 'completed';

      libraryMap.set(lb.id, {
        ...lb,
        status: normalizedStatus,
        totalAmount: totalAmt,
        currentAmount: currentAmt,
        unit: lb.unit ?? 'pages',
        totalPages: totalAmt,
        currentPage: currentAmt,
        isFinished: isFin,
        isCurated: lb.isCurated ?? !lb.isCustom,
        isCustom: lb.isCustom ?? !lb.isCurated,
        pointsReward: lb.pointsReward ?? (lb.curatedBookId ? findCuratedBook(lb.curatedBookId)?.pointsOnCompletion : 0) ?? 0,
      });
    }
  });

  // Migrate legacy books into libraryMap if not already represented
  legacyBooks.forEach((b) => {
    if (!b || !b.id || tombstoneSet.has(b.id)) return;
    const existingById = libraryMap.get(b.id);
    const existingByLinked = Array.from(libraryMap.values()).find(
      (lb) => lb.linkedBookId === b.id || lb.title.toLowerCase() === b.title.toLowerCase()
    );

    if (existingById) {
      existingById.totalAmount = existingById.totalAmount ?? b.totalPages;
      existingById.currentAmount = b.currentPage ?? existingById.currentAmount;
      existingById.unit = existingById.unit ?? b.unit;
      existingById.targetFinishDate = existingById.targetFinishDate ?? b.targetFinishDate;
      existingById.reflection = existingById.reflection ?? b.reflection;
      existingById.status = b.isFinished ? 'completed' : (existingById.status || 'reading');
      existingById.totalPages = b.totalPages;
      existingById.currentPage = b.currentPage;
      existingById.isFinished = b.isFinished;
      existingById.consecutiveMisses = b.consecutiveMisses ?? existingById.consecutiveMisses;
      existingById.lastPenalizedDate = b.lastPenalizedDate ?? existingById.lastPenalizedDate;
    } else if (existingByLinked) {
      existingByLinked.totalAmount = existingByLinked.totalAmount ?? b.totalPages;
      existingByLinked.currentAmount = b.currentPage ?? existingByLinked.currentAmount;
      existingByLinked.unit = existingByLinked.unit ?? b.unit;
      existingByLinked.targetFinishDate = existingByLinked.targetFinishDate ?? b.targetFinishDate;
      existingByLinked.reflection = existingByLinked.reflection ?? b.reflection;
      existingByLinked.status = b.isFinished ? 'completed' : existingByLinked.status;
      existingByLinked.totalPages = b.totalPages;
      existingByLinked.currentPage = b.currentPage;
      existingByLinked.isFinished = b.isFinished;
      existingByLinked.linkedBookId = b.id;
      existingByLinked.consecutiveMisses = b.consecutiveMisses ?? existingByLinked.consecutiveMisses;
      existingByLinked.lastPenalizedDate = b.lastPenalizedDate ?? existingByLinked.lastPenalizedDate;
    } else {
      const isFin = Boolean(b.isFinished);
      const userBook: UserBook = {
        id: b.id,
        title: b.title,
        author: b.author || 'Unknown Author',
        description: b.description || undefined,
        category: b.category || undefined,
        coverImageUrl: b.coverImageUrl || undefined,
        isCurated: false,
        curatedBookId: b.curatedBookId || undefined,
        isCustom: true,
        pointsReward: 0,
        pointsAwarded: 0,
        status: isFin ? 'completed' : 'reading',
        totalAmount: b.totalPages || 200,
        currentAmount: isFin ? (b.totalPages || 200) : (b.currentPage || 0),
        unit: b.unit || 'pages',
        targetFinishDate: b.targetFinishDate,
        dateStarted: b.createdAt,
        dateCompleted: b.finishedAt,
        reflection: b.reflection,
        totalPages: b.totalPages || 200,
        currentPage: isFin ? (b.totalPages || 200) : (b.currentPage || 0),
        isFinished: isFin,
        addedAt: b.createdAt || trustedNow().toISOString(),
        startedAt: b.createdAt || trustedNow().toISOString(),
        completedAt: b.finishedAt,
        linkedBookId: b.id,
        consecutiveMisses: b.consecutiveMisses,
        lastPenalizedDate: b.lastPenalizedDate,
        updatedAt: b.updatedAt || undefined,
      };
      libraryMap.set(b.id, userBook);
    }
  });

  const sanitizedLibraryBooks = Array.from(libraryMap.values());

  const activeDeletedEntityIds = (st.deletedEntityIds ?? [])
    .filter((id) => isLegitimateTombstoneId(id) && !(st.restoredEntityIds || []).includes(id));

  const savedTheme = normalizeThemePreference(st.themePreference, st.themeUpdatedAt);
  const themeFields = savedTheme ? { themePreference: savedTheme } : deviceThemeFields();

  const rawSanitizedHabits = (st.habits ?? []).map((h) => {
    let normalizedCompletions: Record<string, { done: boolean; updatedAt: string; pointsAwarded?: number }> = {};
    if (Array.isArray(h.completions)) {
      const defaultTime = h.updatedAt || h.createdAt || `init_${h.id}`;
      for (const d of h.completions) {
        if (typeof d === 'string' && d) {
          normalizedCompletions[d] = { done: true, updatedAt: defaultTime };
        }
      }
    } else if (h.completions && typeof h.completions === 'object') {
      const defaultTime = h.updatedAt || h.createdAt || `init_${h.id}`;
      for (const [key, val] of Object.entries(h.completions)) {
        if (val && typeof val === 'object') {
          const entryObj = val as { done?: boolean; updatedAt?: string; pointsAwarded?: number };
          normalizedCompletions[key] = {
            done: Boolean(entryObj.done ?? true),
            updatedAt: entryObj.updatedAt || defaultTime,
            ...(typeof entryObj.pointsAwarded === 'number' ? { pointsAwarded: entryObj.pointsAwarded } : {}),
          };
        } else if (typeof val === 'boolean') {
          normalizedCompletions[key] = { done: val, updatedAt: defaultTime };
        }
      }
    }
    return {
      ...h,
      completions: normalizedCompletions,
    };
  });

  const activeDeletedEntityIdSet = new Set(activeDeletedEntityIds);
  const filterActiveTombstones = <T extends { id?: string }>(items: T[] | undefined): T[] =>
    (items ?? []).filter((item) => !item || !item.id || !activeDeletedEntityIdSet.has(item.id));

  const { habits: sanitizedHabits, deletedEntityIds: sanitizedDeletedEntityIds } = deduplicatePresetHabits(
    rawSanitizedHabits.filter((h) => !h.id || !activeDeletedEntityIdSet.has(h.id)),
    activeDeletedEntityIds
  );

  const rawWeeklyGoals = filterActiveTombstones(st.weeklyGoals).map((wg) => {
    let reflections: WeeklyGoalReflection[] = Array.isArray(wg.reflections)
      ? wg.reflections.filter((r) => !r.id || !activeDeletedEntityIdSet.has(r.id))
      : [];
    if (reflections.length === 0 && wg.insights && wg.insights.trim()) {
      reflections = [
        {
          id: uid(),
          content: wg.insights.trim(),
          createdAt: wg.createdAt || trustedNow().toISOString(),
          pointsAwarded: Boolean(wg.isReviewed),
        },
      ];
    }
    // Only docs this app version changed carry the list (withDeletedGoalIds); others stay as they are.
    const deletedGoalIdSet = new Set(Array.isArray(wg.deletedGoalIds) ? wg.deletedGoalIds : []);
    return {
      ...wg,
      reflections,
      goals: (wg.goals ?? [])
        .filter((g: any) => !g || !g.id || (!activeDeletedEntityIdSet.has(g.id) && !deletedGoalIdSet.has(g.id)))
        .map((g: any) => ({
          id: g.id || uid(),
          title: g.title || g.text || 'Weekly Goal',
          targetDescription: g.targetDescription || '',
          priority: g.priority || 'medium',
          linkedModule: g.linkedModule || 'none',
          linkedItemId: g.linkedItemId || undefined,
          linkedMetricKey: g.linkedMetricKey || undefined,
          targetValue: typeof g.targetValue === 'number' ? g.targetValue : undefined,
          unit: g.unit || undefined,
          manualProgress: typeof g.manualProgress === 'number' ? g.manualProgress : undefined,
          completed: Boolean(g.completed ?? g.done),
          completedAt: g.completedAt || undefined,
          completedByLogId: g.completedByLogId || undefined,
          archived: Boolean(g.archived),
          carryOverDismissed: Boolean(g.carryOverDismissed),
          carriedOverFromWeekKey: g.carriedOverFromWeekKey || undefined,
          carriedOverFromGoalId: g.carriedOverFromGoalId || undefined,
          createdAt: g.createdAt || trustedNow().toISOString(),
          updatedAt: g.updatedAt || undefined,
          linkEditedAt: g.linkEditedAt || undefined,
        })),
    };
  });

  // Backward compatibility migration: Backfill carriedOverFromGoalId for legacy carried goals with an unambiguous 1:1 source match
  const weeklyGoalsByWeek = new Map<string, WeeklyGoalItem[]>();
  rawWeeklyGoals.forEach((wg) => {
    weeklyGoalsByWeek.set(wg.weekKey, wg.goals);
  });

  const sanitizedWeeklyGoals = rawWeeklyGoals.map((wg) => ({
    ...wg,
    goals: wg.goals.map((g) => {
      if (g.carriedOverFromWeekKey && !g.carriedOverFromGoalId) {
        const sourceGoals = weeklyGoalsByWeek.get(g.carriedOverFromWeekKey) || [];
        const titleNorm = g.title.trim().toLowerCase();
        const candidates = sourceGoals.filter(
          (sg) => sg.id !== g.id && sg.title.trim().toLowerCase() === titleNorm
        );
        if (candidates.length === 1) {
          return {
            ...g,
            carriedOverFromGoalId: candidates[0].id,
          };
        }
      }
      return g;
    }),
  }));

  const baseState: AppState = {
    ...DEFAULT_STATE,
    ...st,
    ...themeFields,
    currentUser: profile,
    username: profile ? profile.username : (st.username ?? 'Guest User'),
    habits: sanitizedHabits,
    journalEntries: filterActiveTombstones(st.journalEntries),
    seasonId,
    seasonPoints: computedSeasonPoints,
    totalPoints: computedSeasonPoints,
    pointsHistory,
    leagueArchives,
    readLessonIds: st.readLessonIds ?? [],
    workouts: filterActiveTombstones(st.workouts),
    books: [], // Wiped out to eliminate JSON payload bloat on sync
    libraryBooks: sanitizedLibraryBooks.filter((b) => !b.id || !activeDeletedEntityIdSet.has(b.id)),
    readingLogs: filterActiveTombstones(st.readingLogs),
    skills: filterActiveTombstones(st.skills),
    skillLogs: filterActiveTombstones(st.skillLogs),
    badHabits: filterActiveTombstones(st.badHabits).map((bh) => ({
      ...bh,
      isCompleted: bh.isCompleted ?? false,
    })),
    badHabitLogs: sanitizedBadHabitLogs.filter(
      (l) => (!l.id || !activeDeletedEntityIdSet.has(l.id)) && (!l.badHabitId || !activeDeletedEntityIdSet.has(l.badHabitId))
    ),
    addictionTracker: st.addictionTracker && (!st.addictionTracker.id || !activeDeletedEntityIdSet.has(st.addictionTracker.id))
      ? {
          ...st.addictionTracker,
          milestonesUnlocked: Array.isArray(st.addictionTracker.milestonesUnlocked)
            ? st.addictionTracker.milestonesUnlocked
            : [],
          awardedMilestones: Array.isArray(st.addictionTracker.awardedMilestones)
            ? st.addictionTracker.awardedMilestones
            : [],
          revokedAwardIds: Array.isArray(st.addictionTracker.revokedAwardIds)
            ? st.addictionTracker.revokedAwardIds
            : [],
        }
      : null,
    cravingLogs: filterActiveTombstones(st.cravingLogs),
    focusLogs: filterActiveTombstones(st.focusLogs),
    decisionLogs: filterActiveTombstones(st.decisionLogs),
    emotionLogs: filterActiveTombstones(st.emotionLogs),
    weeklyGoals: sanitizedWeeklyGoals,
    goals: filterActiveTombstones(st.goals),
    projects: filterActiveTombstones(st.projects),
    tasks: filterActiveTombstones(st.tasks).map((t) => ({
      ...t,
      subtasks: (Array.isArray(t.subtasks) ? t.subtasks : []).filter(
        (st) => !st.id || !activeDeletedEntityIdSet.has(st.id)
      ),
    })),
    improvementPlans: filterActiveTombstones(st.improvementPlans),
    followedPlans: filterActiveTombstones(st.followedPlans),
    partnerInvites: (st.partnerInvites ?? []).filter(
      (inv) => !activeDeletedEntityIdSet.has(inv.id)
    ),
    partnership:
      st.partnership && activeDeletedEntityIdSet.has(st.partnership.id)
        ? null
        : (st.partnership ?? null),
    partnerships: (st.partnerships ?? []).filter(
      (p) => !activeDeletedEntityIdSet.has(p.id)
    ),
    sharedChallenges: (st.sharedChallenges ?? [])
      .filter(
        (c) => !activeDeletedEntityIdSet.has(c.id) && !activeDeletedEntityIdSet.has(c.partnershipId)
      )
      .map((c) => reconcileSharedChallengeLifecycle(c)),
    notifications: (st.notifications ?? [])
      .filter((n: any) => !n.createdAt || n.createdAt >= new Date(trustedNowMs() - NOTIFICATION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString())
      .filter((n: any) => !sanitizedDeletedEntityIds.includes(n.id))
      .slice(0, NOTIFICATION_WINDOW),
    deletedEntityIds: sanitizedDeletedEntityIds.slice(-500),
    restoredEntityIds: (st.restoredEntityIds ?? []).slice(-500),
    timeTracker: {
      activities: ensureDefaultActivities(
        (st.timeTracker?.activities ?? DEFAULT_TIME_TRACKER_ACTIVITIES).filter(
          (act) => !act.id || !activeDeletedEntityIdSet.has(act.id)
        )
      ),
      templates: (st.timeTracker?.templates ?? DEFAULT_TIME_TRACKER_STATE.templates).filter(
        (t) => !activeDeletedEntityIdSet.has(t.id)
      ),
      dailyLogs: Object.fromEntries(
        Object.entries(st.timeTracker?.dailyLogs ?? {}).map(([date, blocks]) => [
          date,
          (blocks ?? []).filter((block) => !block.id || !activeDeletedEntityIdSet.has(block.id)),
        ])
      ),
      clearedDates: st.timeTracker?.clearedDates ?? [],
      ...(st.timeTracker?.dayMeta ? { dayMeta: st.timeTracker.dayMeta } : {}),
    },
  };

  let sweptState = baseState;
  const now = trustedNow();

  // Auto-hydrate today's schedule from active template if dailyLog is currently empty
  if (sweptState.timeTracker) {
    const todayStr = todayKey(now);
    const { updatedState, hydrated } = autoHydrateDailyLog(sweptState.timeTracker, todayStr);
    if (hydrated) {
      sweptState = {
        ...sweptState,
        timeTracker: updatedState,
      };
    }
  }

  sweptState = reconcileWeeklyGoalsPointsForAllWeeks(
    reconcileLinkedWeeklyGoals(sweptState, now),
    now
  );

  // Preset Habit Retirement Migration: retired presets leave (earned points stay)
  sweptState = applyPresetHabitRemovalMigration(sweptState, weekKey(now), todayKey(now));

  return sweptState;
}
