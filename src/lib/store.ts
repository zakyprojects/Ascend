import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  DEFAULT_STATE,
  Habit,
  JournalEntry,
  LeagueArchive,
  LeagueType,
  PointsEntry,
  UserProfile,
  WorkoutLog,
  Book,
  ReadingLog,
  ReadingProgressLog,
  Skill,
  SkillSessionLog,
  SkillLevel,
  BadHabit,
  BadHabitLog,
  AddictionTracker,
  CravingLog,
  FocusSessionLog,
  DecisionLog,
  EmotionLog,
  WeeklyGoal,
  WeeklyGoalItem,
  WeeklyGoalReflection,
  PlanStep,
  ImprovementPlan,
  UserPlanFollow,
  PartnerInvite,
  Partnership,
  SharedChallenge,
  UserBook,
  UserBookStatus,
  CuratedBook,
  BookCategory,
  VisionReflectionNote,
  PlanReflectionNote,
  PlanType,
  SharedChallengeCategory,
  AppNotification,
  Goal,
  Project,
  Task,
  TaskSubtask,
  GoalStatus,
  ProjectStatus,
  TaskPriority,
  TimeTrackerState,
  TimeTrackerActivity,
  TimeTrackerTemplate,
  TimeTrackerBlock,
  DEFAULT_TIME_TRACKER_ACTIVITIES,
  DEFAULT_TIME_TRACKER_STATE,
} from '@/types';
import {
  ensureDefaultActivities,
  autoHydrateDailyLog,
  checkTimeCollision,
  normalizeOrSplitMidnightBlock,
  timeStringToMinutes,
  minutesToTimeString,
  calculateBlockDurationMinutes,
} from './timeTracker';
import { findCuratedBook } from './books';
import { uid, generateUUID, generateNumericUID, periodKey, todayKey, isTodayLocal, calculateActivePlanStreak, getWeekDates, previousPeriodKey, parseDate, getNow, getNextDateKey, weekKey, addDays } from './dates';
import { computeLinkedGoalProgress } from './linkedGoalMetrics';
import { reconcileSharedChallengeLifecycle, applyPledgeToggle, mergeSharedChallenge } from './pactLifecycle';
import { isPartnershipUser1 } from './partnershipSide';
import { PresetHabit } from './presets';
import { computeHabitAwards, isHabitAwardEntry, isRetiredAppHabitAward } from './habitAwards';
import { computeWorkoutAwards, isRetiredAppWorkoutAward, isWorkoutDayEntry } from './workoutAwards';
import { computeSkillAwards, isRetiredAppSkillAward, isSkillDayEntry } from './skillAwards';
import { computeRecoveryChanges, RECOVERY_MILESTONES, trackerStartMs } from './recoveryAwards';
import { computeJournalAward, isJournalDayEntry, isRetiredAppJournalAward, journalEntryEarns } from './journalAwards';
import { computeFocusAwards, isFocusDayEntry, isRetiredAppFocusAward } from './focusAwards';
import { computeTimeTrackerAward, timeTrackerAwardId } from './timeTrackerAwards';
import { isReflectionWindowOpen, reflectionWindow, weeklyGoalAwardTimestamp } from './weeklyAwards';
import { computeLessonAward, isLessonReadInSeason, lessonReadId } from './lessonAwards';
import { computeReadingDayAward, isReadingDayEntry, isRetiredAppReadingAward, meetsReadingBonusGates, readingBonusId } from './readingAwards';
import {
  getLeaguePeriodStart,
  getLeaguePointsPeriods,
  calculatePeriodPoints,
  calculateSeasonalTotal,
  getEffectiveSeasonPoints,
  generateCompetitors,
  getUserRank,
  toArchivedCompetitor,
} from './leagues';
import { withoutRetiredKeys } from './retiredStateKeys';
import {
  leagueNow,
  getSeasonNumber,
  getSeasonStart,
  getSeasonEnd,
  getSeasonPeriodId,
  syncSeasonConfig,
} from './leagueTime';
import {
  logoutUser,
  deleteOwnAccount,
  clearLocalUserData,
  updateProfilePrivacy,
  updateProfileAcceptPartnerInvites,
  updateProfileNotificationPreferences,
  getAllPublicImprovementPlans,
  setCachedProfiles,
  setCachedLeaguePoints,
  setCachedPublicPlans,
  updateCachedPublicPlan,
  getCachedPublicPlanById,
  removeCachedPublicPlan,
  fetchProfileByUidFromSupabase,
} from './auth';
import { hydrateUserSession } from './authSession';
import { createLeagueStandingsRefresher, leaguePeriodKey } from './leagueStandingsRefresh';
import {
  getMissPenaltyMultiplier,
  getHighestUserStreak,
  getAppStateSeasonPoints,
} from './habitPenalties';
import { toSeasonHistory } from './seasonArchive';
import { addPointsInternal } from './pointsLedger';
import { clockReady, trustedNow, trustedNowMs } from './clock';
export { addPointsInternal };
import {
  PresetHabitCapItem,
  recomputeTodayPresetPoints,
  WEEKLY_REFLECTION_POINTS,
  READING_POINTS,
  BAD_HABIT_POINTS,
  TIME_TRACKER_POINTS,
  WEEKLY_GOALS_POINTS,
  calculateReadingPoints,
  calculateTimeTrackerDailyPoints,
  calculateWeeklyGoalsPoints,
  calculateWeeklyGoalsPointsBefore,
  POINTS_V2_START_DATE_KEY,
} from './pointsConfig';
import {
  getWeeklyGoalEntryId,
  getWeeklyGoalSeasonSplitEntryId,
  isWeeklyGoalSeasonSplitEntryId,
  getSeasonBoundaryInWeek,
  isWeekBeforeSeason,
} from './weeklyGoalSeasons';
import {
  badHabitDeleteId,
  badHabitOccurredId,
  computeBadHabitAwards,
  isBadHabitDayEntry,
  isRetiredAppBadHabitAward,
  legacyResistRefund,
} from './badHabitAwards';
export { recomputeTodayPresetPoints, calculateWeeklyGoalsPoints, WEEKLY_GOALS_POINTS };
export type { PresetHabitCapItem };
import { calculateUnifiedStreak } from './streakLogic';
import { computeStateDataWeight } from './dataWeight';
import {
  supabase,
  isSupabaseConfigured,
  syncBroadcaster,
  syncPlanToSupabase,
  deletePlanFromSupabase,
  syncFollowedPlanToSupabase,
  deleteFollowedPlanFromSupabase,
  addReflectionNoteToSupabase,
  deleteReflectionNoteFromSupabase,
  sendPartnerInviteSupabase,
  fetchUserDataFromSupabase,
  fetchUserDataWithStatusFromSupabase,
  getUserDataWatermark,
  setUserDataWatermark,
  resetUserDataWatermark,
  saveUserDataToSupabase,
  fetchAllProfilesFromSupabase,
  fetchLeaguePointsFromSupabase,
  fetchProfileByUsernameFromSupabase,
  fetchPublicPlansFromSupabase,
  fetchPartnerInvitesSupabase,
  savePartnershipSupabase,
  fetchPartnershipSupabase,
  fetchPartnershipsSupabase,
  deletePartnershipSupabase,
  deletePartnerInviteSupabase,
  declinePartnerInviteSupabase,
  saveSharedChallengeSupabase,
  fetchSharedChallengesSupabase,
  deleteSharedChallengeSupabase,
  acceptPartnerInviteAtomicSupabase,
  cleanupPendingInvitesBetweenUsersSupabase,
  fetchNotificationsSupabase,
  markNotificationReadSupabase,
  markAllNotificationsReadSupabase,
  clearNotificationSupabase,
  storedAuthSession,
} from './supabase';
import { GuardBlockedError } from './errors';
import { flushOutbox, hasPendingSyncOps, recordSyncedChanges } from './sync/outbox';
import { applyRemoteChanges, prepareRemoteRows, pullSyncedRows } from './sync/pull';
import { SYNCED_COLLECTIONS } from './sync/syncedCollections';
import { mergeAppState, deduplicatePresetHabits, mergeAppStateWithGuardResult, isLegitimateTombstoneId } from './stateMerger';
import { toUserMessage } from './userMessage';
import { disablePush } from './push';

// Cross-tab real-time state synchronization channel
export const STATE_SYNC_CHANNEL_NAME = 'ascend-state-sync';

// Global in-flight pledge request lock to prevent double-click race conditions
const pendingPledgeRequests = new Set<string>();

export interface StateSyncMessage {
  type: 'ASCEND_STATE_SYNC';
  senderTabId: string;
  userId?: string;
  state: AppState;
  timestamp: number;
}

export function broadcastStateToTabs(state: AppState, senderTabId: string) {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  try {
    const channel = new BroadcastChannel(STATE_SYNC_CHANNEL_NAME);
    const msg: StateSyncMessage = {
      type: 'ASCEND_STATE_SYNC',
      senderTabId,
      userId: state.currentUser?.id,
      state,
      timestamp: trustedNowMs(),
    };
    channel.postMessage(msg);
    channel.close();
  } catch (e) {
    /* ignore BroadcastChannel errors */
  }
}

function dispatchToastError(title: string, message?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app-toast-error', {
        detail: { title, message },
      })
    );
  }
}

function removeLinkedWeeklyGoals(
  weeklyGoals: WeeklyGoal[],
  linkedModule: 'habit' | 'skill' | 'reading',
  itemIds: (string | undefined)[],
  currentWeekKey: string
): WeeklyGoal[] {
  const validIds = new Set(itemIds.filter((id): id is string => Boolean(id)));
  if (validIds.size === 0) return weeklyGoals;

  return weeklyGoals.map((w) => {
    if (w.weekKey < currentWeekKey) return w;
    const hasLinked = w.goals.some(
      (g) => g.linkedModule === linkedModule && g.linkedItemId && validIds.has(g.linkedItemId)
    );
    if (!hasLinked) return w;
    return {
      ...w,
      goals: w.goals.filter(
        (g) => !(g.linkedModule === linkedModule && g.linkedItemId && validIds.has(g.linkedItemId))
      ),
    };
  });
}

export const RETIRED_PRESET_HABIT_NAMES = new Set<string>([
  'Exercise / workout',
  'Deep work session',
  'Practice a skill',
  'No porn',
  'No social media before bed',
  'No junk food',
  'Journaling',
]);

/**
 * Migration: Retires 7 preset habits from user state, tombstones removed IDs and detaches
 * linked weekly goals. Points are not reversed here: the server retired the remaining rows
 * (20261015120000_server_habit_awards.sql), none of which had completions.
 */
export function applyPresetHabitRemovalMigration(state: AppState, currentWeekKey: string): AppState {
  const habitsToRetire = (state.habits || []).filter(
    (h) => h && h.isPreset === true && RETIRED_PRESET_HABIT_NAMES.has(h.name)
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
  const updatedDeletedEntityIds = Array.from(
    new Set([...(runningState.deletedEntityIds || []), ...retiredHabitIds])
  ).slice(-500);
  const updatedWeeklyGoals = removeLinkedWeeklyGoals(runningState.weeklyGoals || [], 'habit', retiredHabitIds, currentWeekKey);

  runningState = {
    ...runningState,
    habits: updatedHabits,
    weeklyGoals: updatedWeeklyGoals,
    deletedEntityIds: updatedDeletedEntityIds,
  };

  return runningState;
}

const GUEST_STORAGE_KEY = 'ascend_guest_state_v2';
/** How long the boot loader waits on a saved sign-in before offering Retry (offline). */
const STORED_SESSION_WAIT_MS = 8000;
export const LOCAL_THEME_STORAGE_KEY = 'ascend_theme_preference';

export function getLocalThemePreference(): 'dark' | 'light' | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawVal = localStorage.getItem(LOCAL_THEME_STORAGE_KEY);
    if (rawVal === 'light' || rawVal === 'dark') return rawVal;
  } catch (err) {
    // ignore local storage errors
  }
  return null;
}

export function setLocalThemePreference(theme: 'dark' | 'light'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_THEME_STORAGE_KEY, theme);
  } catch (err) {
    // ignore local storage errors
  }
}

function loadInitialState(): AppState {
  const localTheme = getLocalThemePreference() || 'dark';
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_STATE,
        themePreference: localTheme,
      };
    }
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeLoadedState(parsed, null);
    return {
      ...sanitized,
      themePreference: parsed.themePreference || localTheme,
    };
  } catch {
    return {
      ...DEFAULT_STATE,
      themePreference: localTheme,
    };
  }
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

  const currentHistorySum = pointsHistory.reduce((sum, p) => sum + (p.amount || 0), 0);

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

  const resolvedTheme = st.themePreference || (getLocalThemePreference() || 'dark');

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
    return {
      ...wg,
      reflections,
      goals: (wg.goals ?? [])
        .filter((g: any) => !g || !g.id || !activeDeletedEntityIdSet.has(g.id))
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
          archived: Boolean(g.archived),
          carryOverDismissed: Boolean(g.carryOverDismissed),
          carriedOverFromWeekKey: g.carriedOverFromWeekKey || undefined,
          carriedOverFromGoalId: g.carriedOverFromGoalId || undefined,
          createdAt: g.createdAt || trustedNow().toISOString(),
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
    themePreference: resolvedTheme,
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
      commitmentDays: bh.commitmentDays || 30,
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
      .filter((n: any) => !n.createdAt || n.createdAt >= new Date(trustedNowMs() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .filter((n: any) => !sanitizedDeletedEntityIds.includes(n.id))
      .slice(0, 50),
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
    },
  };

  let sweptState = baseState;
  const now = getNow();

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

  // Preset Habit Retirement Migration: Cleanse retired presets & retroactively claw back season points
  sweptState = applyPresetHabitRemovalMigration(sweptState, weekKey(getNow()));

  return sweptState;
}

async function persistState(state: AppState, options?: { allowDestructiveWipe?: boolean }): Promise<void> {
  if (state.currentUser?.id) {
    await saveUserDataToSupabase(state.currentUser.id, state, options);
    // Clean up local guest storage key once session is authenticated
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  } else {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
  }
}

export function excisePointsEntriesInternal(
  prev: AppState,
  matcher: (entry: PointsEntry) => boolean,
  maxExciseCount: number = Infinity
): Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'> & {
  excisedEntryIds: string[];
} {
  const now = leagueNow();
  const activeSeasonNumber = getSeasonNumber(now);
  const activeSeasonStart = getSeasonStart(now);

  let seasonId = typeof prev.seasonId === 'number' ? prev.seasonId : 1;
  const leagueArchives: LeagueArchive[] = prev.leagueArchives ? [...prev.leagueArchives] : [];

  // Season Rollover Check (the closing season's archive comes from the server)
  if (seasonId < activeSeasonNumber) {
    seasonId = activeSeasonNumber;
  }

  const excisedEntryIds: string[] = [];
  const keptHistory: PointsEntry[] = [];
  let excisedCount = 0;

  for (const entry of prev.pointsHistory || []) {
    if (excisedCount < maxExciseCount && matcher(entry)) {
      if (entry.id) {
        excisedEntryIds.push(entry.id);
      }
      excisedCount++;
    } else {
      keptHistory.push(entry);
    }
  }

  const newSeasonPoints = calculateSeasonalTotal(keptHistory, activeSeasonStart);

  return {
    seasonId,
    seasonPoints: newSeasonPoints,
    totalPoints: newSeasonPoints,
    pointsHistory: keptHistory,
    leagueArchives,
    excisedEntryIds,
  };
}

/**
 * Every point entry is the server's (20261015250000). The hydrated state already holds exactly the
 * server's rows (the boot table read drops app previews the server never wrote), so after the boot
 * merge with this device's cache only those rows stay; otherwise a rejected preview (a past-day
 * tick, a waiting timezone change) would come back from the cache on every reload. An empty
 * hydrated ledger is not trusted (a failed or missing read), and the merge is kept as it is.
 */
function withHydratedPoints(merged: AppState, hydrated: AppState): AppState {
  const serverPoints = hydrated.pointsHistory || [];
  if (serverPoints.length === 0) return merged;
  const live = new Set(serverPoints.map((entry) => entry.id));
  const pointsHistory = (merged.pointsHistory || []).filter((entry) => live.has(entry.id));
  if (pointsHistory.length === (merged.pointsHistory || []).length) return merged;
  const seasonPoints = calculateSeasonalTotal(pointsHistory, getSeasonStart(leagueNow()));
  return { ...merged, pointsHistory, seasonPoints, totalPoints: seasonPoints };
}

/**
 * Replaces one local day's habit award entries with the ones the server computes for these
 * habits (computeHabitAwards), and stamps each checked preset's pointsAwarded. The entries
 * are shown at once and never uploaded; the server's own rows replace them on the next pull.
 */
function applyHabitAwardsInternal(
  state: AppState,
  habits: Habit[],
  day: string
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; habits: Habit[] } {
  const { allocation, entries } = computeHabitAwards(
    habits,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime()
  );

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(
    state,
    (entry) => isHabitAwardEntry(entry) && entry.metadata?.periodKey === day
  );
  let points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'> = excised;
  for (const entry of entries) {
    points = addPointsInternal(
      { ...state, ...points },
      entry.amount,
      entry.reason,
      entry.source,
      entry.metadata,
      entry.timestamp,
      entry.id
    );
  }

  const nextHabits = habits.map((h) => {
    if (!h || !(h.id in allocation) || Array.isArray(h.completions)) return h;
    const comp = h.completions?.[day];
    if (!comp) return h;
    return { ...h, completions: { ...h.completions, [day]: { ...comp, pointsAwarded: allocation[h.id] } } };
  });
  return { points, habits: nextHabits };
}

/**
 * Replaces one local day's bad-habit resist/occurred entries with the ones the server computes
 * (computeBadHabitAwards), and stamps the day's logs with their points. The entries are shown
 * at once and never uploaded; the server's own rows replace them on the next pull.
 */
function applyBadHabitAwardsInternal(
  state: AppState,
  badHabits: BadHabit[],
  logs: BadHabitLog[],
  day: string
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; logs: BadHabitLog[] } {
  const { entries, logPoints } = computeBadHabitAwards(
    badHabits,
    logs,
    state.pointsHistory || [],
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime(),
    getAppStateSeasonPoints(state, leagueNow())
  );

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (entry) =>
    isBadHabitDayEntry(entry, day)
  );
  let points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'> = excised;
  for (const entry of entries) {
    points = addPointsInternal(
      { ...state, ...points },
      entry.amount,
      entry.reason,
      entry.source,
      entry.metadata,
      entry.timestamp,
      entry.id
    );
  }

  const nextLogs = logs.map((l) =>
    l && logPoints.has(l.id) && logPoints.get(l.id) !== l.pointsAwardedOrDeducted
      ? { ...l, pointsAwardedOrDeducted: logPoints.get(l.id)! }
      : l
  );
  return { points, logs: nextLogs };
}

/**
 * Replaces one local day's workout award entry with the one the server computes for these
 * workouts (computeWorkoutAwards), and stamps each of the day's workouts with its points. The
 * entry is shown at once and never uploaded; the server's own row replaces it on the next pull.
 */
function applyWorkoutAwardsInternal(
  state: AppState,
  workouts: WorkoutLog[],
  day: string
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; workouts: WorkoutLog[] } {
  const { entry, workoutPoints } = computeWorkoutAwards(
    workouts,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime()
  );

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (e) => isWorkoutDayEntry(e, day));
  const points = entry
    ? addPointsInternal({ ...state, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
    : excised;

  const nextWorkouts = workouts.map((w) =>
    w && workoutPoints.has(w.id) && workoutPoints.get(w.id) !== w.pointsAwarded ? { ...w, pointsAwarded: workoutPoints.get(w.id)! } : w
  );
  return { points, workouts: nextWorkouts };
}

/**
 * Replaces one local day's skill award entry with the one the server computes for these
 * sessions and skills (computeSkillAwards), and stamps each counted session with its points.
 * The entry is shown at once and never uploaded; the server's own row replaces it on the next pull.
 */
function applySkillAwardsInternal(
  state: AppState,
  skillLogs: SkillSessionLog[],
  skills: Skill[],
  day: string
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; skillLogs: SkillSessionLog[] } {
  const { entry, sessionPoints } = computeSkillAwards(
    skillLogs,
    skills,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime()
  );

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (e) => isSkillDayEntry(e, day));
  const points = entry
    ? addPointsInternal({ ...state, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
    : excised;

  const nextLogs = skillLogs.map((l) =>
    l && sessionPoints.has(l.id) && sessionPoints.get(l.id) !== l.pointsAwarded ? { ...l, pointsAwarded: sessionPoints.get(l.id)! } : l
  );
  return { points, skillLogs: nextLogs };
}

/**
 * Replaces one local day's focus award entry with the one the server computes for these
 * sessions (computeFocusAwards), and stamps each session of the day with its points. The entry
 * is shown at once and never uploaded; the server's own row replaces it on the next pull.
 */
function applyFocusAwardsInternal(
  state: AppState,
  focusLogs: FocusSessionLog[],
  day: string
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; focusLogs: FocusSessionLog[] } {
  const { entry, sessionPoints } = computeFocusAwards(
    focusLogs,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime()
  );

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (e) => isFocusDayEntry(e, day));
  const points = entry
    ? addPointsInternal({ ...state, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
    : excised;

  const nextLogs = focusLogs.map((l) =>
    l && sessionPoints.has(l.id) && sessionPoints.get(l.id) !== l.pointsAwarded ? { ...l, pointsAwarded: sessionPoints.get(l.id)! } : l
  );
  return { points, focusLogs: nextLogs };
}

/**
 * Adds the sobriety milestone awards and take-backs the server computes for the state's tracker
 * (computeRecoveryChanges). The rows are shown at once and never uploaded; the server's own rows
 * replace them on the next pull.
 */
function applyRecoveryAwardsInternal(
  state: AppState
): Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'> {
  let running = state;
  for (const e of computeRecoveryChanges(state.addictionTracker, state.pointsHistory || [], trustedNow().getTime())) {
    running = { ...running, ...addPointsInternal(running, e.amount, e.reason, e.source, e.metadata, e.timestamp, e.id) };
  }
  const { seasonPoints, totalPoints, seasonId, pointsHistory, leagueArchives } = running;
  return { seasonPoints, totalPoints, seasonId, pointsHistory, leagueArchives };
}

/**
 * Replaces one local day's journal award entry with the one the server computes for these
 * entries (computeJournalAward). The entry is shown at once and never uploaded; the server's own
 * row replaces it on the next pull.
 */
function applyJournalAwardInternal(
  state: AppState,
  journalEntries: JournalEntry[],
  day: string
): Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'> {
  const entry = computeJournalAward(journalEntries, day, new Date(`${day}T00:00:00`).getTime(), trustedNow().getTime());
  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (e) => isJournalDayEntry(e, day));
  return entry
    ? addPointsInternal({ ...state, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
    : excised;
}

/**
 * Replaces one local day's reading page award entry with the one the server computes for these
 * logs and books (computeReadingDayAward), and stamps each counted log with its points. The entry
 * is shown at once and never uploaded; the server's own row replaces it on the next pull.
 */
function applyReadingAwardsInternal(
  state: AppState,
  readingLogs: ReadingLog[],
  books: UserBook[],
  day: string
): { points: Pick<AppState, 'seasonPoints' | 'totalPoints' | 'seasonId' | 'pointsHistory' | 'leagueArchives'>; readingLogs: ReadingLog[] } {
  const { entry, logPoints } = computeReadingDayAward(
    readingLogs,
    books,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime()
  );

  const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(state, (e) => isReadingDayEntry(e, day));
  const points = entry
    ? addPointsInternal({ ...state, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
    : excised;

  const nextLogs = readingLogs.map((l) =>
    l && logPoints.has(l.id) && logPoints.get(l.id) !== l.pointsAwarded ? { ...l, pointsAwarded: logPoints.get(l.id)! } : l
  );
  return { points, readingLogs: nextLogs };
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

  const score = calculateWeeklyGoalsPoints(newGoals);
  const earlierSeasonPoints = earlierEntry
    ? earlierEntry.amount || 0
    : calculateWeeklyGoalsPointsBefore(newGoals, seasonStart);
  const newPoints = Math.max(0, score.pointsAwarded - earlierSeasonPoints);

  const timestamp = weeklyGoalAwardTimestamp(newGoals, seasonStart, leagueNow());
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

  const score = calculateWeeklyGoalsPoints(newGoals);
  const newPoints = score.pointsAwarded;
  const entryId = getWeeklyGoalEntryId(targetWeekKey);
  const isWeekEntry = (e: PointsEntry | null | undefined) =>
    Boolean(e && (e.id === entryId || (!isWeeklyGoalSeasonSplitEntryId(e.id) && extractWeekKeyFromWeeklyGoalEntry(e) === targetWeekKey)));

  const currentHistory = baseState.pointsHistory || [];
  const allWeekEntries = currentHistory.filter(isWeekEntry);
  const canonicalTimestamp = weeklyGoalAwardTimestamp(newGoals, getWeekDates(targetWeekKey).start, leagueNow());

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
  now: Date = leagueNow()
): AppState {
  const activeSeasonStart = getSeasonStart(now);
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

export function getLinkedGoalCompletionTimestamp(
  goal: WeeklyGoalItem,
  state: AppState,
  dateStrings: string[]
): string | undefined {
  if (!goal.linkedModule || goal.linkedModule === 'none') {
    return undefined;
  }

  const targetVal = goal.targetValue && goal.targetValue > 0 ? goal.targetValue : 1;

  if (goal.linkedModule === 'habit') {
    const habit = (state.habits || []).find((h) => h.id === goal.linkedItemId);
    if (!habit || !habit.completions) return undefined;

    const entries: { timestamp: string }[] = [];
    if (Array.isArray(habit.completions)) {
      for (const d of habit.completions) {
        if (typeof d === 'string' && dateStrings.includes(d)) {
          const parsed = parseDate(d);
          entries.push({ timestamp: parsed ? parsed.toISOString() : `${d}T12:00:00.000Z` });
        }
      }
    } else {
      for (const [date, c] of Object.entries(habit.completions)) {
        if (c && c.done && dateStrings.includes(date)) {
          const fallbackTime = parseDate(date)?.toISOString() || `${date}T12:00:00.000Z`;
          entries.push({ timestamp: c.updatedAt || fallbackTime });
        }
      }
    }

    entries.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    if (entries.length >= targetVal && targetVal > 0) {
      return entries[targetVal - 1].timestamp;
    }
    return undefined;
  }

  if (goal.linkedModule === 'exercise') {
    let weekWorkouts = (state.workouts || []).filter((w) => dateStrings.includes(w.date));
    const targetWorkoutName = (goal.linkedItemId || '').trim().toLowerCase();
    if (targetWorkoutName) {
      weekWorkouts = weekWorkouts.filter(
        (w) => (w.type || '').trim().toLowerCase() === targetWorkoutName
      );
    }

    const metric = goal.linkedMetricKey || 'workouts_logged';
    const entries = weekWorkouts.map((w) => {
      const fallbackTime = parseDate(w.date)?.toISOString() || `${w.date}T12:00:00.000Z`;
      const timestamp = w.createdAt || fallbackTime;
      let val = 0;
      if (metric === 'workouts_logged') {
        val = 1;
      } else if (metric === 'minutes_exercised') {
        val = w.durationMinutes || 0;
      } else if (metric === 'reps_logged' && (w.unit || '').trim().toLowerCase() === 'reps') {
        val = typeof w.amount === 'number' && !isNaN(w.amount) ? w.amount : 0;
      } else if (metric === 'sets_logged' && (w.unit || '').trim().toLowerCase() === 'sets') {
        val = typeof w.amount === 'number' && !isNaN(w.amount) ? w.amount : 0;
      } else if (metric === 'distance_km' && (w.unit || '').trim().toLowerCase() === 'km') {
        val = typeof w.amount === 'number' && !isNaN(w.amount) ? w.amount : 0;
      }
      return { timestamp, val };
    });

    entries.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    let runningSum = 0;
    for (const entry of entries) {
      runningSum += entry.val;
      if (runningSum >= targetVal) {
        return entry.timestamp;
      }
    }
    return undefined;
  }

  if (goal.linkedModule === 'reading') {
    const logs = (state.readingLogs || []).filter((l) => dateStrings.includes(l.date));
    const matchingBook = (state.libraryBooks || []).find(
      (lb) => lb.id === goal.linkedItemId || lb.linkedBookId === goal.linkedItemId
    );
    const matchingIds = new Set<string>();
    if (goal.linkedItemId) matchingIds.add(goal.linkedItemId);
    if (matchingBook?.id) matchingIds.add(matchingBook.id);
    if (matchingBook?.linkedBookId) matchingIds.add(matchingBook.linkedBookId);

    const filtered = matchingIds.size > 0
      ? logs.filter((l) => Boolean(l.bookId && matchingIds.has(l.bookId)))
      : logs;

    const entries = filtered.map((l) => {
      const fallbackTime = parseDate(l.date)?.toISOString() || `${l.date}T12:00:00.000Z`;
      return {
        timestamp: l.createdAt || fallbackTime,
        val: l.pagesRead || 0,
      };
    });

    entries.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    let runningSum = 0;
    for (const entry of entries) {
      runningSum += entry.val;
      if (runningSum >= targetVal) {
        return entry.timestamp;
      }
    }
    return undefined;
  }

  if (goal.linkedModule === 'skill') {
    const logs = (state.skillLogs || []).filter((l) => dateStrings.includes(l.date));
    const filtered = goal.linkedItemId ? logs.filter((l) => l.skillId === goal.linkedItemId) : logs;
    const metric = goal.linkedMetricKey || 'sessions_logged';

    const entries = filtered.map((l) => {
      const fallbackTime = parseDate(l.date)?.toISOString() || `${l.date}T12:00:00.000Z`;
      const val = metric === 'minutes_practiced' ? (l.durationMinutes || 0) : 1;
      return {
        timestamp: l.createdAt || fallbackTime,
        val,
      };
    });

    entries.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    let runningSum = 0;
    for (const entry of entries) {
      runningSum += entry.val;
      if (runningSum >= targetVal) {
        return entry.timestamp;
      }
    }
    return undefined;
  }

  return undefined;
}

export function reconcileLinkedWeeklyGoals(state: AppState, now: Date = leagueNow()): AppState {
  const currentKey = weekKey(now);
  const docIdx = (state.weeklyGoals || []).findIndex((w) => w.weekKey === currentKey);
  if (docIdx === -1) return state;

  const doc = state.weeklyGoals[docIdx];
  const { dateStrings } = getWeekDates(currentKey);

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
    if (isDone && (!goal.completed && !goal.done)) {
      hasChanges = true;
      const computedCompletedAt = getLinkedGoalCompletionTimestamp(goal, state, dateStrings) || now.toISOString();
      return {
        ...goal,
        completed: true,
        done: true,
        completedAt: goal.completedAt || computedCompletedAt,
      };
    } else if (!isDone && (goal.completed || goal.done)) {
      hasChanges = true;
      return {
        ...goal,
        completed: false,
        done: false,
        completedAt: undefined,
      };
    }

    return goal;
  });

  if (!hasChanges) return state;

  const updatedDoc = { ...doc, goals: updatedGoals };
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
  } else if (!latest && isWeekAwarded) {
    // Reverse what the week actually holds: an award kept at an older value (20) is undone in full.
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

export function useAppState() {
  const [state, setStateRaw] = useState<AppState>(loadInitialState);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  // True while a sign-in made after the initial check (login, sign-up, guest) loads the user's data.
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  // The initial check found no session while this device still holds a saved sign-in (a phone's
  // network not ready yet): the boot loader stays up until Supabase signs it in or drops it, rather
  // than flashing the sign-in page. 'failed' once that takes too long (offline).
  const [storedSessionWait, setStoredSessionWait] = useState<'idle' | 'waiting' | 'failed'>('idle');
  const storedSessionWaitRef = useRef(false);
  const storedSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHydrated = useRef(false);
  const canPersistLocally = useRef(false);
  const authGenerationRef = useRef(0);
  const currentUserRef = useRef<UserProfile | null>(state.currentUser);
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;
  const get = useCallback(() => stateRef.current, []);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const archiveTimer = useRef<number | null>(null);
  const pendingImmediateResolvers = useRef<
    Array<{
      resolve: () => void;
      reject: (err: unknown) => void;
      actionLabel?: string;
      entityId?: string;
    }>
  >([]);
  const isLoggingOutRef = useRef(false);
  const lastPersistedStateRef = useRef<AppState>(state);
  const lastKnownGoodStateRef = useRef<AppState>(state);

  // Other members' standings live in module caches (auth.ts); this version re-renders league views
  // when a refresh writes them.
  const [leagueDataVersion, setLeagueDataVersion] = useState(0);
  const [leagueRefresher] = useState(() =>
    createLeagueStandingsRefresher({
      sessionUserId: async () =>
        isSupabaseConfigured ? (await supabase.auth.getSession()).data?.session?.user?.id ?? null : null,
      fetchProfiles: fetchAllProfilesFromSupabase,
      fetchPoints: (now) => fetchLeaguePointsFromSupabase(getLeaguePointsPeriods(now)),
      now: leagueNow,
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
      apply: ({ profiles, points }) => {
        if (profiles) setCachedProfiles(profiles);
        if (points) setCachedLeaguePoints(points);
        setLeagueDataVersion((v) => v + 1);
      },
    })
  );
  /** Refetches other members' standings; `full` skips the 15 s throttle (sign-in, new period). */
  const refreshLeagueStandings = leagueRefresher.refresh;
  /** Sign-out: the next account must not see this viewer's standings. */
  const clearLeagueStandings = useCallback(() => {
    leagueRefresher.reset();
    setCachedProfiles([]);
    setCachedLeaguePoints(null);
    setLeagueDataVersion((v) => v + 1);
  }, [leagueRefresher]);

  const [destructiveWipeModal, setDestructiveWipeModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    stateToRetry: AppState;
    stateBeforeAction: AppState;
  } | null>(null);
  const [isSavingDestructiveWipe, setIsSavingDestructiveWipe] = useState(false);

  // Write-serialization queue: guarantees sequential execution of persistState calls
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueuePersist = useCallback(
    (stateToPersist: AppState, options?: { allowDestructiveWipe?: boolean }): Promise<void> => {
      let callResolve!: () => void;
      let callReject!: (err: unknown) => void;
      const callerPromise = new Promise<void>((resolve, reject) => {
        callResolve = resolve;
        callReject = reject;
      });

      writeQueueRef.current = writeQueueRef.current
        .catch(() => {
          // Isolate queue failures: prior failure does not prevent subsequent writes
        })
        .then(async () => {
          try {
            await persistState(stateToPersist, options);
            lastKnownGoodStateRef.current = stateToPersist;
            // Mirror what the blob accepted into the relational tables (DB normalization S2).
            recordSyncedChanges(stateToPersist);
            callResolve();
          } catch (err) {
            callReject(err);
            // Re-throw so downstream catch catches, but queue next tick remains unblocked
            throw err;
          }
        });

      writeQueueRef.current.catch(() => {}); // Suppress console-level unhandled rejection on stored ref; caller still gets real error via callerPromise

      return callerPromise;
    },
    []
  );

  const handleConfirmDestructiveWipe = useCallback(async () => {
    if (!destructiveWipeModal?.stateToRetry) {
      setDestructiveWipeModal(null);
      return;
    }
    const stateToSave = destructiveWipeModal.stateToRetry;
    setIsSavingDestructiveWipe(true);
    try {
      await enqueuePersist(stateToSave, { allowDestructiveWipe: true });
      lastPersistedStateRef.current = stateToSave;
      lastKnownGoodStateRef.current = stateToSave;
      setStateRaw(stateToSave);
      if (typeof window !== 'undefined') {
        try {
          if (stateToSave.currentUser?.id) {
            localStorage.setItem(`ascend_user_cache_${stateToSave.currentUser.id}`, JSON.stringify(stateToSave));
            localStorage.removeItem(`ascend_dirty_${stateToSave.currentUser.id}`);
          } else {
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(stateToSave));
          }
        } catch {
          /* ignore */
        }
      }
      if (stateToSave.currentUser?.id) {
        resetUserDataWatermark(stateToSave.currentUser.id, stateToSave);
      }
      setDestructiveWipeModal(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app-toast-success', {
            detail: {
              title: 'Changes saved',
              message: 'Your changes are saved.',
            },
          })
        );
      }
    } catch (err: any) {
      console.error('[CONFIRM DESTRUCTIVE SAVE] Error persisting confirmed state:', err);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app-toast-error', {
            detail: {
              title: "Couldn't save your changes",
              message: toUserMessage(err, "Your changes weren't saved. Try again."),
            },
          })
        );
      }
    } finally {
      setIsSavingDestructiveWipe(false);
    }
  }, [destructiveWipeModal, enqueuePersist]);

  const handleCancelDestructiveWipe = useCallback(() => {
    if (destructiveWipeModal?.stateBeforeAction) {
      const preDeleteState = destructiveWipeModal.stateBeforeAction;
      lastPersistedStateRef.current = preDeleteState;
      lastKnownGoodStateRef.current = preDeleteState;
      setStateRaw(preDeleteState);
      if (typeof window !== 'undefined') {
        try {
          if (preDeleteState.currentUser?.id) {
            localStorage.setItem(`ascend_user_cache_${preDeleteState.currentUser.id}`, JSON.stringify(preDeleteState));
            localStorage.removeItem(`ascend_dirty_${preDeleteState.currentUser.id}`);
          } else {
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(preDeleteState));
          }
        } catch {
          /* ignore */
        }
      }
    }
    setDestructiveWipeModal(null);
  }, [destructiveWipeModal]);

  // Cross-tab synchronization tracking
  const tabId = useRef<string>(Math.random().toString(36).substring(2) + trustedNowMs().toString(36)).current;
  const isRemoteBroadcastUpdate = useRef(false);
  const inFlightHabitToggles = useRef<Set<string>>(new Set());

  useEffect(() => {
    currentUserRef.current = state.currentUser;
  }, [state.currentUser]);

  // `immediate` saves at once instead of debouncing. Deletes start that save but do not wait for
  // it: the change is local and mirrored at once, a failed save shows its own toast, and the
  // dirty flag retries it on reconnect.
  const setState = useCallback(
    (
      updater: AppState | ((prev: AppState) => AppState),
      options?: { immediate?: boolean; actionLabel?: string; entityId?: string }
    ) => {
      let immediatePromise: Promise<void> | undefined;
      if (options?.immediate) {
        let callResolve!: () => void;
        let callReject!: (err: unknown) => void;
        immediatePromise = new Promise<void>((resolve, reject) => {
          callResolve = resolve;
          callReject = reject;
        });
        pendingImmediateResolvers.current.push({
          resolve: callResolve,
          reject: callReject,
          actionLabel: options.actionLabel,
          entityId: options.entityId,
        });
        // Suppress unhandled rejection on the promise itself so non-awaiting callers never produce console warnings
        immediatePromise.catch(() => {});
      }
      setStateRaw(updater);
      return immediatePromise;
    },
    []
  );

  // Relational tables (DB normalization): send pending ops first, then merge server rows into state.
  const syncTables = useCallback(
    async (userId: string, full: boolean) => {
      await flushOutbox(userId);
      const changes = await pullSyncedRows(userId, full);
      if (changes.length === 0) return;
      setState((prev) => (prev.currentUser?.id === userId ? applyRemoteChanges(prev, changes) : prev));
    },
    [setState]
  );

  // Live updates from the user's other devices.
  const syncedUserId = state.currentUser?.id;
  useEffect(() => {
    if (!syncedUserId || !isSupabaseConfigured) return;
    let channel = supabase.channel(`synced_tables_${syncedUserId}`);
    for (const collection of SYNCED_COLLECTIONS) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: collection.table, filter: `user_id=eq.${syncedUserId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown> | undefined;
          if (!row || !row.id) return;
          const changes = prepareRemoteRows(syncedUserId, collection, [row]);
          if (changes.length === 0) return;
          setState((prev) => (prev.currentUser?.id === syncedUserId ? applyRemoteChanges(prev, changes) : prev));
        }
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [syncedUserId, setState]);

  // FIX 1: Frontend Cross-Tab Sync via BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel(STATE_SYNC_CHANNEL_NAME);

    channel.onmessage = (event: MessageEvent<StateSyncMessage>) => {
      const data = event.data;
      if (!data || data.type !== 'ASCEND_STATE_SYNC') return;
      if (data.senderTabId === tabId) return; // Ignore own broadcast

      const incomingUserId = data.userId;
      const currentUserId = currentUserRef.current?.id;

      // Prevent syncing across different user accounts
      if (incomingUserId && currentUserId && incomingUserId !== currentUserId) {
        return;
      }

      if (!data.state) return;

      isRemoteBroadcastUpdate.current = true;
      setStateRaw((current) => {
        // When receiving a state broadcast from another tab, that tab's state is the authoritative
        // recent snapshot of user mutations. Set directly to prevent un-deleting items via union merge.
        const targetState = data.state;
        if (current.currentUser && !targetState.currentUser) {
          return { ...targetState, currentUser: current.currentUser };
        }
        return targetState;
      });
    };

    return () => {
      channel.close();
    };
  }, [tabId]);

  // FIX 3: Network Reconnection & Tab Focus Sync (with Anti-Spam Throttle)
  const lastSyncTimeRef = useRef<number>(trustedNowMs());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isSyncing = false;
    const SYNC_THROTTLE_MS = 180000; // 3 minutes

    const handleReconnectAndSync = async (force = false) => {
      if (isSyncing) return;
      const now = trustedNowMs();
      if (!force && now - lastSyncTimeRef.current < SYNC_THROTTLE_MS) {
        return;
      }

      const userId = currentUserRef.current?.id;
      if (!userId || !isHydrated.current || !isSupabaseConfigured) return;
      void syncTables(userId, false);

      try {
        isSyncing = true;
        console.log('[SYNC] Network reconnected or tab visible, reconciling server state...');
        const serverRes = await fetchUserDataWithStatusFromSupabase(userId);
        if (serverRes.exists && serverRes.state) {
          lastSyncTimeRef.current = trustedNowMs();
          setStateRaw((current) => {
            // Reconcile and union-merge server state with current state using mergeAppState
            // Tombstones (deletedEntityIds) prevent resurrecting deleted items while preserving offline progress
            const serverState = serverRes.state!;
            const merged = reconcileWeeklyGoalsPointsForAllWeeks(
              reconcileLinkedWeeklyGoals(
                mergeAppState(serverState, current, 'hydration'),
                leagueNow()
              ),
              leagueNow()
            );
            setUserDataWatermark(userId, merged);
            lastKnownGoodStateRef.current = merged;
            return merged;
          });
        }
      } catch (e) {
        console.error('[SYNC] Error syncing state on reconnection/visibility:', e);
      } finally {
        isSyncing = false;
        // OUTBOUND RETRY PUSH: the dirty flag stays set until a save succeeds, so changes made
        // offline (or a save that failed) are pushed whether or not the inbound fetch worked.
        if (localStorage.getItem(`ascend_dirty_${userId}`)) {
          console.log('[SYNC] Triggering outbound retry-push for unsaved changes');
          setState((prev) => ({ ...prev }), { immediate: true, actionLabel: 'Pending changes' });
        }
      }
    };

    const onOnline = () => {
      // Force immediate sync upon network reconnection
      handleReconnectAndSync(true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Throttled sync when returning to tab
        handleReconnectAndSync(false);
      }
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isRemoteBroadcastUpdate.current) {
      // This state update was synced from another tab via BroadcastChannel.
      // Skip duplicate persistence and re-broadcast.
      isRemoteBroadcastUpdate.current = false;
      lastPersistedStateRef.current = state;
      return;
    }

    lastPersistedStateRef.current = state;

    if (canPersistLocally.current) {
      // Synchronous, network-independent local-mirror write for resilient offline reload and debounce-window protection
      if (typeof window !== 'undefined') {
        try {
          if (state.currentUser?.id) {
            const uid = state.currentUser.id;
            localStorage.setItem(`ascend_user_cache_${uid}`, JSON.stringify(state));
            if (computeStateDataWeight(state).itemCount > 0) {
              localStorage.setItem(`ascend_dirty_${uid}`, '1');
            }
          } else {
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
          }
        } catch {
          /* ignore quota/security error */
        }
      }

      // Broadcast state to all other tabs immediately
      broadcastStateToTabs(state, tabId);
    }

    if (isHydrated.current) {
      if (pendingImmediateResolvers.current.length > 0) {
        const resolversToDrain = [...pendingImmediateResolvers.current];
        pendingImmediateResolvers.current = [];
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
          debounceTimer.current = null;
        }
        enqueuePersist(state)
          .then(() => {
            if (typeof window !== 'undefined' && state.currentUser?.id) {
              localStorage.removeItem(`ascend_dirty_${state.currentUser.id}`);
            }
            resolversToDrain.forEach(({ resolve }) => resolve());
          })
          .catch((err) => {
            resolversToDrain.forEach(({ reject }) => reject(err));
            console.error('[AUTOSAVE IMMEDIATE] Failed to persist state:', err);
            if (typeof window !== 'undefined') {
              const isGuard = err instanceof GuardBlockedError;

              // If guard triggered a destructive wipe or abnormal drop, route to confirmation modal instead of a dead-end toast
              if (isGuard && (err.requiresConfirmation || err.code === 'ZERO_OUT_WIPE' || err.code === 'ABNORMAL_DROP')) {
                const isZeroOut = err.code === 'ZERO_OUT_WIPE';
                setDestructiveWipeModal({
                  open: true,
                  title: isZeroOut ? 'Clear all tracked data?' : 'Remove most of your data?',
                  description: isZeroOut
                    ? 'This removes all remaining tracked items from your account. Save this change?'
                    : 'This removes most of your tracked items. Save this change?',
                  stateToRetry: state,
                  stateBeforeAction: lastKnownGoodStateRef.current,
                });
                return;
              }

              // Collect distinct action labels
              const distinctLabels = Array.from(
                new Set(
                  resolversToDrain
                    .map((r) => r.actionLabel)
                    .filter((label): label is string => Boolean(label && label.trim()))
                )
              );

              // Distinct entity IDs for dedupKey if known
              const distinctEntityIds = Array.from(
                new Set(
                  resolversToDrain
                    .map((r) => r.entityId)
                    .filter((id): id is string => Boolean(id && id.trim()))
                )
              );

              let toastTitle: string;
              if (distinctLabels.length === 1) {
                toastTitle = isGuard
                  ? `${distinctLabels[0]} not saved`
                  : `${distinctLabels[0]} failed`;
              } else {
                toastTitle = isGuard ? 'Save stopped to protect your data' : "Couldn't save your changes";
              }

              const toastMessage = isGuard
                ? "This change would have erased a lot of your data, so we didn't save it. Nothing was lost."
                : "They're kept on this device for now. Check your connection.";

              const dedupKey =
                distinctEntityIds.length === 1
                  ? `${distinctLabels[0] || 'immediate'}_${distinctEntityIds[0]}`
                  : undefined;

              window.dispatchEvent(
                new CustomEvent('app-toast-error', {
                  detail: {
                    title: toastTitle,
                    message: toastMessage,
                    dedupKey,
                  },
                })
              );
              window.dispatchEvent(new CustomEvent('app-network-error'));
            }
          });
      } else {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(async () => {
          try {
            await enqueuePersist(state);
            if (typeof window !== 'undefined' && state.currentUser?.id) {
              localStorage.removeItem(`ascend_dirty_${state.currentUser.id}`);
            }
          } catch (err) {
            console.error('[AUTOSAVE DEBOUNCED] Failed to persist state:', err);
            if (typeof window !== 'undefined') {
              const isGuard = err instanceof GuardBlockedError;

              // If guard triggered a destructive wipe or abnormal drop, route to confirmation modal instead of a dead-end toast
              if (isGuard && (err.requiresConfirmation || err.code === 'ZERO_OUT_WIPE' || err.code === 'ABNORMAL_DROP')) {
                const isZeroOut = err.code === 'ZERO_OUT_WIPE';
                setDestructiveWipeModal({
                  open: true,
                  title: isZeroOut ? 'Clear all tracked data?' : 'Remove most of your data?',
                  description: isZeroOut
                    ? 'This removes all remaining tracked items from your account. Save this change?'
                    : 'This removes most of your tracked items. Save this change?',
                  stateToRetry: state,
                  stateBeforeAction: lastKnownGoodStateRef.current,
                });
                return;
              }

              window.dispatchEvent(
                new CustomEvent('app-toast-error', {
                  detail: {
                    title: isGuard ? 'Save stopped to protect your data' : "Couldn't save your changes",
                    message: isGuard
                      ? "This change would have erased a lot of your data, so we didn't save it. Nothing was lost."
                      : "They're kept on this device for now. Check your connection.",
                  },
                })
              );
              window.dispatchEvent(new CustomEvent('app-network-error'));
            }
          }
        }, 500);
      }
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, tabId]);

  // Reactively apply data-theme attribute on document.documentElement based on themePreference
  useEffect(() => {
    const local = getLocalThemePreference();
    const theme = state.themePreference || local || 'dark';
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    setLocalThemePreference(theme);
  }, [state.themePreference, state.currentUser]);

  // Initial Supabase data load & auth listener (single source of truth for session state)
  useEffect(() => {
    let mounted = true;

    /** Starts (or continues) waiting on a saved sign-in; false when the device holds none. */
    const holdForStoredSession = (): boolean => {
      if (storedSessionWaitRef.current) return true;
      if (!storedAuthSession()) return false;
      storedSessionWaitRef.current = true;
      setStoredSessionWait('waiting');
      storedSessionTimerRef.current = setTimeout(() => {
        if (mounted) setStoredSessionWait('failed');
      }, STORED_SESSION_WAIT_MS);
      return true;
    };
    const endStoredSessionWait = () => {
      if (!storedSessionWaitRef.current) return;
      storedSessionWaitRef.current = false;
      if (storedSessionTimerRef.current) clearTimeout(storedSessionTimerRef.current);
      storedSessionTimerRef.current = null;
      setStoredSessionWait('idle');
    };

    async function initSupabaseData() {
      if (!isSupabaseConfigured) {
        if (mounted) setIsAuthChecking(false);
        return;
      }

      try {
        const [publicPlans, sessionRes] = await Promise.all([
          fetchPublicPlansFromSupabase(),
          supabase.auth.getSession(),
          refreshLeagueStandings({ full: true }),
        ]);

        if (mounted) {
          setCachedPublicPlans(publicPlans);
          if (!sessionRes.data?.session && !holdForStoredSession()) {
            setIsAuthChecking(false);
          }
        }
      } catch (e) {
        console.error('Error loading Supabase data:', e);
        if (mounted && !holdForStoredSession()) setIsAuthChecking(false);
      }
    }

    initSupabaseData();

    // SINGLE SOURCE OF TRUTH: onAuthStateChange is the ONLY place that sets authenticated
    // app state. auth.ts functions (loginUser/signUpUser) only call Supabase Auth APIs and
    // return — they never hydrate state themselves. This eliminates the race condition.
    //
    // IMPORTANT: Do not use async/await directly in this callback — it deadlocks
    // signInWithPassword/signUp in the browser. Defer all async work via setTimeout.
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setTimeout(async () => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          endStoredSessionWait();
          const myGeneration = ++authGenerationRef.current;
          clearLeagueStandings();

          if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
            debounceTimer.current = null;
          }
          pendingImmediateResolvers.current = [];
          isHydrated.current = false;
          canPersistLocally.current = false;
          currentUserRef.current = null;

          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem('ascend_active_focus_session');
              sessionStorage.removeItem('ascend_focus_tab_alive');
            } catch (e) {
              /* ignore */
            }
          }
          const localTheme = getLocalThemePreference() || 'dark';
          const guestRaw = localStorage.getItem(GUEST_STORAGE_KEY);
          let guestState = DEFAULT_STATE;
          if (guestRaw) {
            try {
              guestState = JSON.parse(guestRaw);
            } catch {
              /* use default */
            }
          }
          const sanitized = sanitizeLoadedState(guestState, null);
          const nextGuestState: AppState = {
            ...sanitized,
            themePreference: localTheme,
          };
          if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', localTheme);
          }
          if (myGeneration !== authGenerationRef.current) return;
          setState(nextGuestState);
          setIsAuthChecking(false);
          setIsSessionLoading(false);
          return;
        }

        if (
          (event === 'INITIAL_SESSION' ||
            event === 'SIGNED_IN' ||
            event === 'USER_UPDATED' ||
            // A saved sign-in coming back by a token refresh (the auto-refresh tick) after the wait.
            (event === 'TOKEN_REFRESHED' && storedSessionWaitRef.current)) &&
          session?.user
        ) {
          endStoredSessionWait();
          if (event !== 'USER_UPDATED' && isHydrated.current && currentUserRef.current?.id === session.user.id) {
            setIsAuthChecking(false);
            return;
          }

          const myGeneration = ++authGenerationRef.current;
          if (event === 'SIGNED_IN') setIsSessionLoading(true);
          // A member signed in after boot (or a different one) gets the standings their session can see.
          void refreshLeagueStandings({ full: leagueRefresher.fetchedUserId() !== session.user.id });

          const userId = session.user.id;
          const email = session.user.email || '';

          // Read signup defaults stored by signUpUser(), if this is a fresh signup
          let signupDefaults: { username: string; avatar: string } | undefined;
          try {
            const raw = sessionStorage.getItem('ascend_signup_defaults');
            if (raw) {
              signupDefaults = JSON.parse(raw);
              sessionStorage.removeItem('ascend_signup_defaults');
            }
          } catch {
            // sessionStorage unavailable — ignore
          }

          // 15-second hard timeout: if hydration hangs, abort gracefully
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Auth hydration timed out after 15s')), 15000)
          );

          try {
            const { user, state: hydratedState } = await Promise.race([
              hydrateUserSession(userId, email, session.user, signupDefaults),
              timeoutPromise,
            ]);
            // Penalties, streaks and season rollovers below decide days by the clock: wait for
            // the server time and the season master values (at most a few seconds each) so a
            // moved device clock cannot steer them.
            await Promise.all([clockReady(), syncSeasonConfig()]);

            if (mounted) {
              if (myGeneration !== authGenerationRef.current) return;
              isHydrated.current = true;
              canPersistLocally.current = true;
              const sanitizedState = sanitizeLoadedState(hydratedState, user);
              // Send relational ops left over from an earlier session; hydration already read every row.
              void syncTables(userId, false);
              if (sanitizedState.themePreference) {
                setLocalThemePreference(sanitizedState.themePreference);
                if (typeof document !== 'undefined') {
                  document.documentElement.setAttribute('data-theme', sanitizedState.themePreference);
                }
              }

              let baseCurrentState = stateRef.current;
              if (typeof window !== 'undefined' && userId) {
                try {
                  const isDirty = Boolean(localStorage.getItem(`ascend_dirty_${userId}`));
                  if (isDirty) {
                    const cachedRaw = localStorage.getItem(`ascend_user_cache_${userId}`);
                    if (cachedRaw) {
                      const parsed = JSON.parse(cachedRaw);
                      if (parsed && typeof parsed === 'object') {
                        baseCurrentState = sanitizeLoadedState(parsed, user);
                      } else {
                        localStorage.removeItem(`ascend_dirty_${userId}`);
                      }
                    } else {
                      localStorage.removeItem(`ascend_dirty_${userId}`);
                    }
                  }
                } catch {
                  localStorage.removeItem(`ascend_dirty_${userId}`);
                }
              }

              const watermark = userId ? getUserDataWatermark(userId) : undefined;
              const guardResult = mergeAppStateWithGuardResult(sanitizedState, baseCurrentState, watermark);

              const rawMergedState = guardResult.hasSuspiciousDrop
                ? guardResult.retainedState
                : withHydratedPoints(guardResult.mergedState, sanitizedState);
              const reconciledMergedState = reconcileWeeklyGoalsPointsForAllWeeks(
                reconcileLinkedWeeklyGoals(rawMergedState, leagueNow()),
                leagueNow()
              );

              lastKnownGoodStateRef.current = reconciledMergedState;

              setState(reconciledMergedState);

              if (guardResult.hasSuspiciousDrop) {
                const isZeroOut = guardResult.mergedCount === 0;
                setDestructiveWipeModal({
                  open: true,
                  title: isZeroOut ? 'Clear all tracked data?' : 'Remove most of your data?',
                  description: isZeroOut
                    ? 'This removes all remaining tracked items from your account. Save this change?'
                    : `${guardResult.droppedCount} items are missing compared to your last save. Save these removals, or keep your existing data?`,
                  stateToRetry: guardResult.mergedState,
                  stateBeforeAction: guardResult.retainedState,
                });
              }
            }
          } catch (e) {
            console.error('Error hydrating auth session:', e);
            // If hydration fails or times out, attempt to restore from local cache first
            if (mounted) {
              if (myGeneration !== authGenerationRef.current) return;
              let cachedState: AppState | null = null;
              if (typeof window !== 'undefined') {
                try {
                  const cachedRaw = localStorage.getItem(`ascend_user_cache_${userId}`);
                  if (cachedRaw) {
                    cachedState = JSON.parse(cachedRaw);
                  }
                } catch {
                  /* ignore */
                }
              }

              const fallbackUser: UserProfile = {
                id: userId,
                uid: cachedState?.currentUser?.uid || generateNumericUID(),
                email,
                username: session.user.user_metadata?.username || email.split('@')[0],
                avatar: session.user.user_metadata?.avatar || '🧑',
                createdAt: session.user.created_at || trustedNow().toISOString(),
                isProfilePublic: true,
              };

              // CRITICAL: isHydrated MUST remain false so no empty/fallback state is auto-saved over Supabase
              isHydrated.current = false;

              if (cachedState) {
                const sanitizedCached = sanitizeLoadedState(cachedState, fallbackUser);
                setState((current) =>
                  reconcileWeeklyGoalsPointsForAllWeeks(
                    reconcileLinkedWeeklyGoals(mergeAppState(sanitizedCached, current, 'hydration'), leagueNow()),
                    leagueNow()
                  )
                );
                canPersistLocally.current = true;
              } else {
                let resultingState: AppState = stateRef.current;
                setState((prev) => {
                  if (prev.currentUser?.id === userId) {
                    resultingState = prev;
                    return prev;
                  }
                  resultingState = {
                    ...prev,
                    currentUser: fallbackUser,
                    username: fallbackUser.username,
                  };
                  return resultingState;
                });
                if (computeStateDataWeight(resultingState).itemCount === 0) {
                  canPersistLocally.current = true;
                }
              }
            }
          } finally {
            if (mounted && myGeneration === authGenerationRef.current) setIsSessionLoading(false);
            if (mounted) setIsAuthChecking(false);
          }
        } else if (!session?.user && holdForStoredSession()) {
          // No session yet, but a saved sign-in: keep the boot loader (see storedSessionWait).
        } else {
          if (mounted) setIsAuthChecking(false);
        }
      }, 0);
    });

    return () => {
      mounted = false;
      if (storedSessionTimerRef.current) clearTimeout(storedSessionTimerRef.current);
      authListener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Real-time synchronization listener for cross-tab / multi-user updates
  useEffect(() => {
    const unsubscribe = syncBroadcaster.subscribe((event, payload) => {
      // A plan deleted in another tab leaves this tab's public-plan cache and plan list too.
      if (event === 'PLAN_DELETED') removeCachedPublicPlan(payload.planId);
      setState((prev) => {
        if (event === 'PLAN_DELETED') {
          if (!prev.improvementPlans.some((p) => p.id === payload.planId)) return prev;
          return { ...prev, improvementPlans: prev.improvementPlans.filter((p) => p.id !== payload.planId) };
        }

        if (event === 'PLAN_CREATED' || event === 'PLAN_UPDATED') {
          // The channel is shared by every tab in the browser, whichever account it is signed in to.
          // Payloads can be partial ({ id, copyCount }), so they merge into a plan this tab already has,
          // and a new plan is only added when it is a full plan owned by this tab's user.
          const exists = prev.improvementPlans.some((p) => p.id === payload.id);
          if (exists) {
            return {
              ...prev,
              improvementPlans: prev.improvementPlans.map((p) => (p.id === payload.id ? { ...p, ...payload } : p)),
            };
          }
          const isOwnFullPlan = Boolean(payload.title) && Boolean(prev.currentUser?.id) && payload.creatorId === prev.currentUser?.id;
          if (!isOwnFullPlan) return prev;
          return { ...prev, improvementPlans: [payload, ...prev.improvementPlans] };
        }

        if (event === 'PARTNER_INVITE_SENT') {
          const invite = payload.invite || payload;
          const notif = payload.notification;

          if (
            invite.toUsername.toLowerCase() === prev.username.toLowerCase() ||
            (prev.currentUser?.id && invite.toUserId === prev.currentUser.id)
          ) {
            const inviteExists = prev.partnerInvites.some((i) => i.id === invite.id);
            const updatedInvites = inviteExists ? prev.partnerInvites : [invite, ...prev.partnerInvites];

            let updatedNotifs = prev.notifications || [];
            const notifObject: AppNotification = notif || {
              id: crypto.randomUUID(),
              recipientId: invite.toUserId,
              actorId: invite.fromUserId,
              actorUsername: invite.fromUsername,
              actorAvatar: invite.fromAvatar || '🧑',
              type: 'partner_invite',
              title: 'New Partner Invite',
              message: `${invite.fromUsername} sent you an accountability partner invite!`,
              payload: { inviteId: invite.id },
              read: false,
              createdAt: trustedNow().toISOString(),
            };

            if (!updatedNotifs.some((n) => n.payload?.inviteId === invite.id || n.id === notifObject.id)) {
              updatedNotifs = [notifObject, ...updatedNotifs];
            }

            return {
              ...prev,
              partnerInvites: updatedInvites,
              notifications: updatedNotifs,
            };
          }
        }

        if (event === 'PARTNER_INVITE_CANCELLED') {
          return {
            ...prev,
            partnerInvites: prev.partnerInvites.filter((i) => i.id !== payload.inviteId),
          };
        }

        if (event === 'PARTNER_ACCEPTED') {
          if (prev.deletedEntityIds?.includes(payload.id)) return prev;
          const myId = prev.currentUser?.id;
          if (
            (myId && (payload.user1Id === myId || payload.user2Id === myId)) ||
            payload.user1Username.toLowerCase() === prev.username.toLowerCase() ||
            payload.user2Username.toLowerCase() === prev.username.toLowerCase()
          ) {
            const updatedPartnerships = [payload, ...(prev.partnerships || []).filter((p) => p.id !== payload.id)];
            return {
              ...prev,
              partnerInvites: prev.partnerInvites.filter(
                (i) =>
                  !(
                    (i.fromUsername.toLowerCase() === payload.user1Username.toLowerCase() &&
                      i.toUsername.toLowerCase() === payload.user2Username.toLowerCase()) ||
                    (i.fromUsername.toLowerCase() === payload.user2Username.toLowerCase() &&
                      i.toUsername.toLowerCase() === payload.user1Username.toLowerCase())
                  )
              ),
              partnerships: updatedPartnerships,
              partnership: updatedPartnerships[0] || null,
            };
          }
        }

        if (event === 'PARTNER_ENDED') {
          const targetId = payload.partnershipId;
          const updatedPartnerships = (prev.partnerships || []).filter((p) => p.id !== targetId);
          return {
            ...prev,
            partnerships: updatedPartnerships,
            partnership: updatedPartnerships[0] || null,
            sharedChallenges: prev.sharedChallenges.filter((c) => c.partnershipId !== targetId),
          };
        }

        if (event === 'CHALLENGE_UPDATED') {
          if (
            (prev.deletedEntityIds || []).includes(payload.id) ||
            (prev.deletedEntityIds || []).includes(payload.partnershipId)
          ) {
            return prev;
          }

          const partnershipExists =
            (prev.partnerships || []).some((p) => p.id === payload.partnershipId) ||
            prev.partnership?.id === payload.partnershipId;
          if (!partnershipExists) {
            return prev;
          }

          const exists = prev.sharedChallenges.some((c) => c.id === payload.id);
          if (exists) {
            return {
              ...prev,
              sharedChallenges: prev.sharedChallenges.map((c) =>
                c.id === payload.id ? mergeSharedChallenge(c, payload) : c
              ),
            };
          } else {
            return {
              ...prev,
              sharedChallenges: [payload, ...prev.sharedChallenges],
            };
          }
        }

        if (event === 'CHALLENGE_DELETED') {
          return {
            ...prev,
            sharedChallenges: prev.sharedChallenges.filter((c) => c.id !== payload.challengeId),
          };
        }

        return prev;
      });
    });

    return () => unsubscribe();
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smart Realtime Subscriptions with adaptive fallback polling
  useEffect(() => {
    if (!state.currentUser?.id) return;
    const userId = state.currentUser.id;
    const username = state.username;

    const syncPartnerDataLive = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }
      try {
        const fetchedInvites = await fetchPartnerInvitesSupabase(userId, username);
        const activePartnerships = await fetchPartnershipsSupabase(userId);
        const pIds = activePartnerships.map((p) => p.id);
        const challenges = pIds.length > 0 ? await fetchSharedChallengesSupabase(pIds) : [];
        const fetchedNotifs = await fetchNotificationsSupabase(userId);

        const tombstoneSet = new Set(state.deletedEntityIds || []);
        
        // Deduplicate partnerships by user pair
        const dedupPartnershipsMap = new Map<string, Partnership>();
        for (const p of activePartnerships) {
          if (!p || tombstoneSet.has(p.id)) continue;
          const u1 = (p.user1Username || '').toLowerCase();
          const u2 = (p.user2Username || '').toLowerCase();
          const key = [u1, u2].sort().join(':::');
          if (!dedupPartnershipsMap.has(key)) {
            dedupPartnershipsMap.set(key, p);
          }
        }
        const filteredPartnerships = Array.from(dedupPartnershipsMap.values());

        let validInvites = fetchedInvites.filter((inv) => !tombstoneSet.has(inv.id));
        if (filteredPartnerships.length > 0) {
          const activePartnerUsernames = new Set(
            filteredPartnerships.flatMap((p) => [p.user1Username.toLowerCase(), p.user2Username.toLowerCase()])
          );
          const activePartnerUserIds = new Set(
            filteredPartnerships.flatMap((p) => [p.user1Id, p.user2Id])
          );

          validInvites = fetchedInvites.filter((inv) => {
            if (inv.status !== 'pending' || tombstoneSet.has(inv.id)) return false;
            const otherUserId = inv.fromUserId === userId ? inv.toUserId : inv.fromUserId;
            const otherUsername = (
              inv.fromUsername.toLowerCase() === username.toLowerCase() ? inv.toUsername : inv.fromUsername
            ).toLowerCase();

            const isAlreadyPartner =
              (otherUserId && activePartnerUserIds.has(otherUserId)) ||
              (otherUsername && activePartnerUsernames.has(otherUsername));

            return !isAlreadyPartner;
          });

          // Clean up stale invites in Supabase DB for all active partnerships
          for (const p of filteredPartnerships) {
            cleanupPendingInvitesBetweenUsersSupabase(p.user1Id, p.user1Username, p.user2Id, p.user2Username).catch(() => {});
          }
        }

        setState((prev) => {
          const currentTombstones = new Set(prev.deletedEntityIds || []);

          // 1. Reconcile notifications
          const mergedNotifs = fetchedNotifs
            .filter((fn) => !currentTombstones.has(fn.id))
            .map((fn) => {
              const local = prev.notifications?.find((n) => n.id === fn.id);
              return local && local.read ? { ...fn, read: true } : fn;
            });

          // 2. Reconcile partnerships (authoritative from DB, filtered by tombstones)
          const mergedPartnershipsMap = new Map<string, Partnership>();
          for (const p of filteredPartnerships) {
            if (!p || currentTombstones.has(p.id)) continue;
            const u1 = (p.user1Username || '').toLowerCase();
            const u2 = (p.user2Username || '').toLowerCase();
            const key = [u1, u2].sort().join(':::');
            if (!mergedPartnershipsMap.has(key)) {
              mergedPartnershipsMap.set(key, p);
            }
          }
          const finalPartnerships = Array.from(mergedPartnershipsMap.values());
          const finalActivePartnershipIds = new Set(finalPartnerships.map((p) => p.id));

          // 3. Reconcile shared challenges (authoritative active challenges from DB, merged lifecycle, filter tombstones)
          const challengeMap = new Map<string, SharedChallenge>();
          for (const c of challenges) {
            if (!c || currentTombstones.has(c.id) || currentTombstones.has(c.partnershipId)) continue;
            if (!finalActivePartnershipIds.has(c.partnershipId)) continue;
            const existing = (prev.sharedChallenges || []).find((sc) => sc.id === c.id);
            const merged = existing ? mergeSharedChallenge(existing, c) : c;
            challengeMap.set(c.id, reconcileSharedChallengeLifecycle(merged));
          }
          const finalSharedChallenges = Array.from(challengeMap.values());

          const next = {
            partnerInvites: validInvites,
            partnerships: finalPartnerships,
            partnership: finalPartnerships[0] || null,
            sharedChallenges: finalSharedChallenges,
            notifications: mergedNotifs,
          };
          // The fallback poll runs every 10 s: when the server has nothing new, keep the same
          // state object so the whole app does not re-render for nothing.
          const unchanged = (Object.keys(next) as (keyof typeof next)[]).every(
            (key) => JSON.stringify(prev[key] ?? null) === JSON.stringify(next[key] ?? null)
          );
          if (unchanged) return prev;
          return { ...prev, ...next };
        });
      } catch (e) {
        /* ignore background sync error */
      }
    };

    let pollInterval: any = null;

    const startFallbackPolling = () => {
      if (!pollInterval && (typeof navigator === 'undefined' || navigator.onLine)) {
        pollInterval = setInterval(syncPartnerDataLive, 10000);
      }
    };

    const stopFallbackPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    let isSubscribed = false;
    let channel: any = null;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel(`social_realtime_${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'partner_invites' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setState((prev) => ({
                ...prev,
                partnerInvites: (prev.partnerInvites || []).filter((i) => i.id !== deletedId),
                deletedEntityIds: [...(prev.deletedEntityIds || []), deletedId].slice(-500),
              }));
            }
          }
          syncPartnerDataLive();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'partnerships' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setState((prev) => {
                const remainingPartnerships = (prev.partnerships || []).filter((p) => p.id !== deletedId);
                const remainingChallenges = (prev.sharedChallenges || []).filter((c) => c.partnershipId !== deletedId);
                const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), deletedId].slice(-500);
                return {
                  ...prev,
                  partnerships: remainingPartnerships,
                  partnership: remainingPartnerships[0] || null,
                  sharedChallenges: remainingChallenges,
                  deletedEntityIds: updatedDeletedEntityIds,
                };
              });
            }
          }
          syncPartnerDataLive();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_challenges' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setState((prev) => ({
                ...prev,
                sharedChallenges: (prev.sharedChallenges || []).filter((c) => c.id !== deletedId),
                deletedEntityIds: [...(prev.deletedEntityIds || []), deletedId].slice(-500),
              }));
            }
          } else if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const row = payload.new as any;
            if (row && row.id) {
              const u1DoneDates = Array.isArray(row.user1_done_dates) && row.user1_done_dates.length
                ? row.user1_done_dates
                : (row.user1_done_date ? [row.user1_done_date] : []);
              const u2DoneDates = Array.isArray(row.user2_done_dates) && row.user2_done_dates.length
                ? row.user2_done_dates
                : (row.user2_done_date ? [row.user2_done_date] : []);

              const incomingChallenge: SharedChallenge = reconcileSharedChallengeLifecycle({
                id: row.id,
                partnershipId: row.partnership_id,
                title: row.title,
                targetHabitName: row.target_habit_name,
                durationDays: row.duration_days,
                jointStreak: row.joint_streak,
                totalJointDaysCompleted: row.total_joint_days_completed ?? 0,
                user1Category: row.user1_category || 'habit',
                user1Target: row.user1_target || row.target_habit_name,
                user2Category: row.user2_category || 'habit',
                user2Target: row.user2_target || row.target_habit_name,
                user1DoneDate: row.user1_done_date || undefined,
                user2DoneDate: row.user2_done_date || undefined,
                user1DoneDates: u1DoneDates,
                user2DoneDates: u2DoneDates,
                status: row.status as 'active' | 'completed' | 'expired',
                createdAt: row.created_at,
              });

              setState((prev) => {
                if (
                  (prev.deletedEntityIds || []).includes(incomingChallenge.id) ||
                  (prev.deletedEntityIds || []).includes(incomingChallenge.partnershipId)
                ) {
                  return prev;
                }
                const exists = (prev.sharedChallenges || []).some((c) => c.id === incomingChallenge.id);
                return {
                  ...prev,
                  sharedChallenges: exists
                    ? prev.sharedChallenges.map((c) => (c.id === incomingChallenge.id ? mergeSharedChallenge(c, incomingChallenge) : c))
                    : [incomingChallenge, ...(prev.sharedChallenges || [])],
                };
              });
            }
          }
          syncPartnerDataLive();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => syncPartnerDataLive())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            stopFallbackPolling();
            syncPartnerDataLive();
          } else {
            isSubscribed = false;
            startFallbackPolling();
          }
        });
    } else {
      startFallbackPolling();
    }

    const handleOnline = () => {
      if (!isSubscribed) {
        startFallbackPolling();
      }
      syncPartnerDataLive();
    };

    const handleOffline = () => {
      stopFallbackPolling();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      stopFallbackPolling();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (channel) supabase.removeChannel(channel);
    };
    // Intentional: adding deletedEntityIds would tear down/reconnect the realtime channel on every deletion app-wide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser?.id, state.username]);

  // Check for league period rollovers and missed-habit penalties on mount and every minute
  useEffect(() => {
    const retryUnconfirmedPlans = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const currentState = stateRef.current;
      if (currentState?.improvementPlans && isSupabaseConfigured) {
        const unconfirmedPlans = currentState.improvementPlans.filter(
          (p) => p.syncStatus === 'pending' || p.syncStatus === 'failed'
        );
        for (const plan of unconfirmedPlans) {
          syncPlanToSupabase(plan)
            .then((res) => {
              if (res) {
                setState((prev) => ({
                  ...prev,
                  improvementPlans: prev.improvementPlans.map((p) =>
                    p.id === plan.id ? { ...p, syncStatus: 'synced' } : p
                  ),
                }));
              } else {
                setState((prev) => ({
                  ...prev,
                  improvementPlans: prev.improvementPlans.map((p) =>
                    p.id === plan.id ? { ...p, syncStatus: 'failed' } : p
                  ),
                }));
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent('app-toast-error', {
                      detail: {
                        title: "Couldn't save plan",
                        message: "It's saved on this device and will retry automatically.",
                        dedupKey: `plan_sync_failed_${plan.id}`,
                      },
                    })
                  );
                }
              }
            })
            .catch((_err) => {
              setState((prev) => ({
                ...prev,
                improvementPlans: prev.improvementPlans.map((p) =>
                  p.id === plan.id ? { ...p, syncStatus: 'failed' } : p
                ),
              }));
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('app-toast-error', {
                    detail: {
                      title: "Couldn't save plan",
                      message: "It's saved on this device and will retry automatically.",
                      dedupKey: `plan_sync_failed_${plan.id}`,
                    },
                  })
                );
              }
            });
        }
      }
    };

    const checkUpdates = (simulatedNow?: Date) => {
      const targetNow = simulatedNow || leagueNow();
      const challengesToSync: SharedChallenge[] = [];

      // A new week, month or season: other members' points for it (and final ones for the period
      // that just closed, which archiving waits for) need a fresh fetch.
      const fetchedPeriod = leagueRefresher.fetchedPeriodKey();
      if (fetchedPeriod && fetchedPeriod !== leaguePeriodKey(targetNow)) {
        void refreshLeagueStandings({ full: true });
      }

      setState((prev) => {
        challengesToSync.length = 0;
        // League archives and missed-habit, no-report and exercise-target penalties come from hourly server jobs.
        const weeklyGoalsReconciledState = reconcileWeeklyGoalsPointsForAllWeeks(
          reconcileLinkedWeeklyGoals(prev, targetNow),
          targetNow
        );

        const reconciledChallenges = (weeklyGoalsReconciledState.sharedChallenges || []).map((c) => {
          const updated = reconcileSharedChallengeLifecycle(c, targetNow);
          if (updated.status !== c.status || updated.jointStreak !== c.jointStreak) {
            challengesToSync.push(updated);
          }
          return updated;
        });

        return {
          ...weeklyGoalsReconciledState,
          sharedChallenges: reconciledChallenges,
        };
      });

      for (const updated of challengesToSync) {
        saveSharedChallengeSupabase(updated).catch((err) => {
          console.error('Failed to sync shared challenge from checkUpdates:', err);
        });
        syncBroadcaster.broadcast('CHALLENGE_UPDATED', updated);
      }

      // RETRY PENDING OR FAILED IMPROVEMENT PLANS (Outside setState)
      retryUnconfirmedPlans();
    };
    checkUpdates(leagueNow());
    archiveTimer.current = window.setInterval(() => checkUpdates(leagueNow()), 60000);

    const handleOnline = () => {
      retryUnconfirmedPlans();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      if (archiveTimer.current) window.clearInterval(archiveTimer.current);
      window.removeEventListener('online', handleOnline);
    };
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAuthSessionState = useCallback((user: UserProfile | null, newState: AppState) => {
    setState(
      reconcileWeeklyGoalsPointsForAllWeeks(
        reconcileLinkedWeeklyGoals(sanitizeLoadedState(newState, user), leagueNow()),
        leagueNow()
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `accountDeleted`: the account is already gone on the server, so unsaved state is
  // discarded (a flush would try to recreate the user's rows) and only the local session is cleared.
  const logout = useCallback(async ({ accountDeleted = false }: { accountDeleted?: boolean } = {}) => {
    // 1. Guard against re-entrancy
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    const myLogoutGeneration = ++authGenerationRef.current;

    try {
      const currentState = stateRef.current;
      const localTheme = getLocalThemePreference() || 'dark';

      // 2. Cancel pending debounce timer if one exists
      const hadPendingSave = Boolean(debounceTimer.current);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }

      // 15-second hard timeout: if logout network calls hang, proceed to reset locally
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Logout network calls timed out after 15s')), 15000)
      );

      // 3. Save before signing out, but only what is not saved yet: a clean account just waits
      // for a save already in flight. Then send pending table changes (they stay queued on this
      // device if this fails, and go out on the next sign-in).
      let persistError: unknown = null;
      const userId = currentState.currentUser?.id;
      if (!accountDeleted) {
        const hasUnsavedChanges =
          hadPendingSave ||
          pendingImmediateResolvers.current.length > 0 ||
          Boolean(userId && localStorage.getItem(`ascend_dirty_${userId}`));
        try {
          await Promise.race([
            hasUnsavedChanges ? enqueuePersist(currentState) : writeQueueRef.current,
            timeoutPromise,
          ]);
        } catch (persistErr) {
          persistError = persistErr;
          console.error('Failed to flush state before logout:', persistErr);
        }
        if (userId) {
          await Promise.race([flushOutbox(userId), timeoutPromise]).catch((err) =>
            console.error('Failed to send pending changes before logout:', err)
          );
        }
      }

      // 3b. Nothing waits to be sent: remove this account's data from the device, so the next
      // person on a shared browser cannot read it. Unsent changes keep it for the next sign-in.
      if (
        !accountDeleted &&
        userId &&
        !persistError &&
        !hasPendingSyncOps(userId) &&
        !localStorage.getItem(`ascend_dirty_${userId}`)
      ) {
        clearLocalUserData(userId);
      }

      // 3c. Stop pushes for this account on this device (the next person here must not get them).
      await Promise.race([disablePush(), timeoutPromise]).catch((err) =>
        console.warn('Failed to remove push subscription before logout:', err)
      );

      // 4. Attempt remote sign-out
      let networkError: unknown = null;
      try {
        await Promise.race([logoutUser({ scope: accountDeleted ? 'local' : 'global' }), timeoutPromise]);
      } catch (err: unknown) {
        networkError = err;
        console.error('Logout error in auth service:', err);
      }

      // 5. Unconditionally reset local state to guest (unless superseded by a newer auth event)
      if (myLogoutGeneration !== authGenerationRef.current) return;
      clearLeagueStandings();

      const guestRaw = localStorage.getItem(GUEST_STORAGE_KEY);
      let guestState = DEFAULT_STATE;
      if (guestRaw) {
        try {
          guestState = JSON.parse(guestRaw);
        } catch {}
      }
      const sanitized = sanitizeLoadedState(guestState, null);
      setState({
        ...sanitized,
        themePreference: localTheme,
      });

      // 6. Surface user-facing notifications for any failures that occurred
      if (typeof window !== 'undefined') {
        if (persistError) {
          window.dispatchEvent(
            new CustomEvent('app-toast-error', {
              detail: {
                title: 'Some changes may not have saved',
                message: 'Your latest changes may not have saved before you logged out.',
              },
            })
          );
        }

        if (networkError) {
          window.dispatchEvent(
            new CustomEvent('app-toast-error', {
              detail: {
                title: 'Logged out on this device',
                message: "Couldn't reach the server to finish logging out everywhere.",
              },
            })
          );
        }
      }
    } finally {
      isLoggingOutRef.current = false;
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Logging out of a guest account deletes it: a guest cannot sign back in, so the account would
   * stay behind in the leagues forever. When the server refuses, the guest stays signed in.
   * Returns false on failure (an error toast is shown).
   */
  const logoutGuest = useCallback(async (): Promise<boolean> => {
    const user = stateRef.current.currentUser;
    if (!user?.id || !user.isAnonymous) {
      await logout();
      return true;
    }
    try {
      await deleteOwnAccount(user.id);
    } catch (err) {
      console.error('Guest account deletion failed:', err);
      dispatchToastError("Couldn't delete your guest account", 'Check your connection and try again.');
      return false;
    }
    await logout({ accountDeleted: true });
    return true;
  }, [logout]);

  const addPresetHabit = useCallback((preset: PresetHabit) => {
    const normalizedName = preset.name.trim().toLowerCase();
    const nowIso = trustedNow().toISOString();
    const habit: Habit = {
      id: uid(),
      name: preset.name,
      frequency: preset.frequency,
      points: preset.points,
      isPreset: true,
      category: preset.category,
      createdAt: nowIso,
      updatedAt: nowIso,
      completions: {},
      createdAtPeriod: periodKey(preset.frequency),
      missedPeriods: [],
      consecutiveMisses: 0,
    };
    setState(
      (prev) => {
        const alreadyExists = (prev.habits || []).some(
          (h) => h.isPreset === true && (h.name || '').trim().toLowerCase() === normalizedName
        );
        if (alreadyExists) {
          return prev;
        }
        return { ...prev, habits: [...prev.habits, habit] };
      },
      { immediate: true }
    );
    return habit;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addCustomHabit = useCallback((name: string, frequency: Habit['frequency']) => {
    const nowIso = trustedNow().toISOString();
    const habit: Habit = {
      id: uid(),
      name,
      frequency,
      points: 0, // Custom habits earn no points
      isPreset: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completions: {},
      createdAtPeriod: periodKey(frequency),
      missedPeriods: [],
      consecutiveMisses: 0,
    };
    setState(
      (prev) => {
        return {
          ...prev,
          habits: [...prev.habits, habit],
        };
      },
      { immediate: true }
    );
    return habit;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateHabit = useCallback((habitId: string, updates: Partial<Habit>) => {
    setState(
      (prev) => {
        const habit = prev.habits.find((h) => h.id === habitId);
        if (!habit) return prev;


        return {
          ...prev,
          habits: prev.habits.map((h) =>
            h.id === habitId
              ? {
                  ...h,
                  ...updates,
                  updatedAt: trustedNow().toISOString(),
                }
              : h
          ),
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteHabit = useCallback((habitId: string) => {
    const currentWeekKey = weekKey(getNow());
    setState(
      (prev) => {
        const target = prev.habits.find((h) => h.id === habitId);
        let runningState = prev;
        const today = todayKey();

        const remainingHabits = prev.habits.filter((h) => h.id !== habitId);

        // If target had a completion today, recalculate cap allocation for remaining preset habits
        let targetHadTodayDone = false;
        if (target && target.isPreset && target.frequency === 'daily') {
          if (Array.isArray(target.completions)) {
            targetHadTodayDone = target.completions.includes(today);
          } else if (target.completions && typeof target.completions === 'object') {
            const todayRecord = target.completions[today];
            if (todayRecord?.done) {
              targetHadTodayDone = true;
            }
          }
        }

        // Today's award leaves with the habit and the remaining presets share the freed cap.
        let updatedHabits = remainingHabits;
        if (targetHadTodayDone) {
          const awards = applyHabitAwardsInternal(runningState, remainingHabits, today);
          runningState = { ...runningState, ...awards.points };
          updatedHabits = awards.habits;
        }

        const updatedDeletedEntityIds = [...(runningState.deletedEntityIds || []), habitId].slice(-500);
        return {
          ...runningState,
          habits: updatedHabits,
          weeklyGoals: removeLinkedWeeklyGoals(runningState.weeklyGoals, 'habit', [habitId], currentWeekKey),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleReadingHabit = useCallback(() => {
    const currentWeekKey = weekKey(getNow());
    setState(
      (prev) => {
        const existing = prev.habits.find((h) => h.linkedModule === 'reading');
        if (existing) {
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), existing.id].slice(-500);
          return {
            ...prev,
            habits: prev.habits.filter((h) => h.id !== existing.id),
            weeklyGoals: removeLinkedWeeklyGoals(prev.weeklyGoals, 'habit', [existing.id], currentWeekKey),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        } else {
          const today = todayKey();
          const todayReadingLogs = (prev.readingLogs || []).filter((l) => l.date === today);
          const totalPagesToday = todayReadingLogs.reduce((sum, l) => sum + (l.pagesRead || 0), 0);
          const hasReadToday = totalPagesToday > 0;

          const nowIso = trustedNow().toISOString();
          const dKey = periodKey('daily');
          const habit: Habit = {
            id: uid(),
            name: 'Reading (Books)',
            frequency: 'daily',
            points: 0,
            isPreset: true,
            category: 'Learning & Growth',
            createdAt: nowIso,
            updatedAt: nowIso,
            completions: hasReadToday ? { [dKey]: { done: true, updatedAt: nowIso } } : {},
            createdAtPeriod: dKey,
            missedPeriods: [],
            consecutiveMisses: 0,
            isSystemLinked: true,
            linkedModule: 'reading',
          };

          const replacedIds = prev.habits.filter((h) => h.name.toLowerCase() === 'reading (books)').map((h) => h.id);
          return {
            ...prev,
            habits: [...prev.habits.filter((h) => h.name.toLowerCase() !== 'reading (books)'), habit],
            // Tombstoned so the habits table soft-deletes them instead of serving them back.
            deletedEntityIds: [...(prev.deletedEntityIds || []), ...replacedIds].slice(-500),
          };
        }
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleHabit = useCallback(
    (habitId: string) => {
      if (inFlightHabitToggles.current.has(habitId)) {
        return false;
      }
      inFlightHabitToggles.current.add(habitId);

      let completed = false;
      const challengesToSync: SharedChallenge[] = [];

      try {
        setState(
          (prev) => {
            challengesToSync.length = 0;
            const habit = prev.habits.find((h) => h.id === habitId);
            if (habit?.linkedModule === 'reading') {
              return prev;
            }

            const nowIso = trustedNow().toISOString();

            const currentKey = habit ? periodKey(habit.frequency) : todayKey();
            const prevCompletions = habit
              ? (Array.isArray(habit.completions)
                  ? Object.fromEntries(habit.completions.map((c) => [c, { done: true, updatedAt: habit.updatedAt || nowIso }]))
                  : (habit.completions || {}))
              : {};
            const isCurrentlyDone = prevCompletions[currentKey]?.done === true;
            completed = !isCurrentlyDone;

            let habits = prev.habits.map((h) => {
              if (h.id !== habitId) return h;
              const key = periodKey(h.frequency);
              const currentCompletions = Array.isArray(h.completions)
                ? Object.fromEntries(h.completions.map((c) => [c, { done: true, updatedAt: h.updatedAt || nowIso }]))
                : (h.completions || {});
              if (!completed) {
                return {
                  ...h,
                  completions: {
                    ...currentCompletions,
                    [key]: { done: false, updatedAt: nowIso, pointsAwarded: 0 },
                  },
                  updatedAt: nowIso,
                };
              } else {
                return {
                  ...h,
                  completions: {
                    ...currentCompletions,
                    [key]: { done: true, updatedAt: nowIso, pointsAwarded: h.isPreset && h.frequency === 'daily' ? 0 : h.points },
                  },
                  updatedAt: nowIso,
                };
              }
            });

            let runningState = prev;

            // Daily presets share the daily cap; every other habit earns no points.
            if (habit && habit.isPreset && habit.frequency === 'daily') {
              const awards = applyHabitAwardsInternal(runningState, habits, todayKey());
              runningState = { ...runningState, ...awards.points };
              habits = awards.habits;
            }

            let updatedChallenges = prev.sharedChallenges;
            if (habit && prev.sharedChallenges.length > 0) {
              const today = todayKey();

              updatedChallenges = prev.sharedChallenges.map((target) => {
                const challengePartnership =
                  (prev.partnerships || []).find((p) => p.id === target.partnershipId) || prev.partnership;

                if (!challengePartnership) return target;

                const isUser1 = isPartnershipUser1(challengePartnership, prev.currentUser?.id, prev.username);

                const myCategory = isUser1 ? (target.user1Category || 'habit') : (target.user2Category || 'habit');
                const myTarget = (isUser1 ? (target.user1Target || target.targetHabitName) : (target.user2Target || target.targetHabitName)).trim().toLowerCase();

                if (myCategory === 'habit' && myTarget === habit.name.trim().toLowerCase()) {
                  const { updated } = applyPledgeToggle(target, isUser1, completed);
                  challengesToSync.push(updated);
                  return updated;
                }

                return target;
              });
            }

            return {
              ...runningState,
              habits,
              sharedChallenges: updatedChallenges,
            };
          },
          { immediate: true }
        );

        for (const updated of challengesToSync) {
          saveSharedChallengeSupabase(updated).catch((err) => {
            console.error('Failed to sync shared challenge from toggleHabit:', err);
          });
          syncBroadcaster.broadcast('CHALLENGE_UPDATED', updated);
        }
      } finally {
        inFlightHabitToggles.current.delete(habitId);
      }
      return completed;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const isHabitDone = useCallback((habit: Habit, date = trustedNow()): boolean => {
    const key = periodKey(habit.frequency, date);
    if (!habit.completions) return false;
    if (Array.isArray(habit.completions)) {
      return (habit.completions as any).includes(key);
    }
    return habit.completions[key]?.done === true;
  }, []);

  const saveJournalEntry = useCallback(
    (mood: JournalEntry['mood'], content: string, existingId?: string) => {
      const date = todayKey();
      const trimmed = content.trim();

      setState((prev) => {
        const existingIdx = prev.journalEntries.findIndex(
          (e) => (existingId && e.id === existingId) || e.date === date
        );

        const existing = existingIdx >= 0 ? prev.journalEntries[existingIdx] : null;
        // An edit keeps createdAt (the first write), as the server does, so its echo is a no-op.
        const saved: JournalEntry = existing
          ? { ...existing, mood, content: trimmed }
          : { id: uid(), date, mood, content: trimmed, createdAt: trustedNow().toISOString(), pointsAwarded: false };
        // Only today's entry earns (the server recomputes only today); an earlier entry keeps its flag.
        if (saved.date === date) saved.pointsAwarded = journalEntryEarns(saved);

        const journalEntries = existing
          ? prev.journalEntries.map((e, i) => (i === existingIdx ? saved : e))
          : [saved, ...prev.journalEntries];
        // The server writes the day's award (applyJournalAwardInternal shows the same row now).
        return { ...prev, journalEntries, ...applyJournalAwardInternal(prev, journalEntries, date) };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const deleteJournalEntry = useCallback((entryId: string) => {
    void (
      setState(
        (prev) => {
          const entry = prev.journalEntries.find((e) => e.id === entryId);
          if (!entry) return prev;

          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), entryId].slice(-500);
          const journalEntries = prev.journalEntries.filter((e) => e.id !== entryId);

          // Only today's award changes: an earlier day's points stay (the server recomputes only today).
          return {
            ...prev,
            journalEntries,
            deletedEntityIds: updatedDeletedEntityIds,
            ...applyJournalAwardInternal(prev, journalEntries, todayKey()),
          };
        },
        { immediate: true, actionLabel: 'Journal entry deletion', entityId: entryId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getTodayJournalEntry = useCallback((date = trustedNow()): JournalEntry | null => {
    const key = todayKey(date);
    return state.journalEntries.find((e) => e.date === key) ?? null;
  }, [state.journalEntries]);

  const markLessonRead = useCallback(
    (lessonId: string) => {
      setState((prev) => {
        const activeSeasonNum = getSeasonNumber(leagueNow());
        if (isLessonReadInSeason(prev.readLessonIds, lessonId, activeSeasonNum)) return prev;

        // The server writes the award from its own catalog (computeLessonAward shows the same row now).
        const award = computeLessonAward(lessonId, activeSeasonNum, trustedNow().toISOString());
        const pointsUpdate = award
          ? addPointsInternal(prev, award.amount, award.reason, award.source, award.metadata, award.timestamp, award.id)
          : {};
        return {
          ...prev,
          readLessonIds: [...prev.readLessonIds, lessonReadId(lessonId, activeSeasonNum)],
          ...pointsUpdate,
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const setUsername = useCallback((username: string) => {
    setState((prev) => ({
      ...prev,
      username,
      currentUser: prev.currentUser ? { ...prev.currentUser, username } : null,
    }));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateProfileUsername = useCallback((newUsername: string, lastChangedAt?: string) => {
    const timestamp = lastChangedAt || trustedNow().toISOString();
    setState(
      (prev) => {
        if (!prev.currentUser) return prev;
        const updatedUser = {
          ...prev.currentUser,
          username: newUsername,
          lastUsernameChangeAt: timestamp,
        };
        return {
          ...prev,
          currentUser: updatedUser,
          username: newUsername,
        };
      },
      { immediate: true }
    );
  }, [setState]);

  const updateProfileAvatar = useCallback((newAvatar: string) => {
    setState((prev) => {
      if (!prev.currentUser) return prev;
      const updatedUser = {
        ...prev.currentUser,
        avatar: newAvatar,
      };
      return {
        ...prev,
        currentUser: updatedUser,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setThemePreference = useCallback((theme: 'dark' | 'light') => {
    setLocalThemePreference(theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    setState(
      (prev) => ({
        ...prev,
        themePreference: theme,
      }),
      { immediate: true }
    );
  }, [setState]);

  const toggleThemePreference = useCallback(() => {
    const currentTheme = getLocalThemePreference() || stateRef.current.themePreference || 'dark';
    const nextTheme: 'dark' | 'light' = currentTheme === 'light' ? 'dark' : 'light';
    setLocalThemePreference(nextTheme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', nextTheme);
    }
    setState(
      (prev) => ({
        ...prev,
        themePreference: nextTheme,
      }),
      { immediate: true }
    );
  }, [setState]);

  const toggleProfilePrivacy = useCallback(async () => {
    const current = state.currentUser;
    if (!current?.id) return;

    const newPrivacy = !(current.isProfilePublic ?? true);

    const updated = await updateProfilePrivacy(current.id, newPrivacy);

    setState((prev) => ({
      ...prev,
      currentUser: prev.currentUser
        ? { ...prev.currentUser, isProfilePublic: updated?.isProfilePublic ?? newPrivacy }
        : null,
    }));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser]);

  const toggleAcceptPartnerInvites = useCallback(async () => {
    const current = state.currentUser;
    if (!current) return;

    const currentSetting = current.acceptPartnerInvites ?? true;
    const nextSetting = !currentSetting;

    setState(
      (prev) => ({
        ...prev,
        currentUser: prev.currentUser
          ? { ...prev.currentUser, acceptPartnerInvites: nextSetting }
          : null,
      }),
      { immediate: true }
    );

    if (current.id) {
      await updateProfileAcceptPartnerInvites(current.id, nextSetting);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser]);

  const toggleNotifDailyReminder = useCallback(async () => {
    const current = state.currentUser;
    if (!current) return;

    const currentSetting = current.notifDailyReminder ?? true;
    const nextSetting = !currentSetting;

    setState(
      (prev) => ({
        ...prev,
        currentUser: prev.currentUser
          ? { ...prev.currentUser, notifDailyReminder: nextSetting }
          : null,
      }),
      { immediate: true }
    );

    if (current.id) {
      await updateProfileNotificationPreferences(current.id, { notifDailyReminder: nextSetting });
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser]);

  const toggleNotifPartnerActivity = useCallback(async () => {
    const current = state.currentUser;
    if (!current) return;

    const currentSetting = current.notifPartnerActivity ?? true;
    const nextSetting = !currentSetting;

    setState(
      (prev) => ({
        ...prev,
        currentUser: prev.currentUser
          ? { ...prev.currentUser, notifPartnerActivity: nextSetting }
          : null,
      }),
      { immediate: true }
    );

    if (current.id) {
      await updateProfileNotificationPreferences(current.id, { notifPartnerActivity: nextSetting });
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser]);

  const toggleNotifLeagueUpdates = useCallback(async () => {
    const current = state.currentUser;
    if (!current) return;

    const currentSetting = current.notifLeagueUpdates ?? true;
    const nextSetting = !currentSetting;

    setState(
      (prev) => ({
        ...prev,
        currentUser: prev.currentUser
          ? { ...prev.currentUser, notifLeagueUpdates: nextSetting }
          : null,
      }),
      { immediate: true }
    );

    if (current.id) {
      await updateProfileNotificationPreferences(current.id, { notifLeagueUpdates: nextSetting });
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser]);

  // --- MODULE 1: EXERCISE TRACKER ACTIONS ---
  const logWorkout = useCallback((type: string, durationMinutes: number, amount?: number, unit?: string) => {
    const date = todayKey();
    setState((prev) => {
      const normalizedUnit = (unit || 'mins').trim().toLowerCase();
      const safeDurationMinutes = Math.max(0, Number(durationMinutes) || 0);
      const safeAmount = typeof amount === 'number' && !isNaN(amount) ? Math.max(0, Number(amount)) : undefined;

      const savedDuration = normalizedUnit === 'mins' ? (safeAmount !== undefined && safeAmount > 0 ? safeAmount : safeDurationMinutes) : 0;

      const workout: WorkoutLog = {
        id: uid(),
        date,
        type: type.trim() || 'General Workout',
        durationMinutes: savedDuration,
        pointsAwarded: 0,
        amount: safeAmount !== undefined ? safeAmount : (normalizedUnit === 'mins' ? safeDurationMinutes : undefined),
        unit: normalizedUnit,
        createdAt: trustedNow().toISOString(),
      };

      // The server writes the day's award (applyWorkoutAwardsInternal shows the same row now).
      const awards = applyWorkoutAwardsInternal(prev, [workout, ...prev.workouts], date);
      return {
        ...prev,
        workouts: awards.workouts,
        ...awards.points,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteWorkout = useCallback((workoutId: string) => {
    void (
      setState(
        (prev) => {
          const target = prev.workouts.find((w) => w.id === workoutId);
          if (!target) return prev;

          const remainingWorkouts = prev.workouts.filter((w) => w.id !== workoutId);
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), workoutId].slice(-500);

          // Only today's award follows the workouts; an earlier day's points stay (as on the server).
          const today = todayKey();
          if (target.date !== today) {
            return { ...prev, workouts: remainingWorkouts, deletedEntityIds: updatedDeletedEntityIds };
          }
          const awards = applyWorkoutAwardsInternal(prev, remainingWorkouts, today);
          return {
            ...prev,
            workouts: awards.workouts,
            deletedEntityIds: updatedDeletedEntityIds,
            ...awards.points,
          };
        },
        { immediate: true, actionLabel: 'Workout deletion', entityId: workoutId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setExerciseGoal = useCallback((targetWeeklySessions: number) => {
    setState((prev) => ({
      ...prev,
      exerciseGoal:
        targetWeeklySessions > 0
          ? {
              targetWeeklySessions,
              createdAt: prev.exerciseGoal?.createdAt || trustedNow().toISOString(),
              lastEvaluatedWeek: prev.exerciseGoal?.lastEvaluatedWeek,
            }
          : null,
    }));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- MODULE 2: UNIFIED READING HUB & LIBRARY ACTIONS ---
  const addBook = useCallback(
    (
      title: string,
      author: string,
      totalPages: number,
      unit: 'pages' | 'chapters' = 'pages',
      targetFinishDate?: string,
      category?: BookCategory | string,
      description?: string
    ) => {
      const now = trustedNow().toISOString();
      const id = `custom-book-${trustedNowMs()}-${Math.random().toString(36).substring(2, 9)}`;
      const numPages = Math.max(1, totalPages || 200);

      const userBook: UserBook = {
        id,
        title: title.trim(),
        author: author.trim() || 'Unknown Author',
        description: description?.trim(),
        category,
        isCurated: false,
        isCustom: true,
        pointsReward: 0,
        pointsAwarded: 0,
        status: 'reading',
        totalAmount: numPages,
        totalPages: numPages,
        currentAmount: 0,
        currentPage: 0,
        unit,
        targetFinishDate: targetFinishDate?.trim() || undefined,
        addedAt: now,
        updatedAt: now,
        dateStarted: now,
        startedAt: now,
        isFinished: false,
      };

      const trackerBook: Book = {
        id,
        title: title.trim(),
        author: author.trim() || 'Unknown Author',
        totalPages: numPages,
        unit,
        currentPage: 0,
        isFinished: false,
        targetFinishDate: targetFinishDate?.trim() || undefined,
        createdAt: now,
      };

      setState((prev) => {
        return {
          ...prev,
          libraryBooks: [userBook, ...prev.libraryBooks.filter((lb) => lb.id !== id)],
          books: [],
        };
      });

      return trackerBook;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateBookTargetDate = useCallback((bookId: string, targetFinishDate?: string) => {
    const formatted = targetFinishDate?.trim() || undefined;
    setState((prev) => {
      return {
        ...prev,
        libraryBooks: prev.libraryBooks.map((lb) =>
          lb.id === bookId || lb.linkedBookId === bookId
            ? { ...lb, targetFinishDate: formatted, updatedAt: trustedNow().toISOString() }
            : lb
        ),
        books: [],
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateReadingProgress = useCallback((bookId: string, pagesDelta: number, newCurrentPage: number) => {
    const date = todayKey();
    const nowIso = trustedNow().toISOString();
    setState((prev) => {
      const targetUserBook = prev.libraryBooks.find((lb) => lb.id === bookId || lb.linkedBookId === bookId);
      if (!targetUserBook) return prev;

      const title = targetUserBook.title || 'Book';
      const existingPage = targetUserBook.currentAmount ?? targetUserBook.currentPage ?? 0;
      const maxPages = targetUserBook.totalAmount ?? targetUserBook.totalPages ?? 250;
      const clampedPage = Math.min(maxPages, Math.max(0, newCurrentPage));
      const pageDelta = clampedPage - existingPage;

      const readingHabit = prev.habits.find((h) => h.linkedModule === 'reading');

      let updatedReadingLogs = prev.readingLogs || [];
      let removedLogIds: string[] = [];
      if (pageDelta > 0) {
        const readingLog: ReadingLog = {
          id: `reading-log-${trustedNowMs()}-${Math.random().toString(36).substring(2, 9)}`,
          bookId: targetUserBook.id,
          date,
          pagesRead: pageDelta,
          pointsAwarded: 0,
          createdAt: trustedNow().toISOString(),
        };
        updatedReadingLogs = [readingLog, ...updatedReadingLogs];
      } else if (pageDelta < 0) {
        let decreaseToApply = Math.abs(pageDelta);
        const validBookIds = new Set(
          [targetUserBook.id, bookId, targetUserBook.linkedBookId, targetUserBook.curatedBookId].filter(Boolean)
        );
        const nowIso = trustedNow().toISOString();
        updatedReadingLogs = updatedReadingLogs.map((l) => {
          if (decreaseToApply <= 0 || l.date !== date || !l.bookId || !validBookIds.has(l.bookId)) {
            return l;
          }
          const currentLogPages = l.pagesRead || 0;
          if (currentLogPages <= decreaseToApply) {
            decreaseToApply -= currentLogPages;
            removedLogIds.push(l.id);
            return null;
          } else {
            const remaining = currentLogPages - decreaseToApply;
            decreaseToApply = 0;
            return { ...l, pagesRead: remaining, updatedAt: nowIso };
          }
        }).filter((l): l is ReadingLog => l !== null);
      }

      // The server writes the day's page award (applyReadingAwardsInternal shows the same row now).
      const awards = applyReadingAwardsInternal(prev, updatedReadingLogs, prev.libraryBooks, date);
      updatedReadingLogs = awards.readingLogs;

      // Calculate total pages read today across ALL books
      const totalPagesToday = updatedReadingLogs
        .filter((l) => l.date === date)
        .reduce((sum, l) => sum + (l.pagesRead || 0), 0);

      const updatedLibraryBooks = prev.libraryBooks.map((lb) => {
        if (lb.id === bookId || lb.linkedBookId === bookId || lb.id === targetUserBook.id) {
          return {
            ...lb,
            currentAmount: clampedPage,
            currentPage: clampedPage,
            status: (clampedPage >= maxPages && lb.status !== 'completed' ? 'reading' : lb.status) as UserBookStatus,
            updatedAt: nowIso,
          };
        }
        return lb;
      });

      let updatedHabits = prev.habits;
      let updatedDeletedEntityIds = prev.deletedEntityIds || [];
      if (removedLogIds.length > 0) {
        updatedDeletedEntityIds = Array.from(new Set([...updatedDeletedEntityIds, ...removedLogIds])).slice(-500);
      }

      // Auto-Check / Un-Check linked reading habit (presence tracking)
      if (readingHabit) {
        const key = periodKey(readingHabit.frequency || 'daily');
        const currentCompletions = Array.isArray(readingHabit.completions)
          ? Object.fromEntries(readingHabit.completions.map((c) => [c, { done: true, updatedAt: readingHabit.updatedAt || trustedNow().toISOString() }]))
          : (readingHabit.completions || {});
        const isCheckedToday = currentCompletions[key]?.done === true;

        const nowIso = trustedNow().toISOString();
        if (totalPagesToday > 0 && !isCheckedToday) {
          // Auto-check habit (linked reading habit is zero-point system indicator or tracks completions)
          updatedHabits = prev.habits.map((h) =>
            h.id === readingHabit.id
              ? {
                  ...h,
                  completions: {
                    ...(Array.isArray(h.completions)
                      ? Object.fromEntries(h.completions.map((c) => [c, { done: true, updatedAt: h.updatedAt || nowIso }]))
                      : (h.completions || {})),
                    [key]: { done: true, updatedAt: nowIso },
                  },
                  updatedAt: nowIso,
                }
              : h
          );
        } else if (totalPagesToday <= 0 && isCheckedToday) {
          // Auto-uncheck habit
          updatedHabits = prev.habits.map((h) =>
            h.id === readingHabit.id
              ? {
                  ...h,
                  completions: {
                    ...(Array.isArray(h.completions)
                      ? Object.fromEntries(h.completions.map((c) => [c, { done: true, updatedAt: h.updatedAt || nowIso }]))
                      : (h.completions || {})),
                    [key]: { done: false, updatedAt: nowIso },
                  },
                  updatedAt: nowIso,
                }
              : h
          );
        }
      }

      return {
        ...prev,
        libraryBooks: updatedLibraryBooks,
        books: [],
        readingLogs: updatedReadingLogs,
        habits: updatedHabits,
        deletedEntityIds: updatedDeletedEntityIds,
        ...awards.points,
      };
    },
    { immediate: true }
  );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishBook = useCallback((bookId: string, reflection: string) => {
    setState(
      (prev) => {
        const targetUserBook = prev.libraryBooks.find((lb) => lb.id === bookId || lb.linkedBookId === bookId);
        if (!targetUserBook) return prev;

        const title = targetUserBook.title || 'Book';
        const now = trustedNow().toISOString();
        const maxPages = targetUserBook.totalAmount ?? targetUserBook.totalPages ?? 250;

        const today = todayKey(trustedNow());
        const currentPage = targetUserBook.currentAmount ?? targetUserBook.currentPage ?? 0;
        const unreadDelta = Math.max(0, maxPages - currentPage);

        let updatedReadingLogs = prev.readingLogs || [];
        if (unreadDelta > 0) {
          const finishLog: ReadingLog = {
            id: `reading-log-${trustedNowMs()}-${Math.random().toString(36).substring(2, 9)}`,
            bookId: targetUserBook.id,
            date: today,
            pagesRead: unreadDelta,
            pointsAwarded: 0,
            finish: true,
            createdAt: now,
          };
          updatedReadingLogs = [finishLog, ...updatedReadingLogs];
        }

        const completedBook: UserBook = {
          ...targetUserBook,
          status: 'completed',
          currentAmount: maxPages,
          currentPage: maxPages,
          isFinished: true,
          reflection: reflection.trim() || targetUserBook.reflection,
          dateCompleted: now,
          completedAt: now,
          updatedAt: now,
        };

        // The server gives the finish bonus once (ascend_recompute_reading_bonus); the same check here shows it now.
        const bonusId = readingBonusId(targetUserBook.id);
        const alreadyAwarded =
          (targetUserBook.pointsAwarded ?? 0) > 0 || (prev.pointsHistory || []).some((e) => e.id === bonusId);
        const pointsToAward =
          !alreadyAwarded && meetsReadingBonusGates(completedBook, updatedReadingLogs, today) ? READING_POINTS.completionBonus : 0;

        const updatedLibraryBooks = prev.libraryBooks.map((lb) => {
          if (lb.id === bookId || lb.linkedBookId === bookId || lb.id === targetUserBook.id) {
            return {
              ...lb,
              status: 'completed' as UserBookStatus,
              currentAmount: maxPages,
              currentPage: maxPages,
              isFinished: true,
              reflection: reflection.trim() || lb.reflection,
              dateCompleted: now,
              completedAt: now,
              updatedAt: now,
              pointsAwarded: (lb.pointsAwarded || 0) + pointsToAward,
            };
          }
          return lb;
        });

        // Recompute today: the finish log earns no page points (finish: true), as on the server.
        const awards = applyReadingAwardsInternal(prev, updatedReadingLogs, updatedLibraryBooks, today);
        const points =
          pointsToAward > 0
            ? addPointsInternal(
                { ...prev, ...awards.points },
                pointsToAward,
                `Book finished: ${title}`,
                'reading_bonus',
                { bookId: targetUserBook.id },
                now,
                bonusId
              )
            : awards.points;

        return {
          ...prev,
          libraryBooks: updatedLibraryBooks,
          readingLogs: awards.readingLogs,
          books: [],
          ...points,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteBook = useCallback((bookId: string) => {
    const currentWeekKey = weekKey(getNow());
    void (
      setState(
        (prev) => {
          const targetUserBook = prev.libraryBooks.find((lb) => lb.id === bookId || lb.linkedBookId === bookId);
          if (!targetUserBook) return prev;

        const allMatchingIds = new Set<string>([bookId]);
        if (targetUserBook.id) allMatchingIds.add(targetUserBook.id);
        if (targetUserBook.linkedBookId) allMatchingIds.add(targetUserBook.linkedBookId);

        const bookLogs = prev.readingLogs.filter((l) => Boolean(l.bookId && allMatchingIds.has(l.bookId)));
        const remainingReadingLogs = prev.readingLogs.filter((l) => !l.bookId || !allMatchingIds.has(l.bookId));
        const remainingBooks = prev.libraryBooks.filter((lb) => !allMatchingIds.has(lb.id));

        // Only today's page award follows the logs; earlier days' points stay. The book's finish
        // bonus goes with it, as on the server: its server row is removed, and a bonus the app gave
        // before server bonuses (book.pointsAwarded, no server row) is taken back with a minus row.
        const bonusIds = new Set(Array.from(allMatchingIds).map(readingBonusId));
        const serverBonusIds = new Set((prev.pointsHistory || []).filter((e) => bonusIds.has(e.id)).map((e) => e.id));
        const { excisedEntryIds: _bonusExcised, ...withoutBonus } = excisePointsEntriesInternal(prev, (e) => bonusIds.has(e.id));
        let afterBonus: AppState = { ...prev, ...withoutBonus };
        for (const lb of prev.libraryBooks) {
          const legacyBonus = lb.pointsAwarded ?? 0;
          if (!allMatchingIds.has(lb.id) || legacyBonus <= 0 || serverBonusIds.has(readingBonusId(lb.id))) continue;
          afterBonus = {
            ...afterBonus,
            ...addPointsInternal(
              afterBonus,
              -legacyBonus,
              `Book deleted: ${lb.title || 'Book'}`,
              'reading_bonus',
              { bookId: lb.id, legacyMarker: true, legacyAmount: legacyBonus },
              trustedNow().toISOString(),
              readingBonusId(lb.id)
            ),
          };
        }
        const awards = applyReadingAwardsInternal(afterBonus, remainingReadingLogs, remainingBooks, todayKey());
        const updatedReadingLogs = awards.readingLogs;

        const readingHabit = prev.habits.find((h) => h.linkedModule === 'reading');
        let updatedHabits = prev.habits;
        let habitExcisedIds: string[] = [];

        if (readingHabit) {
          const today = todayKey();
          const key = periodKey(readingHabit.frequency || 'daily');
          const currentCompletions = Array.isArray(readingHabit.completions)
            ? Object.fromEntries(readingHabit.completions.map((c) => [c, { done: true, updatedAt: readingHabit.updatedAt || trustedNow().toISOString() }]))
            : (readingHabit.completions || {});
          const isCheckedToday = currentCompletions[key]?.done === true;
          const remainingPagesToday = updatedReadingLogs
            .filter((l) => l.date === today)
            .reduce((sum, l) => sum + (l.pagesRead || 0), 0);

          if (remainingPagesToday <= 0 && isCheckedToday) {
            const nowIso = trustedNow().toISOString();
            updatedHabits = prev.habits.map((h) =>
              h.id === readingHabit.id
                ? {
                    ...h,
                    completions: {
                      ...(Array.isArray(h.completions)
                        ? Object.fromEntries(h.completions.map((c) => [c, { done: true, updatedAt: h.updatedAt || nowIso }]))
                        : (h.completions || {})),
                      [key]: { done: false, updatedAt: nowIso },
                    },
                    updatedAt: nowIso,
                  }
                : h
            );
          }
        }

        const idsArray = Array.from(allMatchingIds);
        const updatedDeletedEntityIds = [
          ...(prev.deletedEntityIds || []),
          ...idsArray,
          ...bookLogs.map((l) => l.id),
          ...habitExcisedIds,
        ].slice(-500);

        return {
          ...prev,
          books: [],
          libraryBooks: remainingBooks,
          readingLogs: updatedReadingLogs,
          habits: updatedHabits,
          weeklyGoals: removeLinkedWeeklyGoals(prev.weeklyGoals, 'reading', idsArray, currentWeekKey),
          deletedEntityIds: updatedDeletedEntityIds,
          ...awards.points,
        };
      },
      { immediate: true, actionLabel: 'Book deletion', entityId: bookId }
    )
  );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // --- SELF IMPROVEMENT BOOKS / CURATED ACTIONS ---
  const addCuratedBookToLibrary = useCallback((
    curatedBook: CuratedBook,
    initialStatus: UserBookStatus = 'to-read',
    customTotalAmount?: number,
    customUnit?: 'pages' | 'chapters',
    customTargetDate?: string
  ) => {
    setState((prev) => {
      // Prevent duplicates
      if (prev.libraryBooks.some((b) => b.curatedBookId === curatedBook.id)) return prev;

      const numPages = customTotalAmount || curatedBook.totalPages || curatedBook.totalAmount || 250;
      const now = trustedNow().toISOString();
      const unit = customUnit || 'pages';
      const newBook: UserBook = {
        id: `library-book-${trustedNowMs()}-${Math.random().toString(36).substring(2, 9)}`,
        curatedBookId: curatedBook.id,
        title: curatedBook.title,
        author: curatedBook.author,
        description: curatedBook.description,
        category: curatedBook.category,
        coverImageUrl: curatedBook.coverImageUrl,
        isCurated: true,
        isCustom: false,
        pointsReward: READING_POINTS.completionBonus,
        pointsAwarded: 0,
        status: initialStatus,
        totalAmount: numPages,
        totalPages: numPages,
        currentAmount: initialStatus === 'completed' ? numPages : 0,
        currentPage: initialStatus === 'completed' ? numPages : 0,
        unit,
        targetFinishDate: customTargetDate?.trim() || undefined,
        addedAt: now,
        updatedAt: now,
        dateStarted: initialStatus === 'reading' || initialStatus === 'completed' ? now : undefined,
        startedAt: initialStatus === 'reading' || initialStatus === 'completed' ? now : undefined,
        completedAt: initialStatus === 'completed' ? now : undefined,
        dateCompleted: initialStatus === 'completed' ? now : undefined,
      };


      return {
        ...prev,
        libraryBooks: [newBook, ...prev.libraryBooks],
        books: [],
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addCustomBookToLibrary = useCallback((
    title: string,
    author: string,
    description?: string,
    category?: BookCategory | string,
    totalAmount: number = 250,
    unit: 'pages' | 'chapters' = 'pages',
    status: UserBookStatus = 'reading',
    targetFinishDate?: string
  ) => {
    setState((prev) => {
      const now = trustedNow().toISOString();
      const newBook: UserBook = {
        id: `custom-book-${trustedNowMs()}-${Math.random().toString(36).substring(2, 9)}`,
        title: title.trim(),
        author: author.trim() || 'Unknown Author',
        description: description?.trim(),
        category,
        isCurated: false,
        isCustom: true,
        pointsReward: 0,
        pointsAwarded: 0,
        status,
        totalAmount,
        totalPages: totalAmount,
        currentAmount: 0,
        currentPage: 0,
        unit,
        targetFinishDate: targetFinishDate?.trim() || undefined,
        addedAt: now,
        updatedAt: now,
        dateStarted: status === 'reading' ? now : undefined,
        startedAt: status === 'reading' ? now : undefined,
      };


      return {
        ...prev,
        libraryBooks: [newBook, ...prev.libraryBooks],
        books: [],
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateUserBookStatus = useCallback(
    (
      bookId: string,
      status: UserBookStatus,
      options?: { totalAmount?: number; unit?: 'pages' | 'chapters'; targetFinishDate?: string }
    ) => {
      setState((prev) => {
        const now = trustedNow().toISOString();
        return {
          ...prev,
          libraryBooks: prev.libraryBooks.map((b) => {
            if (b.id === bookId || b.linkedBookId === bookId) {
              const maxPages = options?.totalAmount ?? b.totalAmount ?? b.totalPages ?? 250;
              const unit = options?.unit ?? b.unit ?? 'pages';
              const targetFinishDate = options?.targetFinishDate !== undefined ? options.targetFinishDate : b.targetFinishDate;
              return {
                ...b,
                status,
                totalAmount: maxPages,
                totalPages: maxPages,
                unit,
                targetFinishDate,
                currentAmount: status === 'completed' ? maxPages : b.currentAmount,
                currentPage: status === 'completed' ? maxPages : b.currentPage,
                isFinished: status === 'completed',
                updatedAt: now,
                dateStarted: status === 'reading' && !b.dateStarted ? now : b.dateStarted,
                startedAt: status === 'reading' && !b.startedAt ? now : b.startedAt,
                completedAt: status === 'completed' ? (b.completedAt || now) : undefined,
                dateCompleted: status === 'completed' ? (b.dateCompleted || now) : undefined,
              };
            }
            return b;
          }),
          books: [],
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const restartBook = useCallback((bookId: string) => {
    setState(
      (prev) => {
        const now = trustedNow().toISOString();
        const updatedLibraryBooks = prev.libraryBooks.map((lb) => {
          if (lb.id === bookId || lb.linkedBookId === bookId) {
            return {
              ...lb,
              currentAmount: 0,
              currentPage: 0,
              status: 'reading' as UserBookStatus,
              isFinished: false,
              updatedAt: now,
              dateStarted: now,
              startedAt: now,
              dateCompleted: undefined,
              completedAt: undefined,
              reflection: undefined,
            };
          }
          return lb;
        });

        return {
          ...prev,
          libraryBooks: updatedLibraryBooks,
          books: [],
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeBookFromLibrary = useCallback((userBookId: string) => {
    deleteBook(userBookId);
  }, [deleteBook]);

  const getUserBookStatus = useCallback(
    (curatedBookId: string): UserBookStatus | null => {
      const found = state.libraryBooks.find((lb) => lb.curatedBookId === curatedBookId);
      return found ? found.status : null;
    },
    [state.libraryBooks]
  );

  // --- MODULE 3: SKILL LEARNING TRACKER ACTIONS ---
  const addSkill = useCallback((name: string, category?: string, manualLevel?: SkillLevel) => {
    const skill: Skill = {
      id: uid(),
      name: name.trim(),
      category: category?.trim(),
      manualLevel,
      createdAt: trustedNow().toISOString(),
    };
    setState((prev) => {
      return { ...prev, skills: [...prev.skills, skill] };
    });
    return skill;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logSkillPractice = useCallback((skillId: string, durationMinutes: number, note: string) => {
    const date = todayKey();
    setState((prev) => {
      const targetSkill = prev.skills.find((s) => s.id === skillId);
      if (!targetSkill) return prev;

      const session: SkillSessionLog = {
        id: uid(),
        skillId,
        date,
        durationMinutes,
        note: note.trim(),
        pointsAwarded: 0,
        createdAt: trustedNow().toISOString(),
      };

      // The server writes the day's award (applySkillAwardsInternal shows the same row now).
      const awards = applySkillAwardsInternal(prev, [session, ...prev.skillLogs], prev.skills, date);
      return {
        ...prev,
        skillLogs: awards.skillLogs,
        ...awards.points,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSkillLevel = useCallback((skillId: string, manualLevel: SkillLevel) => {
    setState((prev) => {
      return {
        ...prev,
        skills: prev.skills.map((s) => (s.id === skillId ? { ...s, manualLevel } : s)),
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteSkill = useCallback((skillId: string) => {
    const currentWeekKey = weekKey(getNow());
    void (
      setState(
        (prev) => {
          const target = prev.skills.find((s) => s.id === skillId);
          if (!target) return prev;

          const remainingSkills = prev.skills.filter((s) => s.id !== skillId);
          const skillLogsToRemove = prev.skillLogs.filter((l) => l.skillId === skillId);
          const remainingSkillLogs = prev.skillLogs.filter((l) => l.skillId !== skillId);

          const updatedDeletedEntityIds = [
            ...(prev.deletedEntityIds || []),
            skillId,
            ...skillLogsToRemove.map((l) => l.id),
          ].slice(-500);

          // Only today's award follows the sessions; earlier days' points stay (as on the server).
          const awards = applySkillAwardsInternal(prev, remainingSkillLogs, remainingSkills, todayKey());

          return {
            ...prev,
            skills: remainingSkills,
            skillLogs: awards.skillLogs,
            weeklyGoals: removeLinkedWeeklyGoals(prev.weeklyGoals, 'skill', [skillId], currentWeekKey),
            deletedEntityIds: updatedDeletedEntityIds,
            ...awards.points,
          };
        },
        { immediate: true, actionLabel: 'Skill deletion', entityId: skillId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteSkillLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const target = prev.skillLogs.find((s) => s.id === logId);
        if (!target) return prev;

        const remainingSkillLogs = prev.skillLogs.filter((s) => s.id !== logId);
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);

        // Only today's award follows the sessions; an earlier day's points stay (as on the server).
        const today = todayKey();
        if (target.date !== today) {
          return { ...prev, skillLogs: remainingSkillLogs, deletedEntityIds: updatedDeletedEntityIds };
        }
        const awards = applySkillAwardsInternal(prev, remainingSkillLogs, prev.skills, today);
        return {
          ...prev,
          skillLogs: awards.skillLogs,
          deletedEntityIds: updatedDeletedEntityIds,
          ...awards.points,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- MODULE 4: BAD HABIT REDUCTION TRACKER ACTIONS ---
  const addBadHabit = useCallback((name: string, commitmentDays: number = 30) => {
    const finalCommitment = Math.max(30, Math.floor(Number(commitmentDays) || 30));
    const bh: BadHabit = {
      id: uid(),
      name: name.trim(),
      commitmentDays: finalCommitment,
      isCompleted: false,
      createdAt: trustedNow().toISOString(),
    };
    setState((prev) => {
      return { ...prev, badHabits: [...prev.badHabits, bh] };
    });
    return bh;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bad-habit points come from the server (src/lib/badHabitAwards.ts); each action below only
  // changes habits and logs and shows the server's result at once. Only today can be logged.
  const logBadHabitDay = useCallback((badHabitId: string, date: string, status: 'resisted' | 'occurred') => {
    setState((prev) => {
      const bh = prev.badHabits.find((b) => b.id === badHabitId);
      if (!bh || bh.isCompleted || date !== todayKey()) return prev;

      const existingLog = prev.badHabitLogs.find((l) => l.badHabitId === badHabitId && l.date === date);
      if (existingLog && existingLog.status === status) return prev;

      let consecutiveOccurrences = 0;
      if (status === 'occurred') {
        consecutiveOccurrences = 1;
        const pastLogs = prev.badHabitLogs
          .filter((l) => l && l.badHabitId === badHabitId && l.date < date)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        for (const log of pastLogs) {
          if (log.status !== 'occurred' && log.status !== 'no_report') break;
          consecutiveOccurrences++;
        }
      }

      const nowIso = trustedNow().toISOString();
      const newLog: BadHabitLog = {
        id: existingLog?.id || uid(),
        badHabitId,
        date,
        status,
        consecutiveOccurrences,
        pointsAwardedOrDeducted: 0,
        createdAt: existingLog?.createdAt || nowIso,
        updatedAt: nowIso,
      };
      const logs = [newLog, ...prev.badHabitLogs.filter((l) => !(l && l.badHabitId === badHabitId && l.date === date))];
      const awards = applyBadHabitAwardsInternal(prev, prev.badHabits, logs, date);
      return {
        ...prev,
        badHabitLogs: awards.logs,
        deletedEntityIds: (prev.deletedEntityIds || []).filter((id) => id !== `${badHabitId}_${date}`),
        ...awards.points,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undoTodayBadHabitLog = useCallback((badHabitId: string) => {
    setState((prev) => {
      const today = todayKey();
      const target = prev.badHabitLogs.find((l) => l.badHabitId === badHabitId && l.date === today);
      if (!target || target.status === 'no_report') return prev;

      const logs = prev.badHabitLogs.filter((l) => !(l.badHabitId === badHabitId && l.date === today));
      const awards = applyBadHabitAwardsInternal(prev, prev.badHabits, logs, today);
      return {
        ...prev,
        badHabitLogs: awards.logs,
        deletedEntityIds: Array.from(new Set([...(prev.deletedEntityIds || []), target.id])).slice(-500),
        ...awards.points,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteBadHabit = useCallback((badHabitId: string) => {
    void (
      setState(
        (prev) => {
          const bh = prev.badHabits.find((b) => b.id === badHabitId);
          const habitLogs = prev.badHabitLogs.filter((l) => l.badHabitId === badHabitId);
          const today = todayKey();
          const badHabits = prev.badHabits.filter((b) => b.id !== badHabitId);
          const logs = prev.badHabitLogs.filter((l) => l.badHabitId !== badHabitId);

          // Same as the server's bad_habits_award_points: an active habit gives back its resist
          // points and today's occurred penalty; past penalties stay.
          let base = prev;
          if (bh && !bh.isCompleted) {
            const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(
              prev,
              (entry) =>
                entry.metadata?.badHabitId === badHabitId &&
                ((entry.id || '').startsWith('bad_habit_resist_') || entry.id === badHabitOccurredId(badHabitId, today))
            );
            base = { ...prev, ...excised };
            const refund = legacyResistRefund(habitLogs, badHabitId);
            if (refund > 0 && !(base.pointsHistory || []).some((e) => e.id === badHabitDeleteId(badHabitId))) {
              base = {
                ...base,
                ...addPointsInternal(base, -refund, `Bad habit deleted: ${bh.name}`, 'bad_habit_delete', { badHabitId }, undefined, badHabitDeleteId(badHabitId)),
              };
            }
          }
          const awards = applyBadHabitAwardsInternal(base, badHabits, logs, today);

          const toTombstone = [...(prev.deletedEntityIds || []), badHabitId, ...habitLogs.map((l) => l.id).filter(Boolean)];
          return {
            ...base,
            badHabits,
            badHabitLogs: awards.logs,
            deletedEntityIds: Array.from(new Set(toTombstone)).slice(-500),
            ...awards.points,
          };
        },
        { immediate: true, actionLabel: 'Bad habit deletion', entityId: badHabitId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeBadHabit = useCallback((badHabitId: string) => {
    setState((prev) => {
      const bh = prev.badHabits.find((b) => b.id === badHabitId);
      if (!bh || bh.isCompleted) return prev;

      const nowIso = trustedNow().toISOString();
      const badHabits = prev.badHabits.map((b) => (b.id === badHabitId ? { ...b, isCompleted: true, completedAt: nowIso } : b));
      const awards = applyBadHabitAwardsInternal(prev, badHabits, prev.badHabitLogs, todayKey());
      return { ...prev, badHabits, badHabitLogs: awards.logs, ...awards.points };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateBadHabit = useCallback((badHabitId: string, updates: Partial<BadHabit>) => {
    setState((prev) => {
      const bh = prev.badHabits.find((b) => b.id === badHabitId);
      if (!bh) return prev;

      return {
        ...prev,
        badHabits: prev.badHabits.map((b) =>
          b.id === badHabitId
            ? { ...b, ...updates }
            : b
        ),
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- MODULE 5: ADDICTION RECOVERY ACTIONS ---
  const setAddictionTracker = useCallback((title: string, startDateIso?: string) => {
    setState((prev) => {
      const tracker: AddictionTracker = {
        id: prev.addictionTracker?.id || uid(),
        title: title.trim() || 'Sobriety Tracker',
        startDate: startDateIso || trustedNow().toISOString(),
        milestonesUnlocked: prev.addictionTracker?.milestonesUnlocked || [],
        awardedMilestones: prev.addictionTracker?.awardedMilestones || [],
        createdAt: prev.addictionTracker?.createdAt || trustedNow().toISOString(),
      };
      return { ...prev, addictionTracker: tracker };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAddictionStreak = useCallback(() => {
    setState((prev) => {
      if (!prev.addictionTracker) return prev;
      // A relapse starts a new streak; the server takes back this season's points of the old one.
      const next = {
        ...prev,
        addictionTracker: { ...prev.addictionTracker, startDate: trustedNow().toISOString(), milestonesUnlocked: [] },
      };
      return { ...next, ...applyRecoveryAwardsInternal(next) };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAddictionMilestones = useCallback(() => {
    setState((prev) => {
      if (!prev.addictionTracker) return prev;
      const startMs = trackerStartMs(prev.addictionTracker);
      const hoursElapsed = startMs === null ? 0 : (trustedNow().getTime() - startMs) / 3600000;

      const unlocked = [...prev.addictionTracker.milestonesUnlocked];
      for (const m of RECOVERY_MILESTONES) {
        if (hoursElapsed >= m.hours && !unlocked.includes(m.key)) unlocked.push(m.key);
      }
      const next =
        unlocked.length === prev.addictionTracker.milestonesUnlocked.length
          ? prev
          : { ...prev, addictionTracker: { ...prev.addictionTracker, milestonesUnlocked: unlocked } };

      // Milestone points and their notification come from the server; this only shows them early.
      if (computeRecoveryChanges(next.addictionTracker, next.pointsHistory || [], trustedNow().getTime()).length === 0) {
        return next;
      }
      return { ...next, ...applyRecoveryAwardsInternal(next) };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logCraving = useCallback((intensity: number, trigger: string, copingStrategy: string) => {
    const log: CravingLog = {
      id: uid(),
      date: trustedNow().toISOString(),
      intensity,
      trigger: trigger.trim(),
      copingStrategy: copingStrategy.trim(),
      createdAt: trustedNow().toISOString(),
    };
    setState((prev) => {
      return { ...prev, cravingLogs: [log, ...prev.cravingLogs] };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteAddictionTracker = useCallback(() => {
    void (
      setState(
        (prev) => {
          if (!prev.addictionTracker) return prev;
          const tracker = prev.addictionTracker;

          // The server takes back this season's milestone points; earlier seasons stay (Zakria 2026-10-15).
          const cleared = { ...prev, addictionTracker: null };
          const runningState = { ...cleared, ...applyRecoveryAwardsInternal(cleared) };

          const trackerId = tracker.id;
          const updatedDeletedEntityIds = [
            ...(runningState.deletedEntityIds || []),
            ...(trackerId ? [trackerId] : []),
            ...runningState.cravingLogs.map((l) => l.id),
          ].slice(-500);

          return {
            ...runningState,
            addictionTracker: null,
            cravingLogs: [],
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        {
          immediate: true,
          actionLabel: 'Sobriety tracker deletion',
          entityId: get().addictionTracker?.id || 'sobriety_tracker',
        }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get]);

  const deleteCravingLog = useCallback((logId: string) => {
    void (
      setState(
        (prev) => {
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
          return {
            ...prev,
            cravingLogs: prev.cravingLogs.filter((l) => l.id !== logId),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Craving log deletion', entityId: logId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- MODULE 7: PREFRONTAL CORTEX ACTIONS ---
  const logFocusSession = useCallback((taskName: string, durationMinutes: number, skillId?: string, reflection?: string) => {
    const date = todayKey();
    setState((prev) => {
      const focusLog: FocusSessionLog = {
        id: uid(),
        date,
        taskName: taskName.trim() || 'Deep Focus',
        skillId,
        durationMinutes,
        pointsAwarded: 0,
        reflection: reflection?.trim() || undefined,
        createdAt: trustedNow().toISOString(),
      };
      // The server writes the day's award (applyFocusAwardsInternal shows the same row now).
      const awards = applyFocusAwardsInternal(prev, [focusLog, ...prev.focusLogs], date);
      return { ...prev, focusLogs: awards.focusLogs, ...awards.points };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFocusLogReflection = useCallback((logId: string, reflection: string) => {
    setState((prev) => {
      const idx = prev.focusLogs.findIndex((f) => f.id === logId);
      if (idx === -1) return prev;

      const updated = {
        ...prev.focusLogs[idx],
        reflection: reflection.trim() || undefined,
      };

      const updatedLogs = [...prev.focusLogs];
      updatedLogs[idx] = updated;

      return {
        ...prev,
        focusLogs: updatedLogs,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addDecision = useCallback((title: string, rationale: string, expectedOutcome: string, revisitDate: string) => {
    const decision: DecisionLog = {
      id: uid(),
      title: title.trim(),
      rationale: rationale.trim(),
      expectedOutcome: expectedOutcome.trim(),
      revisitDate,
      isReflected: false,
      createdAt: trustedNow().toISOString(),
    };
    setState((prev) => {
      return { ...prev, decisionLogs: [decision, ...prev.decisionLogs] };
    });
    return decision;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reflectDecision = useCallback((decisionId: string, reflection: string) => {
    setState((prev) => {
      const idx = prev.decisionLogs.findIndex((d) => d.id === decisionId);
      if (idx === -1) return prev;
      const target = prev.decisionLogs[idx];
      if (target.isReflected) return prev;

      const updated = { ...target, reflection: reflection.trim(), isReflected: true };
      const updatedLogs = [...prev.decisionLogs];
      updatedLogs[idx] = updated;

      return { ...prev, decisionLogs: updatedLogs };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logEmotion = useCallback((emotion: string, intensity: number, context: string) => {
    const log: EmotionLog = {
      id: uid(),
      date: trustedNow().toISOString(),
      emotion: emotion.trim(),
      intensity,
      context: context.trim(),
      pointsAwarded: 0,
      createdAt: trustedNow().toISOString(),
    };
    setState((prev) => {
      return {
        ...prev,
        emotionLogs: [log, ...prev.emotionLogs],
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteFocusLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const target = prev.focusLogs.find((f) => f.id === logId);
        if (!target) return prev;

        const remainingFocusLogs = prev.focusLogs.filter((f) => f.id !== logId);
        // Only today's award changes: an earlier day's points stay (the server recomputes only today).
        const awards = applyFocusAwardsInternal(prev, remainingFocusLogs, todayKey());

        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
        return {
          ...prev,
          focusLogs: awards.focusLogs,
          deletedEntityIds: updatedDeletedEntityIds,
          ...awards.points,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteDecisionLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
        return {
          ...prev,
          decisionLogs: prev.decisionLogs.filter((d) => d.id !== logId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteEmotionLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
        return {
          ...prev,
          emotionLogs: prev.emotionLogs.filter((e) => e.id !== logId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addWeeklyReflection = useCallback((targetWeekKey: string, content: string) => {
    if (!content.trim()) return;
    if (!isReflectionWindowOpen(targetWeekKey, getNow())) {
      throw new Error('Reflections can only be written while the Reflection Window is open.');
    }
    setState((prev) => {
      const idx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
      const existingDoc = idx >= 0 ? prev.weeklyGoals[idx] : null;

      const existingReflections = existingDoc?.reflections || [];

      const newRef: WeeklyGoalReflection = {
        id: uid(),
        content: content.trim(),
        createdAt: trustedNow().toISOString(),
        pointsAwarded: false,
      };

      const candidateReflections = [...existingReflections, newRef];

      const { updatedReflections, nextState } = reconcileReflectionPoints(
        prev,
        targetWeekKey,
        candidateReflections,
        getNow()
      );

      const updatedDoc: WeeklyGoal = {
        id: existingDoc ? existingDoc.id : uid(),
        weekKey: targetWeekKey,
        goals: existingDoc ? existingDoc.goals : [],
        reflections: updatedReflections,
        createdAt: existingDoc ? existingDoc.createdAt : trustedNow().toISOString(),
      };

      let newWeeklyGoals = [...nextState.weeklyGoals];
      if (idx >= 0) {
        newWeeklyGoals[idx] = updatedDoc;
      } else {
        newWeeklyGoals = [updatedDoc, ...newWeeklyGoals];
      }

      return {
        ...nextState,
        weeklyGoals: newWeeklyGoals,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateWeeklyReflection = useCallback((targetWeekKey: string, reflectionId: string, content: string) => {
    if (!content.trim()) return;
    if (!isReflectionWindowOpen(targetWeekKey, getNow())) {
      throw new Error('Reflections can only be written while the Reflection Window is open.');
    }
    setState((prev) => {
      const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
      if (docIdx === -1) return prev;

      const doc = prev.weeklyGoals[docIdx];
      const reflections = doc.reflections || [];
      const refIdx = reflections.findIndex((r) => r.id === reflectionId);
      if (refIdx === -1) return prev;

      const existingRef = reflections[refIdx];
      const updatedRef: WeeklyGoalReflection = {
        ...existingRef,
        content: content.trim(),
        updatedAt: trustedNow().toISOString(),
      };

      const candidateReflections = [...reflections];
      candidateReflections[refIdx] = updatedRef;

      const { updatedReflections, nextState } = reconcileReflectionPoints(
        prev,
        targetWeekKey,
        candidateReflections,
        getNow()
      );

      const updatedDoc = { ...doc, reflections: updatedReflections };
      const newWeeklyGoals = [...nextState.weeklyGoals];
      newWeeklyGoals[docIdx] = updatedDoc;

      return {
        ...nextState,
        weeklyGoals: newWeeklyGoals,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteWeeklyReflection = useCallback((targetWeekKey: string, reflectionId: string) => {
    if (!isReflectionWindowOpen(targetWeekKey, getNow())) {
      throw new Error('Reflections can only be written while the Reflection Window is open.');
    }
    void (
      setState(
        (prev) => {
          const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
          if (docIdx === -1) return prev;

          const doc = prev.weeklyGoals[docIdx];
          const targetRef = (doc.reflections || []).find((r) => r.id === reflectionId);
          if (!targetRef) return prev;

          const candidateReflections = (doc.reflections || []).filter((r) => r.id !== reflectionId);

          const { updatedReflections, nextState } = reconcileReflectionPoints(
            prev,
            targetWeekKey,
            candidateReflections,
            getNow()
          );

          const updatedDoc = { ...doc, reflections: updatedReflections };
          const newWeeklyGoals = [...nextState.weeklyGoals];
          newWeeklyGoals[docIdx] = updatedDoc;
          const updatedDeletedEntityIds = [...(nextState.deletedEntityIds || []), reflectionId].slice(-500);

          return {
            ...nextState,
            weeklyGoals: newWeeklyGoals,
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Weekly reflection deletion', entityId: reflectionId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addWeeklyGoalItem = useCallback((targetWeekKey: string, goalData: Partial<WeeklyGoalItem>) => {
    const currentWeek = weekKey(getNow());
    if (targetWeekKey < currentWeek) {
      throw new Error('Past weeks are read-only.');
    }
    setState((prev) => {
      const idx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
      const existingDoc = idx >= 0 ? prev.weeklyGoals[idx] : null;

      const isLinked = Boolean(goalData.linkedModule && goalData.linkedModule !== 'none');

      let isCompleted = false;
      let manualProgress: number | undefined = undefined;
      let completedAt: string | undefined = undefined;

      if (isLinked) {
        isCompleted = false;
        manualProgress = 0;
        completedAt = undefined;
      } else {
        const targetVal = typeof goalData.targetValue === 'number' && goalData.targetValue > 0 ? goalData.targetValue : 1;
        manualProgress = typeof goalData.manualProgress === 'number' ? goalData.manualProgress : 0;
        isCompleted = goalData.completed !== undefined
          ? Boolean(goalData.completed)
          : (manualProgress >= targetVal);
        completedAt = isCompleted ? (goalData.completedAt || trustedNow().toISOString()) : undefined;
      }

      if (targetWeekKey > currentWeek) {
        isCompleted = false;
        completedAt = undefined;
        manualProgress = 0;
      }

      const newItem: WeeklyGoalItem = {
        id: uid(),
        title: (goalData.title || goalData.text || '').trim() || 'New Weekly Goal',
        targetDescription: goalData.targetDescription?.trim() || '',
        priority: goalData.priority || 'medium',
        linkedModule: goalData.linkedModule || 'none',
        linkedItemId: goalData.linkedItemId || undefined,
        linkedMetricKey: goalData.linkedMetricKey || undefined,
        targetValue: typeof goalData.targetValue === 'number' && goalData.targetValue > 0 ? goalData.targetValue : undefined,
        unit: goalData.unit?.trim() || undefined,
        manualProgress,
        completed: isCompleted,
        done: isCompleted,
        completedAt,
        carriedOverFromWeekKey: goalData.carriedOverFromWeekKey,
        carriedOverFromGoalId: goalData.carriedOverFromGoalId || undefined,
        createdAt: trustedNow().toISOString(),
      };

      const updatedGoals = existingDoc ? [...existingDoc.goals, newItem] : [newItem];
      const updatedDoc: WeeklyGoal = {
        id: existingDoc ? existingDoc.id : uid(),
        weekKey: targetWeekKey,
        goals: updatedGoals,
        reflections: existingDoc?.reflections || [],
        createdAt: existingDoc ? existingDoc.createdAt : trustedNow().toISOString(),
      };

      const newWeeklyGoals = [...prev.weeklyGoals];
      if (idx >= 0) {
        newWeeklyGoals[idx] = updatedDoc;
      } else {
        newWeeklyGoals.unshift(updatedDoc);
      }

      const pointsUpdate = recomputeWeeklyGoalsPointsForState(prev, targetWeekKey, updatedGoals, newItem.id);

      return {
        ...prev,
        weeklyGoals: newWeeklyGoals,
        ...pointsUpdate,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateWeeklyGoalItem = useCallback((targetWeekKey: string, goalId: string, updates: Partial<WeeklyGoalItem>) => {
    const currentWeek = weekKey(getNow());
    if (targetWeekKey < currentWeek) {
      const keys = Object.keys(updates);
      if (keys.length !== 1 || keys[0] !== 'carryOverDismissed') {
        throw new Error('Past weeks are read-only.');
      }
    }
    setState((prev) => {
      const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
      if (docIdx === -1) return prev;

      const doc = prev.weeklyGoals[docIdx];
      const goalIdx = doc.goals.findIndex((g) => g.id === goalId);
      if (goalIdx === -1) return prev;

      const existingGoal = doc.goals[goalIdx];

      let effectiveUpdates = updates;
      if (targetWeekKey > currentWeek) {
        const { completed, completedAt, manualProgress, done, ...rest } = updates as any;
        effectiveUpdates = rest;
      }

      // Check if re-linked (converting between freeform/linked, or pointing to a different habit/workout/book/skill/metric)
      const targetLinkedModule = effectiveUpdates.linkedModule !== undefined ? effectiveUpdates.linkedModule : existingGoal.linkedModule;
      const isReLinked =
        (effectiveUpdates.linkedModule !== undefined && effectiveUpdates.linkedModule !== existingGoal.linkedModule) ||
        (effectiveUpdates.linkedItemId !== undefined && effectiveUpdates.linkedItemId !== existingGoal.linkedItemId) ||
        (effectiveUpdates.linkedMetricKey !== undefined && effectiveUpdates.linkedMetricKey !== existingGoal.linkedMetricKey);

      const isLinkedGoal = Boolean(targetLinkedModule && targetLinkedModule !== 'none');

      let nextCompleted = existingGoal.completed;
      let nextCompletedAt = existingGoal.completedAt;
      let nextManualProgress = existingGoal.manualProgress;

      if (isReLinked) {
        // If re-linked, reset completion state so it can be cleanly re-evaluated
        nextCompleted = false;
        nextCompletedAt = undefined;
        nextManualProgress = 0;
      } else if (isLinkedGoal) {
        // For linked goals, manual completion overrides are ignored; completed/completedAt are managed by reconcileLinkedWeeklyGoals
        nextManualProgress = 0;
      } else {
        // Freeform goal: calculate completion from updates.completed or manualProgress vs targetValue
        const targetVal = effectiveUpdates.targetValue !== undefined && effectiveUpdates.targetValue > 0
          ? effectiveUpdates.targetValue
          : (existingGoal.targetValue && existingGoal.targetValue > 0 ? existingGoal.targetValue : 1);

        nextManualProgress = effectiveUpdates.manualProgress !== undefined
          ? effectiveUpdates.manualProgress
          : existingGoal.manualProgress;

        if (effectiveUpdates.completed !== undefined) {
          nextCompleted = Boolean(effectiveUpdates.completed);
          if (nextCompleted) {
            nextCompletedAt = effectiveUpdates.completedAt || existingGoal.completedAt || trustedNow().toISOString();
          } else {
            nextCompletedAt = undefined;
          }
        } else if (effectiveUpdates.manualProgress !== undefined || effectiveUpdates.targetValue !== undefined) {
          if (nextManualProgress !== undefined && nextManualProgress >= targetVal) {
            nextCompleted = true;
            nextCompletedAt = existingGoal.completedAt || trustedNow().toISOString();
          } else if (nextManualProgress !== undefined && nextManualProgress < targetVal) {
            nextCompleted = false;
            nextCompletedAt = undefined;
          }
        }
      }

      if (targetWeekKey > currentWeek) {
        nextCompleted = false;
        nextCompletedAt = undefined;
        nextManualProgress = 0;
      }

      const updatedGoal: WeeklyGoalItem = {
        ...existingGoal,
        ...effectiveUpdates,
        completed: nextCompleted,
        done: nextCompleted,
        completedAt: nextCompletedAt,
        manualProgress: isLinkedGoal ? 0 : nextManualProgress,
        title: effectiveUpdates.title !== undefined ? effectiveUpdates.title.trim() : existingGoal.title,
        targetDescription: effectiveUpdates.targetDescription !== undefined ? effectiveUpdates.targetDescription.trim() : existingGoal.targetDescription,
      };

      const updatedGoals = [...doc.goals];
      updatedGoals[goalIdx] = updatedGoal;

      const updatedDoc = { ...doc, goals: updatedGoals };
      const newWeeklyGoals = [...prev.weeklyGoals];
      newWeeklyGoals[docIdx] = updatedDoc;

      const pointsUpdate = targetWeekKey < currentWeek ? {} : recomputeWeeklyGoalsPointsForState(prev, targetWeekKey, updatedGoals, goalId);

      return {
        ...prev,
        weeklyGoals: newWeeklyGoals,
        ...pointsUpdate,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteWeeklyGoalItem = useCallback((targetWeekKey: string, goalId: string) => {
    const currentWeek = weekKey(getNow());
    if (targetWeekKey < currentWeek) {
      throw new Error('Past weeks are read-only.');
    }
    void (
      setState(
        (prev) => {
          const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
          if (docIdx === -1) return prev;

          const doc = prev.weeklyGoals[docIdx];
          const deletedGoal = doc.goals.find((g) => g.id === goalId);
          const updatedGoals = doc.goals.filter((g) => g.id !== goalId);

          const updatedDoc = { ...doc, goals: updatedGoals };
          const newWeeklyGoals = [...prev.weeklyGoals];
          newWeeklyGoals[docIdx] = updatedDoc;

          // Deleting a carried-over goal settles its source (Zakria 2026-10-15): the source is
          // marked dismissed so it does not come back as an unresolved goal from an earlier week.
          if (deletedGoal?.carriedOverFromWeekKey && deletedGoal.carriedOverFromGoalId) {
            const sourceIdx = newWeeklyGoals.findIndex((w) => w.weekKey === deletedGoal.carriedOverFromWeekKey);
            const sourceDoc = sourceIdx >= 0 ? newWeeklyGoals[sourceIdx] : null;
            if (sourceDoc?.goals.some((g) => g.id === deletedGoal.carriedOverFromGoalId && !g.carryOverDismissed)) {
              newWeeklyGoals[sourceIdx] = {
                ...sourceDoc,
                goals: sourceDoc.goals.map((g) =>
                  g.id === deletedGoal.carriedOverFromGoalId ? { ...g, carryOverDismissed: true } : g
                ),
              };
            }
          }
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), goalId].slice(-500);
          const pointsUpdate = recomputeWeeklyGoalsPointsForState(prev, targetWeekKey, updatedGoals, goalId);

          const mergedDeletedEntityIds = Array.from(
            new Set([...updatedDeletedEntityIds, ...(pointsUpdate.deletedEntityIds || [])])
          ).slice(-500);

          return {
            ...prev,
            weeklyGoals: newWeeklyGoals,
            ...pointsUpdate,
            deletedEntityIds: mergedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Weekly goal deletion', entityId: goalId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carryOverGoal = useCallback((sourceWeekKey: string, targetWeekKey: string, goalId: string, options?: { resumeProgress?: boolean }) => {
    const currentWeek = weekKey(getNow());
    if (targetWeekKey !== currentWeek) {
      return;
    }
    setState((prev) => {
      const sourceDoc = prev.weeklyGoals.find((w) => w.weekKey === sourceWeekKey);
      if (!sourceDoc) return prev;

      const targetGoal = sourceDoc.goals.find((g) => g.id === goalId);
      if (!targetGoal) return prev;

      // Check if already carried over to targetWeekKey
      const targetDocIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === targetWeekKey);
      const targetDoc = targetDocIdx >= 0 ? prev.weeklyGoals[targetDocIdx] : null;

      if (
        targetDoc &&
        targetDoc.goals.some(
          (g) =>
            g.carriedOverFromGoalId === targetGoal.id ||
            (!g.carriedOverFromGoalId &&
              g.title.trim().toLowerCase() === targetGoal.title.trim().toLowerCase())
        )
      ) {
        return prev;
      }

      const carriedItem: WeeklyGoalItem = {
        ...targetGoal,
        id: uid(),
        completed: false,
        done: false,
        completedAt: undefined,
        manualProgress: options?.resumeProgress ? (targetGoal.manualProgress || 0) : 0,
        carriedOverFromWeekKey: sourceWeekKey,
        carriedOverFromGoalId: targetGoal.id,
        createdAt: trustedNow().toISOString(),
      };

      const newGoals = targetDoc ? [...targetDoc.goals, carriedItem] : [carriedItem];
      const newDoc: WeeklyGoal = {
        id: targetDoc ? targetDoc.id : uid(),
        weekKey: targetWeekKey,
        goals: newGoals,
        reflections: targetDoc?.reflections || [],
        createdAt: targetDoc ? targetDoc.createdAt : trustedNow().toISOString(),
      };

      let newWeeklyGoals = [...prev.weeklyGoals];
      if (targetDocIdx >= 0) {
        newWeeklyGoals[targetDocIdx] = newDoc;
      } else {
        newWeeklyGoals.unshift(newDoc);
      }

      const pointsUpdate = recomputeWeeklyGoalsPointsForState(prev, targetWeekKey, newGoals, carriedItem.id);

      return {
        ...prev,
        weeklyGoals: newWeeklyGoals,
        ...pointsUpdate,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncLinkedWeeklyGoals = useCallback(() => {
    setState((prev) =>
      reconcileWeeklyGoalsPointsForAllWeeks(
        reconcileLinkedWeeklyGoals(prev, leagueNow()),
        leagueNow()
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleNotifSundayPlanning = useCallback(() => {
    setState((prev) => {
      if (!prev.currentUser) return prev;
      const nextVal = !(prev.currentUser.notifSundayPlanning ?? true);
      const updatedUser: UserProfile = {
        ...prev.currentUser,
        notifSundayPlanning: nextVal,
      };

      if (prev.currentUser.id) {
        updateProfileNotificationPreferences(prev.currentUser.id, { notifSundayPlanning: nextVal });
      }

      return { ...prev, currentUser: updatedUser };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- MODULE: PROJECTS & GOALS ACTIONS ---
  const createGoal = useCallback(
    (data: {
      title: string;
      description?: string;
      category?: string;
      targetDate?: string;
      status?: GoalStatus;
      manualProgress?: number;
      sequentialMode?: boolean;
    }) => {
      const newGoal: Goal = {
        id: uid(),
        title: data.title.trim(),
        description: data.description?.trim() || undefined,
        category: data.category?.trim() || undefined,
        targetDate: data.targetDate || undefined,
        status: data.status || 'active',
        manualProgress: data.manualProgress !== undefined ? data.manualProgress : 0,
        sequentialMode: Boolean(data.sequentialMode),
        createdAt: trustedNow().toISOString(),
      };
      setState(
        (prev) => {
          return {
            ...prev,
            goals: [newGoal, ...prev.goals],
          };
        },
        { immediate: true }
      );
      return newGoal;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateGoal = useCallback(
    (id: string, updates: Partial<Omit<Goal, 'id' | 'createdAt'>>) => {
      setState(
        (prev) => {
          return {
            ...prev,
            goals: prev.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const deleteGoal = useCallback((id: string) => {
    void (
      setState(
        (prev) => {
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), id].slice(-500);
          return {
            ...prev,
            // Unlink linked projects by setting their goalId to undefined
            projects: prev.projects.map((p) => (p.goalId === id ? { ...p, goalId: undefined } : p)),
            // Remove goal
            goals: prev.goals.filter((g) => g.id !== id),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Goal deletion', entityId: id }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper to compute updated completedAt timestamp on project status changes
  const resolveProjectCompletedAt = (
    currentStatus: ProjectStatus,
    newStatus: ProjectStatus | undefined,
    currentCompletedAt?: string,
    explicitCompletedAt?: string
  ): string | undefined => {
    if (newStatus === undefined || newStatus === currentStatus) {
      return explicitCompletedAt !== undefined ? explicitCompletedAt : currentCompletedAt;
    }
    if (newStatus === 'completed') {
      return currentCompletedAt || trustedNow().toISOString();
    }
    return undefined;
  };

  const createProject = useCallback(
    (data: {
      title: string;
      description?: string;
      goalId?: string;
      startDate?: string;
      dueDate?: string;
      status?: ProjectStatus;
      manualProgress?: number;
      order?: number;
    }) => {
      const isCompleted = data.status === 'completed';
      let projectOrder = data.order;
      if (projectOrder === undefined && data.goalId) {
        const existingCount = state.projects.filter((p) => p.goalId === data.goalId).length;
        projectOrder = existingCount;
      }

      const newProject: Project = {
        id: uid(),
        title: data.title.trim(),
        description: data.description?.trim() || undefined,
        goalId: data.goalId || undefined,
        startDate: data.startDate || undefined,
        dueDate: data.dueDate || undefined,
        status: data.status || 'not_started',
        completedAt: isCompleted ? trustedNow().toISOString() : undefined,
        manualProgress: data.manualProgress !== undefined ? data.manualProgress : 0,
        order: projectOrder !== undefined ? projectOrder : 0,
        createdAt: trustedNow().toISOString(),
      };
      setState(
        (prev) => {
          return {
            ...prev,
            projects: [newProject, ...prev.projects],
          };
        },
        { immediate: true }
      );
      return newProject;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.projects]
  );

  const updateProject = useCallback(
    (id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>) => {
      setState(
        (prev) => {
          return {
            ...prev,
            projects: prev.projects.map((p) => {
              if (p.id !== id) return p;
              const completedAt = resolveProjectCompletedAt(p.status, updates.status, p.completedAt, updates.completedAt);
              return { ...p, ...updates, completedAt };
            }),
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const moveProjectOrder = useCallback((arg1: string, arg2: string | 'up' | 'down', arg3?: 'up' | 'down') => {
    setState(
      (prev) => {
        let targetGoalId: string | undefined;
        let targetProjectId: string;
        let direction: 'up' | 'down';

        if (arg3 !== undefined) {
          targetGoalId = arg1;
          targetProjectId = arg2 as string;
          direction = arg3;
        } else {
          targetProjectId = arg1;
          direction = arg2 as 'up' | 'down';
          const found = prev.projects.find((p) => p.id === targetProjectId);
          targetGoalId = found?.goalId;
        }

        if (!targetGoalId) return prev;

        const goalProjects = prev.projects
          .filter((p) => p.goalId === targetGoalId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const currIdx = goalProjects.findIndex((p) => p.id === targetProjectId);
        if (currIdx === -1) return prev;
        const targetIdx = direction === 'up' ? currIdx - 1 : currIdx + 1;
        if (targetIdx < 0 || targetIdx >= goalProjects.length) return prev;

        const reordered = [...goalProjects];
        const temp = reordered[currIdx];
        reordered[currIdx] = reordered[targetIdx];
        reordered[targetIdx] = temp;

        const orderMap = new Map<string, number>();
        reordered.forEach((p, idx) => {
          orderMap.set(p.id, idx);
        });

        return {
          ...prev,
          projects: prev.projects.map((p) => {
            if (p.goalId === targetGoalId && orderMap.has(p.id)) {
              return { ...p, order: orderMap.get(p.id)! };
            }
            return p;
          }),
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveProjectStatus = useCallback((id: string, newStatus: ProjectStatus) => {
    setState(
      (prev) => {
        return {
          ...prev,
          projects: prev.projects.map((p) => {
            if (p.id !== id) return p;
            const completedAt = resolveProjectCompletedAt(p.status, newStatus, p.completedAt);
            return { ...p, status: newStatus, completedAt };
          }),
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteProject = useCallback((id: string) => {
    void (
      setState(
        (prev) => {
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), id].slice(-500);
          return {
            ...prev,
            // Unlink linked tasks by setting their projectId to undefined
            tasks: prev.tasks.map((t) => (t.projectId === id ? { ...t, projectId: undefined } : t)),
            // Remove project
            projects: prev.projects.filter((p) => p.id !== id),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Project deletion', entityId: id }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createTask = useCallback(
    (data: {
      title: string;
      description?: string;
      projectId?: string;
      dueDate?: string;
      priority?: TaskPriority;
      completed?: boolean;
      subtasks?: TaskSubtask[];
    }) => {
      const subtasks = Array.isArray(data.subtasks) ? data.subtasks : [];
      const isCompleted = subtasks.length > 0
        ? subtasks.every((st) => st.completed)
        : Boolean(data.completed);

      const newTask: Task = {
        id: uid(),
        title: data.title.trim(),
        description: data.description?.trim() || undefined,
        projectId: data.projectId || undefined,
        dueDate: data.dueDate || undefined,
        priority: data.priority || 'medium',
        completed: isCompleted,
        subtasks,
        createdAt: trustedNow().toISOString(),
      };
      setState(
        (prev) => {
          return {
            ...prev,
            tasks: [newTask, ...prev.tasks],
          };
        },
        { immediate: true }
      );
      return newTask;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateTask = useCallback(
    (id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => {
      setState((prev) => {
        return {
          ...prev,
          tasks: prev.tasks.map((t) => {
            if (t.id !== id) return t;
            const updatedSubtasks = updates.subtasks !== undefined ? updates.subtasks : t.subtasks;
            const updatedCompleted = (updatedSubtasks && updatedSubtasks.length > 0)
              ? updatedSubtasks.every((st) => st.completed)
              : updates.completed !== undefined
              ? updates.completed
              : t.completed;
            return { ...t, ...updates, completed: updatedCompleted };
          }),
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const toggleTaskCompleted = useCallback((id: string) => {
    setState((prev) => {
      const target = prev.tasks.find((t) => t.id === id);
      if (!target || (target.subtasks || []).length > 0) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((t) => {
          if (t.id !== id) return t;
          return { ...t, completed: !t.completed };
        }),
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteTask = useCallback((id: string) => {
    void (
      setState(
        (prev) => {
          const targetTask = prev.tasks.find((t) => t.id === id);
          const subtaskIds = (targetTask?.subtasks || []).map((s) => s.id);
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), id, ...subtaskIds].slice(-500);
          return {
            ...prev,
            tasks: prev.tasks.filter((t) => t.id !== id),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Task deletion', entityId: id }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSubtask = useCallback((taskId: string, subtaskId: string) => {
    setState((prev) => {
      return {
        ...prev,
        tasks: prev.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const updatedSubtasks = (t.subtasks || []).map((st) =>
            st.id === subtaskId ? { ...st, completed: !st.completed } : st
          );
          const allCompleted = updatedSubtasks.length > 0 && updatedSubtasks.every((st) => st.completed);
          return { ...t, subtasks: updatedSubtasks, completed: allCompleted };
        }),
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addSubtask = useCallback((taskId: string, title: string) => {
    if (!title.trim()) return;
    const newSubtask: TaskSubtask = {
      id: uid(),
      title: title.trim(),
      completed: false,
    };
    setState((prev) => {
      return {
        ...prev,
        tasks: prev.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const updatedSubtasks = [...(t.subtasks || []), newSubtask];
          const allCompleted = updatedSubtasks.length > 0 && updatedSubtasks.every((st) => st.completed);
          return { ...t, subtasks: updatedSubtasks, completed: allCompleted };
        }),
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteSubtask = useCallback((taskId: string, subtaskId: string) => {
    void (
      setState(
        (prev) => {
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), subtaskId].slice(-500);
          return {
            ...prev,
            tasks: prev.tasks.map((t) => {
              if (t.id !== taskId) return t;
              const updatedSubtasks = (t.subtasks || []).filter((st) => st.id !== subtaskId);
              const allCompleted = updatedSubtasks.length > 0 ? updatedSubtasks.every((st) => st.completed) : t.completed;
              return {
                ...t,
                subtasks: updatedSubtasks,
                completed: allCompleted,
              };
            }),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true, actionLabel: 'Subtask deletion', entityId: subtaskId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- SOCIAL FEATURE 1: PERSONAL IMPROVEMENT PLANS ACTIONS ---
  const handlePlanSyncExecution = useCallback((planToSync: ImprovementPlan) => {
    syncPlanToSupabase(planToSync)
      .then((res) => {
        if (res) {
          setState((prev) => ({
            ...prev,
            improvementPlans: prev.improvementPlans.map((p) =>
              p.id === planToSync.id ? { ...p, syncStatus: 'synced' } : p
            ),
          }));
        } else {
          setState((prev) => ({
            ...prev,
            improvementPlans: prev.improvementPlans.map((p) =>
              p.id === planToSync.id ? { ...p, syncStatus: 'failed' } : p
            ),
          }));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('app-toast-error', {
                detail: {
                  title: "Couldn't save plan",
                  message: "It's saved on this device and will retry automatically.",
                  dedupKey: `plan_sync_failed_${planToSync.id}`,
                },
              })
            );
          }
        }
      })
      .catch((_err) => {
        setState((prev) => ({
          ...prev,
          improvementPlans: prev.improvementPlans.map((p) =>
            p.id === planToSync.id ? { ...p, syncStatus: 'failed' } : p
          ),
        }));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('app-toast-error', {
              detail: {
                title: "Couldn't save plan",
                message: "It's saved on this device and will retry automatically.",
                dedupKey: `plan_sync_failed_${planToSync.id}`,
              },
            })
          );
        }
      });
    // False positive: setState is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createImprovementPlan = useCallback(
    (
      title: string,
      description: string,
      isPublic: boolean,
      stepTitles: string[],
      category?: string,
      planType: PlanType = 'milestone',
      typeParams?: {
        targetValue?: number;
        targetUnit?: string;
        currentProgress?: number;
        targetDate?: string;
        cadence?: 'daily' | 'weekly';
        duration?: number;
        startDate?: string;
        targetReviewDate?: string;
        initialReflectionNote?: string;
        reviewCadence?: 'weekly' | 'monthly' | null;
      }
    ) => {
      let newPlan: ImprovementPlan | null = null;
      setState((prev) => {
        const steps: PlanStep[] = (stepTitles || [])
          .filter((t) => t.trim().length > 0)
          .map((t, i) => ({
            id: uid(),
            title: t.trim(),
            orderIndex: i,
            completed: false,
          }));

        const reflectionNotes: PlanReflectionNote[] = typeParams?.initialReflectionNote
          ? [{ id: uid(), createdAt: trustedNow().toISOString(), note: typeParams.initialReflectionNote.trim() }]
          : [];

        const isVision = planType === 'vision';
        const reviewCadence = isVision
          ? (typeParams?.reviewCadence || 'weekly')
          : (typeParams?.reviewCadence || null);

        let nextReviewDueAt: string | null = null;
        if (reviewCadence === 'weekly') {
          nextReviewDueAt = new Date(trustedNowMs() + 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (reviewCadence === 'monthly') {
          nextReviewDueAt = new Date(trustedNowMs() + 30 * 24 * 60 * 60 * 1000).toISOString();
        }

        newPlan = {
          id: generateUUID(),
          creatorId: prev.currentUser?.id || generateUUID(),
          creatorUsername: prev.username,
          creatorAvatar: prev.currentUser?.avatar || '🧑',
          creatorPoints: prev.totalPoints,
          title: title.trim(),
          description: description.trim(),
          category: category?.trim() || 'Personal Growth',
          isPublic,
          steps,
          copyCount: 0,
          createdAt: trustedNow().toISOString(),

          // Phase B Plan Type Properties
          planType,
          targetValue: typeParams?.targetValue,
          targetUnit: typeParams?.targetUnit,
          currentProgress: typeParams?.currentProgress ?? 0,
          targetDate: typeParams?.targetDate,
          cadence: typeParams?.cadence ?? 'daily',
          duration: typeParams?.duration ?? 30,
          startDate: typeParams?.startDate || trustedNow().toISOString(),
          streakCount: 0,
          lastCompletedDate: undefined,
          targetReviewDate: typeParams?.targetReviewDate,
          reflectionNotes,

          // Phase C Review Loop
          reviewCadence,
          nextReviewDueAt,

          // Client-side/user_data sync tracking
          syncStatus: 'pending',
        };

        return {
          ...prev,
          improvementPlans: [newPlan, ...prev.improvementPlans],
        };
      });

      if (newPlan) {
        const planToSync = newPlan as ImprovementPlan;
        updateCachedPublicPlan(planToSync);
        syncBroadcaster.broadcast('PLAN_CREATED', planToSync);
        handlePlanSyncExecution(planToSync);
      }
      return newPlan;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateTargetGoalProgress = useCallback((planId: string, newProgress: number) => {
    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];
      const validProgress = Math.min(target.targetValue || 0, Math.max(0, newProgress));

      updatedPlan = {
        ...target,
        currentProgress: validProgress,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;
      return { ...prev, improvementPlans: updatedPlans };
    });

    if (updatedPlan) {
      updateCachedPublicPlan(updatedPlan);
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      syncPlanToSupabase(updatedPlan);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setNewTargetGoal = useCallback((planId: string, newTarget: number) => {
    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];
      const validTarget = Math.max(1, newTarget);

      updatedPlan = {
        ...target,
        targetValue: validTarget,
        currentProgress: 0,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;
      return { ...prev, improvementPlans: updatedPlans };
    });

    if (updatedPlan) {
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      syncPlanToSupabase(updatedPlan);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markHabitJourneyDone = useCallback((planId: string) => {
    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      // GUARD: Block if already completed today in local calendar date
      if (isTodayLocal(target.lastCompletedDate)) {
        return prev;
      }

      const nowIso = trustedNow().toISOString();
      const activeStreak = calculateActivePlanStreak(
        target.streakCount || 0,
        target.lastCompletedDate,
        target.cadence || 'daily'
      );
      const newStreak = activeStreak + 1;

      updatedPlan = {
        ...target,
        streakCount: newStreak,
        lastCompletedDate: nowIso,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;

      return { ...prev, improvementPlans: updatedPlans };
    });

    if (updatedPlan) {
      updateCachedPublicPlan(updatedPlan);
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      syncPlanToSupabase(updatedPlan);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undoHabitJourneyDone = useCallback((planId: string) => {
    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      // Only allow undo if lastCompletedDate is today's local date
      if (!isTodayLocal(target.lastCompletedDate)) {
        return prev;
      }

      const currentStreak = target.streakCount || 0;
      const newStreak = Math.max(0, currentStreak - 1);

      updatedPlan = {
        ...target,
        streakCount: newStreak,
        lastCompletedDate: undefined,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;

      return { ...prev, improvementPlans: updatedPlans };
    });

    if (updatedPlan) {
      updateCachedPublicPlan(updatedPlan);
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      syncPlanToSupabase(updatedPlan);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setNewFollowedTargetGoal = useCallback((followId: string, newTarget: number) => {
    let updatedFollow: UserPlanFollow | null = null;
    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];
      const validTarget = Math.max(1, newTarget);

      updatedFollow = {
        ...target,
        targetValue: validTarget,
        currentProgress: 0,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;
      return { ...prev, followedPlans: updatedFollows };
    });

    if (updatedFollow) {
      syncFollowedPlanToSupabase(updatedFollow);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markFollowedHabitJourneyDone = useCallback((followId: string) => {
    let updatedFollow: UserPlanFollow | null = null;
    setState((prev) => {
      const idx = prev.followedPlans.findIndex((p) => p.id === followId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];

      if (isTodayLocal(target.lastCompletedDate)) {
        return prev;
      }

      const nowIso = trustedNow().toISOString();
      const activeStreak = calculateActivePlanStreak(
        target.streakCount || 0,
        target.lastCompletedDate,
        target.cadence || 'daily'
      );
      const newStreak = activeStreak + 1;

      updatedFollow = {
        ...target,
        streakCount: newStreak,
        lastCompletedDate: nowIso,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;

      return { ...prev, followedPlans: updatedFollows };
    });

    if (updatedFollow) {
      const follow = updatedFollow as UserPlanFollow;
      syncFollowedPlanToSupabase(follow);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undoFollowedHabitJourneyDone = useCallback((followId: string) => {
    let updatedFollow: UserPlanFollow | null = null;
    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];

      // Only allow undo if lastCompletedDate is today's local date
      if (!isTodayLocal(target.lastCompletedDate)) {
        return prev;
      }

      const currentStreak = target.streakCount || 0;
      const newStreak = Math.max(0, currentStreak - 1);

      updatedFollow = {
        ...target,
        streakCount: newStreak,
        lastCompletedDate: undefined,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;

      return { ...prev, followedPlans: updatedFollows };
    });

    if (updatedFollow) {
      syncFollowedPlanToSupabase(updatedFollow);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editVisionReflectionNote = useCallback((planId: string, noteId: string, newNoteText: string) => {
    if (!newNoteText.trim()) return;
    let updatedPlan: ImprovementPlan | null = null;

    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      const notes = target.reflectionNotes || [];
      const updatedNotes = notes.map((n) =>
        n.id === noteId || (n as any).date === noteId ? { ...n, note: newNoteText.trim() } : n
      );

      updatedPlan = {
        ...target,
        reflectionNotes: updatedNotes,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;
      return { ...prev, improvementPlans: updatedPlans };
    });

    if (updatedPlan) {
      updateCachedPublicPlan(updatedPlan);
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      syncPlanToSupabase(updatedPlan);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addVisionReflectionNote = useCallback((planId: string, note: string) => {
    if (!note.trim()) return;
    let updatedPlan: ImprovementPlan | null = null;
    let nextDue: string | null = null;

    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      const newNote: PlanReflectionNote = {
        id: generateUUID(),
        originalPlanId: planId,
        createdAt: trustedNow().toISOString(),
        note: note.trim(),
      };

      const effectiveCadence = target.reviewCadence || (target.planType === 'vision' ? 'weekly' : null);
      if (effectiveCadence === 'weekly') {
        nextDue = new Date(trustedNowMs() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (effectiveCadence === 'monthly') {
        nextDue = new Date(trustedNowMs() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        nextDue = target.nextReviewDueAt || null;
      }

      const existingNotes = target.reflectionNotes || [];
      updatedPlan = {
        ...target,
        nextReviewDueAt: nextDue,
        reflectionNotes: [newNote, ...existingNotes],
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;
      return { ...prev, improvementPlans: updatedPlans };
    });

    if (updatedPlan) {
      const p = updatedPlan as ImprovementPlan;
      updateCachedPublicPlan(p);
      syncBroadcaster.broadcast('PLAN_UPDATED', p);
      syncPlanToSupabase(p);
      addReflectionNoteToSupabase({
        originalPlanId: planId,
        note: note.trim(),
        nextReviewDueAt: nextDue,
        reviewCadence: p.reviewCadence,
      });
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteVisionReflectionNote = useCallback((planId: string, noteId: string) => {
    let updatedPlan: ImprovementPlan | null = null;

    setState(
      (prev) => {
        const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
        if (idx === -1) return prev;
        const target = prev.improvementPlans[idx];

        const notes = target.reflectionNotes || [];
        const updatedNotes = notes.filter((n) => n.id !== noteId && (n as any).date !== noteId);

        updatedPlan = {
          ...target,
          reflectionNotes: updatedNotes,
          syncStatus: 'pending',
        };

        const updatedPlans = [...prev.improvementPlans];
        updatedPlans[idx] = updatedPlan;
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), noteId].slice(-500);
        return { ...prev, improvementPlans: updatedPlans, deletedEntityIds: updatedDeletedEntityIds };
      },
      { immediate: true }
    );

    if (updatedPlan) {
      const planToSync = updatedPlan as ImprovementPlan;
      updateCachedPublicPlan(planToSync);
      syncBroadcaster.broadcast('PLAN_UPDATED', planToSync);
      handlePlanSyncExecution(planToSync);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateImprovementPlan = useCallback((
    planId: string,
    title: string,
    description: string,
    category: string,
    isPublic: boolean,
    stepTitles?: string[],
    typeParams?: {
      targetValue?: number;
      targetUnit?: string;
      targetDate?: string;
      cadence?: 'daily' | 'weekly';
      duration?: number;
      targetReviewDate?: string;
      reviewCadence?: 'weekly' | 'monthly' | null;
    }
  ) => {
    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      const steps: PlanStep[] = (stepTitles || [])
        .filter((t) => t.trim().length > 0)
        .map((t, i) => ({
          id: target.steps[i]?.id || uid(),
          title: t.trim(),
          orderIndex: i,
          completed: target.steps[i]?.completed || false,
        }));

      const isVision = target.planType === 'vision';
      const newReviewCadence = isVision
        ? (typeParams?.reviewCadence || target.reviewCadence || 'weekly')
        : (typeParams?.reviewCadence !== undefined ? typeParams.reviewCadence : target.reviewCadence);

      let newNextReviewDueAt = target.nextReviewDueAt;
      if (newReviewCadence !== target.reviewCadence || (newReviewCadence && !newNextReviewDueAt)) {
        if (newReviewCadence === 'weekly') {
          newNextReviewDueAt = new Date(trustedNowMs() + 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (newReviewCadence === 'monthly') {
          newNextReviewDueAt = new Date(trustedNowMs() + 30 * 24 * 60 * 60 * 1000).toISOString();
        } else {
          newNextReviewDueAt = null;
        }
      }

      updatedPlan = {
        ...target,
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || 'Personal Growth',
        isPublic,
        steps: steps.length > 0 ? steps : target.steps,
        creatorPoints: prev.totalPoints,
        // Structural field updates
        targetValue: typeParams?.targetValue !== undefined ? typeParams.targetValue : target.targetValue,
        targetUnit: typeParams?.targetUnit !== undefined ? typeParams.targetUnit : target.targetUnit,
        targetDate: typeParams?.targetDate !== undefined ? typeParams.targetDate : target.targetDate,
        cadence: typeParams?.cadence !== undefined ? typeParams.cadence : target.cadence,
        duration: typeParams?.duration !== undefined ? typeParams.duration : target.duration,
        targetReviewDate: typeParams?.targetReviewDate !== undefined ? typeParams.targetReviewDate : target.targetReviewDate,
        reviewCadence: newReviewCadence,
        nextReviewDueAt: newNextReviewDueAt,
        syncStatus: 'pending',
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;

      return { ...prev, improvementPlans: updatedPlans };
    });

    if (updatedPlan) {
      const planToSync = updatedPlan as ImprovementPlan;
      updateCachedPublicPlan(planToSync);
      syncBroadcaster.broadcast('PLAN_UPDATED', planToSync);
      handlePlanSyncExecution(planToSync);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlanVisibility = useCallback(async (planId: string, newVisibility?: boolean) => {
    try {
      console.log(`[Visibility Update] Initiating toggle for plan ID: ${planId}`);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('Log in and try again.');
      }

      let targetNewVisibility = newVisibility;
      if (targetNewVisibility === undefined) {
        const currentLocal = state.improvementPlans.find((p) => p.id === planId);
        targetNewVisibility = currentLocal ? !currentLocal.isPublic : true;
      }

      console.log(`[Visibility Update] Executing DB update for plan ${planId} to is_public = ${targetNewVisibility}`);

      // 1. Force the database update FIRST
      const { data, error } = await supabase
        .from('improvement_plans')
        .update({ is_public: targetNewVisibility })
        .eq('id', planId)
        .eq('creator_id', session.user.id)
        .select();

      if (error || !data || data.length === 0) {
        console.error("[Visibility Update] DB Error or 0 rows modified:", error, data);
        throw error ?? new Error('Try again in a moment.');
      }

      console.log(`[Visibility Update] DB Success! Updating local Zustand state...`);

      // 2. DB Success! Now update Zustand/UI state safely
      let updatedPlan: ImprovementPlan | null = null;
      setState((prev) => {
        const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
        if (idx === -1) return prev;
        updatedPlan = {
          ...prev.improvementPlans[idx],
          isPublic: targetNewVisibility,
          creatorPoints: prev.totalPoints,
        };
        const updatedPlans = [...prev.improvementPlans];
        updatedPlans[idx] = updatedPlan;
        return { ...prev, improvementPlans: updatedPlans };
      });

      if (updatedPlan) {
        updateCachedPublicPlan(updatedPlan);
        syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      }
    } catch (err: any) {
      console.error("[Visibility Update] Fatal error toggling visibility:", err);
      // The caller shows the error toast.
      throw err;
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.improvementPlans]);

  const updatePlanCopyCount = useCallback((planId: string, newCount: number) => {
    setState((prev) => {
      let planFound = false;
      const updatedPlans = prev.improvementPlans.map((p) => {
        if (p.id === planId) {
          planFound = true;
          return { ...p, copyCount: newCount };
        }
        return p;
      });

      const cached = getCachedPublicPlanById(planId);
      if (cached) {
        updateCachedPublicPlan({ ...cached, copyCount: newCount });
      }

      syncBroadcaster.broadcast('PLAN_UPDATED', { id: planId, copyCount: newCount });

      if (!planFound && !cached) return prev;
      return { ...prev, improvementPlans: updatedPlans };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyPublicPlan = useCallback(async (originalPlan: ImprovementPlan) => {
    const planId = originalPlan.id;
    try {
      console.log(`[Copy Plan] Initiating copy for plan ID: ${planId}`);

      // 1. Verify Session First
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        dispatchToastError("Couldn't copy plan", 'Log in and try again.');
        return;
      }

      const isOwnPlan = (originalPlan.creatorUsername || '').toLowerCase() === (state.username || '').toLowerCase() || (originalPlan.creatorId && state.currentUser?.id && originalPlan.creatorId === state.currentUser.id);
      const alreadyCopied = state.followedPlans.some((f) => f.originalPlanId === planId);

      if (isOwnPlan || alreadyCopied) {
        return;
      }

      // 2. Optimistic count; the server derives the real copy_count from user_plan_follows.
      updatePlanCopyCount(planId, (originalPlan.copyCount || 0) + 1);

      // 3. Create the follow record
      console.log(`[Copy Plan] Inserting into user_plan_follows...`);
      const stepsCopy: PlanStep[] = (originalPlan.steps || []).map((s) => ({
        ...s,
        id: uid(),
        completed: false,
      }));

      const createdFollow: UserPlanFollow = {
        id: generateUUID(),
        userId: session.user.id,
        originalPlanId: planId,
        title: originalPlan.title,
        description: originalPlan.description,
        steps: stepsCopy,
        isCompleted: false,
        pointsAwarded: 0,
        createdAt: trustedNow().toISOString(),

        // Phase B Plan Type Additions (fresh starting values for follower)
        planType: originalPlan.planType || 'milestone',
        targetValue: originalPlan.targetValue,
        targetUnit: originalPlan.targetUnit,
        currentProgress: 0, // Reset progress for copier
        targetDate: originalPlan.targetDate,
        cadence: originalPlan.cadence,
        duration: originalPlan.duration,
        startDate: trustedNow().toISOString(),
        streakCount: 0, // Reset streak for copier
        lastCompletedDate: undefined,
        targetReviewDate: originalPlan.targetReviewDate,
        reflectionNotes: [], // Reset reflections to empty for copier

        // Review loop cadence
        reviewCadence: originalPlan.reviewCadence || (originalPlan.planType === 'vision' ? 'weekly' : null),
        nextReviewDueAt: originalPlan.nextReviewDueAt || (originalPlan.planType === 'vision' ? new Date(trustedNowMs() + 7 * 24 * 60 * 60 * 1000).toISOString() : null),
      };

      setState((prev) => {
        return {
          ...prev,
          followedPlans: [createdFollow, ...prev.followedPlans],
        };
      });

      syncFollowedPlanToSupabase(createdFollow);
    } catch (err: any) {
      console.error("[Copy Plan] FATAL ERROR CATCH:", err);
      dispatchToastError("Couldn't copy plan", toUserMessage(err, 'Try again in a moment.'));
      throw err;
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatePlanCopyCount, state.username, state.currentUser?.id, state.followedPlans]);

  // --- FOLLOWED & COPIED PLANS INTERACTIVE ACTIONS ---
  const completeFollowedPlanStep = useCallback((followId: string, stepId: string) => {
    let updatedFollow: UserPlanFollow | null = null;
    let nextState: AppState | null = null;

    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;

      const target = prev.followedPlans[idx];
      const stepIdx = (target.steps || []).findIndex((s) => s.id === stepId);
      if (stepIdx === -1) return prev;

      const newSteps = [...target.steps];
      const currentStep = newSteps[stepIdx];
      const toggledState = !currentStep.completed;
      newSteps[stepIdx] = { ...currentStep, completed: toggledState };

      updatedFollow = {
        ...target,
        steps: newSteps,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;

      nextState = { ...prev, followedPlans: updatedFollows };
      return nextState;
    });

    if (updatedFollow) {
      syncFollowedPlanToSupabase(updatedFollow);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFollowedTargetGoalProgress = useCallback((followId: string, newProgress: number) => {
    let updatedFollow: UserPlanFollow | null = null;

    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;

      const target = prev.followedPlans[idx];
      const validProg = Math.min(target.targetValue || 0, Math.max(0, newProgress));

      updatedFollow = {
        ...target,
        currentProgress: validProg,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;

      return { ...prev, followedPlans: updatedFollows };
    });

    if (updatedFollow) {
      syncFollowedPlanToSupabase(updatedFollow);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFollowedVisionReflectionNote = useCallback((followId: string, note: string) => {
    if (!note.trim()) return;
    let updatedFollow: UserPlanFollow | null = null;
    let nextDue: string | null = null;

    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;

      const target = prev.followedPlans[idx];
      const newNote: PlanReflectionNote = {
        id: uid(),
        followedPlanId: followId,
        createdAt: trustedNow().toISOString(),
        note: note.trim(),
      };

      const effectiveCadence = target.reviewCadence || (target.planType === 'vision' ? 'weekly' : null);
      if (effectiveCadence === 'weekly') {
        nextDue = new Date(trustedNowMs() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (effectiveCadence === 'monthly') {
        nextDue = new Date(trustedNowMs() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        nextDue = target.nextReviewDueAt || null;
      }

      const existingNotes = target.reflectionNotes || [];
      updatedFollow = {
        ...target,
        nextReviewDueAt: nextDue,
        reflectionNotes: [newNote, ...existingNotes],
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;
      return { ...prev, followedPlans: updatedFollows };
    });

    if (updatedFollow) {
      const f = updatedFollow as UserPlanFollow;
      syncFollowedPlanToSupabase(f);
      addReflectionNoteToSupabase({
        followedPlanId: followId,
        note: note.trim(),
        nextReviewDueAt: nextDue,
        reviewCadence: f.reviewCadence,
      });
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editFollowedVisionReflectionNote = useCallback((followId: string, noteId: string, newNoteText: string) => {
    if (!newNoteText.trim()) return;
    let updatedFollow: UserPlanFollow | null = null;

    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];

      const notes = target.reflectionNotes || [];
      const updatedNotes = notes.map((n) =>
        n.id === noteId || (n as any).date === noteId ? { ...n, note: newNoteText.trim() } : n
      );

      updatedFollow = {
        ...target,
        reflectionNotes: updatedNotes,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;
      return { ...prev, followedPlans: updatedFollows };
    });

    if (updatedFollow) {
      syncFollowedPlanToSupabase(updatedFollow);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteFollowedVisionReflectionNote = useCallback((followId: string, noteId: string) => {
    let updatedFollow: UserPlanFollow | null = null;

    setState(
      (prev) => {
        const idx = prev.followedPlans.findIndex((f) => f.id === followId);
        if (idx === -1) return prev;
        const target = prev.followedPlans[idx];

        const notes = target.reflectionNotes || [];
        const updatedNotes = notes.filter((n) => n.id !== noteId && (n as any).date !== noteId);

        updatedFollow = {
          ...target,
          reflectionNotes: updatedNotes,
        };

        const updatedFollows = [...prev.followedPlans];
        updatedFollows[idx] = updatedFollow;
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), noteId].slice(-500);
        return { ...prev, followedPlans: updatedFollows, deletedEntityIds: updatedDeletedEntityIds };
      },
      { immediate: true }
    );

    if (updatedFollow) {
      syncFollowedPlanToSupabase(updatedFollow);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteFollowedPlan = useCallback((followedPlanId: string) => {
    deleteFollowedPlanFromSupabase(followedPlanId);
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), followedPlanId].slice(-500);
        return {
          ...prev,
          followedPlans: prev.followedPlans.filter((f) => f.id !== followedPlanId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completePlanStep = useCallback((planId: string, stepId: string) => {
    let updatedPlan: ImprovementPlan | null = null;
    let nextState: AppState | null = null;

    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      const stepIdx = (target.steps || []).findIndex((s) => s.id === stepId);
      if (stepIdx === -1) return prev;
      const targetStep = target.steps[stepIdx];

      const isNowCompleted = !targetStep.completed;
      const updatedSteps = [...target.steps];
      updatedSteps[stepIdx] = { ...targetStep, completed: isNowCompleted };

      updatedPlan = {
        ...target,
        steps: updatedSteps,
        syncStatus: 'pending',
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;

      nextState = {
        ...prev,
        improvementPlans: updatedPlans,
      };

      return nextState;
    });

    if (updatedPlan) {
      const planToSync = updatedPlan as ImprovementPlan;
      updateCachedPublicPlan(planToSync);
      syncBroadcaster.broadcast('PLAN_UPDATED', planToSync);
      handlePlanSyncExecution(planToSync);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deletePlan = useCallback(async (planId: string) => {
    try {
      console.log(`[Delete Plan] Initiating DB deletion for plan ID: ${planId}`);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('Log in and try again.');
      }

      // 1. Force the database delete FIRST
      const { data, error } = await supabase
        .from('improvement_plans')
        .delete()
        .eq('id', planId)
        .eq('creator_id', session.user.id)
        .select();

      if (error || !data || data.length === 0) {
        console.error("[Delete Plan] DB Error or 0 rows deleted:", error, data);
        throw error ?? new Error('Try again in a moment.');
      }

      console.log(`[Delete Plan] DB Success! Removing from local Zustand state...`);

      // 2. DB Success! Now remove from Zustand/UI state & save clean user_data
      removeCachedPublicPlan(planId);
      syncBroadcaster.broadcast('PLAN_DELETED', { planId });

      setState(
        (prev) => {
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), planId].slice(-500);
          return {
            ...prev,
            improvementPlans: prev.improvementPlans.filter((p) => p.id !== planId),
            followedPlans: prev.followedPlans.filter((f) => f.originalPlanId !== planId),
            deletedEntityIds: updatedDeletedEntityIds,
          };
        },
        { immediate: true }
      );
    } catch (err: any) {
      console.error("[Delete Plan] Fatal error deleting plan:", err);
      // The caller shows the error toast and keeps the confirm dialog open.
      throw err;
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- SOCIAL FEATURE 2: ACCOUNTABILITY PARTNER & SHARED CHALLENGES ---
  const sendPartnerInvite = useCallback(
    async (targetUidInput: string) => {
      const trimmedUid = targetUidInput.trim();
      if (!trimmedUid) {
        throw new Error("Enter your partner's ID.");
      }

      if (state.currentUser?.uid && trimmedUid === state.currentUser.uid) {
        throw new Error("You can't send an accountability invite to yourself.");
      }

      if ((state.partnerships || []).length >= 5) {
        throw new Error("You've reached the maximum limit of 5 accountability partners. Remove one to add another.");
      }

      const profileData = await fetchProfileByUidFromSupabase(trimmedUid);

      if (!profileData) {
        throw new Error(`No one has the ID '${trimmedUid}'. Check the 6-digit ID and try again.`);
      }

      // Check if target user accepts partnership invites
      const acceptsInvites = profileData.accept_partner_invites ?? profileData.acceptPartnerInvites ?? true;
      if (!acceptsInvites) {
        throw new Error("This user isn't accepting partner invites right now");
      }

      const targetUserId = profileData.id;
      const targetUsername = profileData.username;
      const targetAvatar = profileData.avatar || '🧑';

      if (targetUserId === state.currentUser?.id) {
        throw new Error("You can't send an accountability invite to yourself.");
      }

      // 1. Check if target user is ALREADY an active partner with current user (server re-checks)
      const isAlreadyPartnerLocal = (state.partnerships || []).some(
        (p) =>
          p.user1Id === targetUserId ||
          p.user2Id === targetUserId ||
          p.user1Username?.toLowerCase() === targetUsername.toLowerCase() ||
          p.user2Username?.toLowerCase() === targetUsername.toLowerCase()
      );
      if (isAlreadyPartnerLocal) {
        throw new Error(`You are already accountability partners with '${targetUsername}'.`);
      }

      // 2. Check if an invite is already pending between these two users in EITHER direction (local + DB)
      const alreadyPendingLocal = (state.partnerInvites || []).some((i) => {
        if (i.status !== 'pending') return false;
        const matchesTarget =
          i.toUserId === targetUserId ||
          i.toUsername?.toLowerCase() === targetUsername.toLowerCase() ||
          i.fromUserId === targetUserId ||
          i.fromUsername?.toLowerCase() === targetUsername.toLowerCase();
        const matchesCurrent =
          i.toUserId === state.currentUser?.id ||
          i.toUsername?.toLowerCase() === state.username.toLowerCase() ||
          i.fromUserId === state.currentUser?.id ||
          i.fromUsername?.toLowerCase() === state.username.toLowerCase();
        return matchesTarget && matchesCurrent;
      });
      if (alreadyPendingLocal) {
        throw new Error(`An invite between you and '${targetUsername}' is already pending.`);
      }

      const existingDbInvites = await fetchPartnerInvitesSupabase(state.currentUser?.id || '', state.username);
      const alreadyPendingDb = existingDbInvites.some((i) => {
        if (i.status !== 'pending') return false;
        return (
          i.fromUserId === targetUserId ||
          i.fromUsername?.toLowerCase() === targetUsername.toLowerCase() ||
          i.toUserId === targetUserId ||
          i.toUsername?.toLowerCase() === targetUsername.toLowerCase()
        );
      });
      if (alreadyPendingDb) {
        throw new Error(`An invite between you and '${targetUsername}' is already pending.`);
      }

      // Resolve canonical sender UUID
      let fromUserId = state.currentUser?.id;
      const isSenderUuid = fromUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fromUserId);
      if (!isSenderUuid && isSupabaseConfigured) {
        const { data: selfProf } = await supabase.from('profiles').select('id').ilike('username', state.username).maybeSingle();
        if (selfProf?.id) {
          fromUserId = selfProf.id;
        }
      }
      if (!fromUserId) {
        fromUserId = crypto.randomUUID();
      }

      const invite: PartnerInvite = {
        id: crypto.randomUUID(),
        fromUserId,
        fromUsername: state.username,
        fromAvatar: state.currentUser?.avatar || '🧑',
        toUserId: targetUserId,
        toUsername: targetUsername,
        status: 'pending',
        createdAt: trustedNow().toISOString(),
      };

      const notifData = {
        recipientId: targetUserId,
        actorId: state.currentUser?.id,
        actorUsername: state.username,
        actorAvatar: state.currentUser?.avatar || '🧑',
        type: 'partner_invite' as const,
        title: 'New Partner Invite',
        message: `${state.username} sent you an accountability partner invite!`,
        payload: { inviteId: invite.id, dedupKey: `partner_invite_${invite.id}` },
      };

      syncBroadcaster.broadcast('PARTNER_INVITE_SENT', { invite, notification: notifData });

      setState(
        (prev) => ({
          ...prev,
          partnerInvites: [invite, ...prev.partnerInvites.filter((i) => i.id !== invite.id)],
        }),
        { immediate: true }
      );

      try {
        await sendPartnerInviteSupabase(invite);
        return invite;
      } catch (err: any) {
        console.error('Failed to send partner invite to Supabase:', err);
        setState((prev) => ({
          ...prev,
          partnerInvites: prev.partnerInvites.filter((i) => i.id !== invite.id),
        }));
        throw err;
      }
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.username, state.partnerships, state.partnerInvites, state.currentUser]
  );

  const acceptPartnerInvite = useCallback(
    async (inviteId: string) => {
      if ((state.partnerships || []).length >= 5) {
        throw new Error("You've reached the maximum limit of 5 accountability partners. Remove one to accept another.");
      }
      const invite = state.partnerInvites.find((i) => i.id === inviteId);
      let fromId = invite?.fromUserId;
      const fromUsername = invite?.fromUsername || 'Partner';
      let toId = state.currentUser?.id;
      const toUsername = state.username;

      // Ensure both user IDs are canonical profile UUIDs from Supabase
      const isFromUuid = fromId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fromId);
      if (!isFromUuid && isSupabaseConfigured && fromUsername) {
        const { data: p1 } = await supabase.from('profiles').select('id').ilike('username', fromUsername).maybeSingle();
        if (p1?.id) fromId = p1.id;
      }
      const isToUuid = toId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(toId);
      if (!isToUuid && isSupabaseConfigured && toUsername) {
        const { data: p2 } = await supabase.from('profiles').select('id').ilike('username', toUsername).maybeSingle();
        if (p2?.id) toId = p2.id;
      }

      if (!fromId) fromId = crypto.randomUUID();
      if (!toId) toId = crypto.randomUUID();

      const result = await acceptPartnerInviteAtomicSupabase(inviteId, fromId, fromUsername, toId, toUsername);

      if (!result.success) {
        setState((prev) => ({
          ...prev,
          partnerInvites: prev.partnerInvites.filter((i) => i.id !== inviteId),
        }));
        throw new Error(result.error || 'This invite is no longer available');
      }

      const partnershipId = result.partnershipId || crypto.randomUUID();
      const partnership: Partnership = {
        id: partnershipId,
        user1Id: fromId,
        user1Username: fromUsername,
        user2Id: toId,
        user2Username: toUsername,
        pairedAt: trustedNow().toISOString(),
      };

      syncBroadcaster.broadcast('PARTNER_ACCEPTED', partnership);

      // The sender's "accepted" notice is sent by accept_partner_invite_atomic.

      // Clear/mark-read the recipient's incoming partner_invite notification so it doesn't linger unread
      const staleNotif = (state.notifications || []).find(
        (n) => n.type === 'partner_invite' && (n.payload?.inviteId === inviteId || n.actorId === fromId)
      );
      if (staleNotif) {
        markNotificationReadSupabase(staleNotif.id);
      }

      setState(
        (prev) => {
          const removedInviteIds: string[] = [];
          const updatedInvites = (prev.partnerInvites || []).filter((i) => {
            const isFromUser1 = i.fromUserId === fromId || i.fromUsername?.toLowerCase() === fromUsername.toLowerCase();
            const isToUser1 = i.toUserId === fromId || i.toUsername?.toLowerCase() === fromUsername.toLowerCase();
            const isFromUser2 = i.fromUserId === toId || i.fromUsername?.toLowerCase() === toUsername.toLowerCase();
            const isToUser2 = i.toUserId === toId || i.toUsername?.toLowerCase() === toUsername.toLowerCase();

            const isBetweenPair = (isFromUser1 && isToUser2) || (isFromUser2 && isToUser1);
            if (isBetweenPair) {
              removedInviteIds.push(i.id);
              return false;
            }
            return true;
          });
          if (inviteId && !removedInviteIds.includes(inviteId)) {
            removedInviteIds.push(inviteId);
          }
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), ...removedInviteIds].slice(-500);
          const updatedPartnerships = [
            partnership,
            ...(prev.partnerships || []).filter((p) => {
              if (p.id === partnership.id) return false;
              const u1 = (p.user1Username || '').toLowerCase();
              const u2 = (p.user2Username || '').toLowerCase();
              const fromLower = fromUsername.toLowerCase();
              const toLower = toUsername.toLowerCase();
              const isBetweenPair =
                ((u1 === fromLower || p.user1Id === fromId) && (u2 === toLower || p.user2Id === toId)) ||
                ((u1 === toLower || p.user1Id === toId) && (u2 === fromLower || p.user2Id === fromId));
              return !isBetweenPair;
            }),
          ];
          return {
            ...prev,
            partnerInvites: updatedInvites,
            partnerships: updatedPartnerships,
            partnership: updatedPartnerships[0] || null,
            deletedEntityIds: updatedDeletedEntityIds,
            notifications: (prev.notifications || []).map((n) =>
              n.type === 'partner_invite' && (n.payload?.inviteId === inviteId || n.actorId === fromId)
                ? { ...n, read: true }
                : n
            ),
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.partnerInvites, state.partnerships, state.notifications, state.currentUser, state.username]
  );

  const cancelPartnerInvite = useCallback(async (inviteId: string) => {
    await deletePartnerInviteSupabase(inviteId);
    syncBroadcaster.broadcast('PARTNER_INVITE_CANCELLED', { inviteId });
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), inviteId].slice(-500);
        return {
          ...prev,
          partnerInvites: prev.partnerInvites.filter((i) => i.id !== inviteId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const declinePartnerInvite = useCallback(async (inviteId: string) => {
    const invite = state.partnerInvites.find((i) => i.id === inviteId);

    const staleNotif = (state.notifications || []).find(
      (n) => n.type === 'partner_invite' && (n.payload?.inviteId === inviteId || (invite && n.actorId === invite.fromUserId))
    );
    if (staleNotif) {
      markNotificationReadSupabase(staleNotif.id);
    }

    // The server sends the sender's "declined" notice in the same step.
    await declinePartnerInviteSupabase(inviteId);
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), inviteId].slice(-500);
        return {
          ...prev,
          partnerInvites: prev.partnerInvites.filter((i) => i.id !== inviteId),
          deletedEntityIds: updatedDeletedEntityIds,
          notifications: (prev.notifications || []).map((n) =>
            n.type === 'partner_invite' && (n.payload?.inviteId === inviteId || (invite && n.actorId === invite.fromUserId))
              ? { ...n, read: true }
              : n
          ),
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.partnerInvites, state.notifications, state.username, state.currentUser]);

  const endPartnership = useCallback(async (partnershipId?: string) => {
    const targetId = partnershipId || state.partnership?.id || state.partnerships[0]?.id;
    if (!targetId) return;

    // Snapshot partnership and associated challenges for rollback
    const partnershipToEnd = (state.partnerships || []).find((p) => p.id === targetId) || state.partnership;
    const challengesToEnd = (state.sharedChallenges || []).filter((c) => c.partnershipId === targetId);

    // Optimistic UI update
    setState(
      (prev) => {
        const updatedPartnerships = (prev.partnerships || []).filter((p) => p.id !== targetId);
        const removedChallengeIds = prev.sharedChallenges
          .filter((c) => c.partnershipId === targetId)
          .map((c) => c.id);
        const updatedDeletedEntityIds = [
          ...(prev.deletedEntityIds || []),
          targetId,
          ...removedChallengeIds,
        ].slice(-500);

        return {
          ...prev,
          partnerships: updatedPartnerships,
          partnership: updatedPartnerships[0] || null,
          sharedChallenges: prev.sharedChallenges.filter((c) => c.partnershipId !== targetId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );

    try {
      await deletePartnershipSupabase(targetId);
      syncBroadcaster.broadcast('PARTNER_ENDED', { partnershipId: targetId });
    } catch (err: any) {
      console.error('Failed to end partnership in database:', err);
      // Rollback optimistic state immediately
      setState((prev) => {
        const currentIds = new Set((prev.partnerships || []).map((p) => p.id));
        const restoredPartnerships = partnershipToEnd && !currentIds.has(targetId)
          ? [partnershipToEnd, ...(prev.partnerships || [])]
          : prev.partnerships || [];

        const challengeIds = new Set((prev.sharedChallenges || []).map((c) => c.id));
        const restoredChallenges = [
          ...(prev.sharedChallenges || []),
          ...challengesToEnd.filter((c) => !challengeIds.has(c.id)),
        ];

        const rollbackDeletedIds = (prev.deletedEntityIds || []).filter(
          (id) => id !== targetId && !challengesToEnd.some((c) => c.id === id)
        );

        return {
          ...prev,
          partnerships: restoredPartnerships,
          partnership: restoredPartnerships[0] || null,
          sharedChallenges: restoredChallenges,
          deletedEntityIds: rollbackDeletedIds,
        };
      });
      throw err;
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.partnership, state.partnerships, state.sharedChallenges]);

  const getPartnerProfileStats = useCallback(async (partnerUsername: string) => {
    if (!partnerUsername) return null;
    const profile = await fetchProfileByUsernameFromSupabase(partnerUsername);
    if (!profile) return null;
    const rawStats = profile.stats || {};
    const habitsCompletedCount = rawStats.habitsCompletedCount || 0;
    const habitsCompletedTodayCount = rawStats.habitsCompletedTodayCount || 0;
    const streakDays = rawStats.streakDays || 0;
    const currentStreakDays = rawStats.currentStreakDays ?? rawStats.streakDays ?? 0;
    const currentStreakCategory = rawStats.currentStreakCategory ?? rawStats.streakSource ?? '';
    const currentStreakIsActive = rawStats.currentStreakIsActive !== undefined
      ? rawStats.currentStreakIsActive
      : true;
    const bestStreakDays = rawStats.bestStreakDays ?? rawStats.streakDays ?? 0;
    const bestStreakCategory = rawStats.bestStreakCategory ?? rawStats.streakSource ?? '';

    // The server derives season_points for the running season (refreshed at every season start).
    const computedSeasonPts = typeof profile.season_points === 'number' ? profile.season_points : 0;
    const activeSeasonNumber = getSeasonNumber(leagueNow());

    return {
      totalPoints: profile.total_points || 0,
      seasonPoints: computedSeasonPts,
      seasonId: activeSeasonNumber,
      season_id: activeSeasonNumber,
      season_points: computedSeasonPts,
      stats: {
        ...rawStats,
        streakDays,
        streakSource: rawStats.streakSource,
        currentStreakDays,
        currentStreakCategory,
        currentStreakIsActive,
        bestStreakDays,
        bestStreakCategory,
        habitsCompletedCount,
        habitsCompletedTodayCount,
      },
      avatar: profile.avatar || '🧑',
      isProfilePublic: profile.is_profile_public ?? true,
    };
  }, []);

  const createSharedChallenge = useCallback(
    async (
      title: string,
      durationDays: number,
      user1Category: SharedChallengeCategory = 'habit',
      user1Target: string = '',
      user2Category: SharedChallengeCategory = 'habit',
      user2Target: string = '',
      targetPartnershipId?: string
    ) => {
      const pId = targetPartnershipId || state.partnership?.id || state.partnerships[0]?.id;
      if (!pId) {
        throw new Error('No active partnership found.');
      }

      const trimmedTitle = title.trim();
      const normTitle = trimmedTitle.toLowerCase();

      if (!trimmedTitle) {
        throw new Error('Please enter a pact title.');
      }

      // Prevent duplicate creation if an active challenge with the same title already exists on this partnership
      const existingActive = (state.sharedChallenges || []).find(
        (c) =>
          c &&
          c.partnershipId === pId &&
          c.status === 'active' &&
          (c.title || '').trim().toLowerCase() === normTitle
      );
      if (existingActive) {
        throw new Error(
          `You already have an active pact called "${existingActive.title}" with this partner — choose a different name or view your existing pact.`
        );
      }

      const challenge: SharedChallenge = {
        id: crypto.randomUUID(),
        partnershipId: pId,
        title: trimmedTitle,
        targetHabitName: user1Target || trimmedTitle,
        durationDays,
        jointStreak: 0,
        totalJointDaysCompleted: 0,
        lastJointCompletionDate: undefined,
        user1Category,
        user1Target: user1Target.trim(),
        user2Category,
        user2Target: user2Target.trim(),
        status: 'active',
        createdAt: getNow().toISOString(),
      };

      // Optimistically update local UI state
      setState((prev) => ({
        ...prev,
        sharedChallenges: [challenge, ...prev.sharedChallenges],
      }));

      try {
        await saveSharedChallengeSupabase(challenge);
        syncBroadcaster.broadcast('CHALLENGE_UPDATED', challenge);
      } catch (err: any) {
        console.error('Failed to create joint pact in Supabase:', err);
        // Rollback only this specific challenge object by ID
        setState((prev) => ({
          ...prev,
          sharedChallenges: (prev.sharedChallenges || []).filter((c) => c.id !== challenge.id),
        }));
        throw err;
      }
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.partnership, state.partnerships, state.sharedChallenges]
  );

  const deleteSharedChallenge = useCallback(async (challengeId: string) => {
    const challengeToDelete = (state.sharedChallenges || []).find((c) => c.id === challengeId);

    // Optimistically update local UI state
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), challengeId].slice(-500);
        return {
          ...prev,
          sharedChallenges: prev.sharedChallenges.filter((c) => c.id !== challengeId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );

    try {
      await deleteSharedChallengeSupabase(challengeId);
      syncBroadcaster.broadcast('CHALLENGE_DELETED', { challengeId });
    } catch (err: any) {
      console.error('Failed to delete shared challenge in Supabase:', err);
      // Rollback only this specific challenge back into the list if partnership still exists
      if (challengeToDelete) {
        setState((prev) => {
          const partnershipExists = (prev.partnerships || []).some(
            (p) => p.id === challengeToDelete.partnershipId
          ) || prev.partnership?.id === challengeToDelete.partnershipId;

          if (!partnershipExists) {
            return prev;
          }

          return {
            ...prev,
            sharedChallenges: prev.sharedChallenges.some((c) => c.id === challengeId)
              ? prev.sharedChallenges
              : [challengeToDelete, ...prev.sharedChallenges],
            deletedEntityIds: (prev.deletedEntityIds || []).filter((id) => id !== challengeId),
          };
        });
      }
      throw err;
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sharedChallenges]);

  const logSharedChallengeHabit = useCallback(
    async (challengeId: string, forcedState?: boolean) => {
      if (pendingPledgeRequests.has(challengeId)) {
        return;
      }
      pendingPledgeRequests.add(challengeId);

      const today = todayKey();

      const idx = state.sharedChallenges.findIndex((c) => c.id === challengeId);
      if (idx === -1) {
        pendingPledgeRequests.delete(challengeId);
        return;
      }
      const target = state.sharedChallenges[idx];
      const previousChallenge = target;

      const challengePartnership =
        (state.partnerships || []).find((p) => p.id === target.partnershipId) || state.partnership;

      const isUser1 = challengePartnership
        ? isPartnershipUser1(challengePartnership, state.currentUser?.id, state.username)
        : true;

      const myDoneDates = isUser1
        ? (target.user1DoneDates || (target.user1DoneDate ? [target.user1DoneDate] : []))
        : (target.user2DoneDates || (target.user2DoneDate ? [target.user2DoneDate] : []));

      let isDoneToday: boolean;
      if (typeof forcedState === 'boolean') {
        isDoneToday = forcedState;
      } else {
        isDoneToday = !myDoneDates.includes(today);
      }

      const { updated } = applyPledgeToggle(target, isUser1, isDoneToday);

      // Optimistically update local UI state targeting only this challenge
      setState((prev) => ({
        ...prev,
        sharedChallenges: prev.sharedChallenges.map((c) => (c.id === challengeId ? updated : c)),
      }));

      try {
        await saveSharedChallengeSupabase(updated);
        syncBroadcaster.broadcast('CHALLENGE_UPDATED', updated);
        // The partner's notices come from the server (shared_challenges trigger).
      } catch (err: any) {
        console.error('Failed to log shared challenge day in Supabase:', err);
        // Rollback only this specific challenge object by ID
        setState((prev) => ({
          ...prev,
          sharedChallenges: prev.sharedChallenges.map((c) => (c.id === challengeId ? previousChallenge : c)),
        }));
        throw err;
      } finally {
        pendingPledgeRequests.delete(challengeId);
      }
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.sharedChallenges, state.partnerships, state.partnership, state.currentUser, state.username]
  );

  const markNotificationRead = useCallback((notificationId: string) => {
    markNotificationReadSupabase(notificationId);
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) =>
        n.id === notificationId ? { ...n, read: true } : n
      ),
    }));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    if (state.currentUser?.id) {
      markAllNotificationsReadSupabase(state.currentUser.id);
    }
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) => ({ ...n, read: true })),
    }));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser?.id]);

  const clearNotification = useCallback((notificationId: string) => {
    const cleared = (get().notifications || []).find((n) => n.id === notificationId);
    setState((prev) => {
      const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), notificationId].slice(-500);
      return {
        ...prev,
        notifications: (prev.notifications || []).filter((n) => n.id !== notificationId),
        deletedEntityIds: updatedDeletedEntityIds,
      };
    });
    // The table row is the only record across devices, so a failed delete puts it back.
    clearNotificationSupabase(notificationId).catch((err) => {
      console.error('Failed to clear notification:', err);
      if (!cleared) return;
      setState((prev) => ({
        ...prev,
        notifications: (prev.notifications || []).some((n) => n.id === notificationId)
          ? prev.notifications
          : [cleared, ...(prev.notifications || [])],
        deletedEntityIds: (prev.deletedEntityIds || []).filter((id) => id !== notificationId),
      }));
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Multi-user Competitor League Helper
  const getLeagueData = useCallback(
    (type: LeagueType) => {
      const now = leagueNow();
      let userPoints: number;
      if (type === 'ninetyDay') {
        userPoints = getEffectiveSeasonPoints(state, now);
      } else {
        const start = getLeaguePeriodStart(type, now);
        userPoints = calculatePeriodPoints(state.pointsHistory, start, now, state.totalPoints);
      }

      const unified = calculateUnifiedStreak(state);

      const habitsCompletedCount = state.habits.reduce(
        (acc, h) =>
          acc +
          (Array.isArray(h.completions)
            ? h.completions.length
            : Object.values(h.completions || {}).filter((c) => c && c.done).length),
        0
      );
      const exerciseMinutes = state.workouts.reduce((sum, w) => sum + w.durationMinutes, 0);
      const booksRead = (state.libraryBooks || []).filter((b) => b.status === 'completed' || b.isFinished).length;
      const skillsPracticedCount = state.skillLogs.length;

      const userStats = {
        streakDays: unified.currentStreakDays,
        streakSource: unified.currentStreakDays > 0 ? unified.currentStreakCategory : undefined,
        currentStreakDays: unified.currentStreakDays,
        currentStreakCategory: unified.currentStreakCategory,
        currentStreakIsActive: unified.currentStreakIsActive,
        lastActiveDate: unified.lastActiveDate,
        habitsCompletedCount,
        journalEntriesCount: state.journalEntries.length,
        exerciseMinutes,
        booksRead,
        skillsPracticedCount,
        // Own trophy cabinet: the same closed-season scores other members read from the profile.
        season_history: toSeasonHistory(state.leagueArchives),
      };

      const competitors = generateCompetitors(
        type,
        userPoints,
        state.currentUser,
        state.username,
        state.totalPoints,
        userStats,
        undefined,
        now
      );
      const userRank = getUserRank(competitors);
      return { competitors, userRank, userPoints };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.pointsHistory,
      state.habits,
      state.workouts,
      state.libraryBooks,
      state.readingLogs,
      state.badHabits,
      state.badHabitLogs,
      state.skillLogs,
      state.journalEntries,
      state.currentUser,
      state.username,
      state.totalPoints,
      state.seasonId,
      state.leagueArchives,
      leagueDataVersion,
    ]
  );

  const getPublicImprovementPlans = useCallback(() => {
    const allPublic = getAllPublicImprovementPlans();
    const myPlans = state.improvementPlans.filter((p) => p.isPublic);

    const mergedMap = new Map<string, ImprovementPlan>();
    allPublic.forEach((p) => mergedMap.set(p.id, p));
    myPlans.forEach((p) => mergedMap.set(p.id, p));

    return Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [state.improvementPlans]);

  // ==========================================
  // TIME TRACKER MODULE ACTIONS
  // ==========================================
  const addTimeTrackerActivity = useCallback(
    (activity: Omit<TimeTrackerActivity, 'id'>): TimeTrackerActivity => {
      const newActivity: TimeTrackerActivity = {
        ...activity,
        id: uid(),
        isSystemDefault: false,
        createdAt: trustedNow().toISOString(),
      };
      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        return {
          ...prev,
          timeTracker: {
            ...currentTT,
            activities: [...(currentTT.activities || []), newActivity],
          },
        };
      });
      return newActivity;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateTimeTrackerActivity = useCallback(
    (id: string, updates: Partial<TimeTrackerActivity>) => {
      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        return {
          ...prev,
          timeTracker: {
            ...currentTT,
            activities: (currentTT.activities || []).map((a) =>
              a.id === id ? { ...a, ...updates, id: a.id } : a
            ),
          },
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const deleteTimeTrackerActivity = useCallback(
    (id: string) => {
      setState(
        (prev) => {
          const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const remainingActivities = (currentTT.activities || []).filter((a) => a.id !== id);
          const fallbackActivityId = remainingActivities[0]?.id || 'deep_work';

          // Cascade clean dailyLogs
          const updatedDailyLogs: Record<string, TimeTrackerBlock[]> = {};
          Object.entries(currentTT.dailyLogs || {}).forEach(([dateKey, blocks]) => {
            updatedDailyLogs[dateKey] = (blocks || []).map((b) => ({
              ...b,
              activityId: b.activityId === id ? fallbackActivityId : b.activityId,
              secondaryActivityIds: (b.secondaryActivityIds || []).filter((secId) => secId !== id),
            }));
          });

          // Cascade clean templates
          const updatedTemplates = (currentTT.templates || []).map((t) => ({
            ...t,
            blocks: (t.blocks || []).map((b) => ({
              ...b,
              activityId: b.activityId === id ? fallbackActivityId : b.activityId,
              secondaryActivityIds: (b.secondaryActivityIds || []).filter((secId) => secId !== id),
            })),
          }));

          const updatedDeleted = [...(prev.deletedEntityIds || []), id].slice(-500);
          return {
            ...prev,
            timeTracker: {
              ...currentTT,
              activities: remainingActivities,
              templates: updatedTemplates,
              dailyLogs: updatedDailyLogs,
            },
            deletedEntityIds: updatedDeleted,
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const createTimeTrackerTemplate = useCallback(
    (template: Omit<TimeTrackerTemplate, 'id'>): TimeTrackerTemplate => {
      const targetDays =
        Array.isArray(template.activeDays) && template.activeDays.length > 0
          ? template.activeDays
          : Array.isArray(template.autoApplyDays) && template.autoApplyDays.length > 0
          ? template.autoApplyDays
          : [];

      const newTemplate: TimeTrackerTemplate = {
        ...template,
        activeDays: targetDays,
        autoApplyDays: targetDays,
        id: uid(),
        createdAt: trustedNow().toISOString(),
      };

      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const otherTemplates = (currentTT.templates || []).map((t) => {
          if (targetDays.length > 0) {
            const currentDays =
              Array.isArray(t.activeDays) && t.activeDays.length > 0
                ? t.activeDays
                : Array.isArray(t.autoApplyDays) && t.autoApplyDays.length > 0
                ? t.autoApplyDays
                : [];
            const filteredDays = currentDays.filter(
              (d) => !targetDays.some((nd) => nd.toLowerCase() === d.toLowerCase())
            );
            return {
              ...t,
              activeDays: filteredDays,
              autoApplyDays: filteredDays,
            };
          }
          return t;
        });

        return {
          ...prev,
          timeTracker: {
            ...currentTT,
            templates: [...otherTemplates, newTemplate],
          },
        };
      });
      return newTemplate;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateTimeTrackerTemplate = useCallback(
    (id: string, updates: Partial<TimeTrackerTemplate>) => {
      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const updatedDays =
          Array.isArray(updates.activeDays) && updates.activeDays.length > 0
            ? updates.activeDays
            : Array.isArray(updates.autoApplyDays) && updates.autoApplyDays.length > 0
            ? updates.autoApplyDays
            : updates.activeDays !== undefined
            ? updates.activeDays
            : updates.autoApplyDays;

        const updatedTemplates = (currentTT.templates || []).map((t) => {
          if (t.id === id) {
            const nextDays =
              updatedDays !== undefined
                ? updatedDays
                : Array.isArray(t.activeDays) && t.activeDays.length > 0
                ? t.activeDays
                : Array.isArray(t.autoApplyDays) && t.autoApplyDays.length > 0
                ? t.autoApplyDays
                : [];
            return {
              ...t,
              ...updates,
              activeDays: nextDays,
              autoApplyDays: nextDays,
              id: t.id,
            };
          } else if (updatedDays && updatedDays.length > 0) {
            // STRICT EXCLUSIVITY: Filter out any day that is now active in target template
            const currentDays =
              Array.isArray(t.activeDays) && t.activeDays.length > 0
                ? t.activeDays
                : Array.isArray(t.autoApplyDays) && t.autoApplyDays.length > 0
                ? t.autoApplyDays
                : [];
            const filteredDays = currentDays.filter(
              (d) => !updatedDays.some((nd) => nd.toLowerCase() === d.toLowerCase())
            );
            return {
              ...t,
              activeDays: filteredDays,
              autoApplyDays: filteredDays,
            };
          }
          return t;
        });

        return {
          ...prev,
          timeTracker: {
            ...currentTT,
            templates: updatedTemplates,
          },
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const toggleTemplateAutoApplyDay = useCallback(
    (templateId: string, day: string) => {
      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const targetTemplate = (currentTT.templates || []).find((t) => t.id === templateId);
        if (!targetTemplate) return prev;

        const getDays = (t: TimeTrackerTemplate): string[] => {
          if (Array.isArray(t.activeDays) && t.activeDays.length > 0) return t.activeDays;
          if (Array.isArray(t.autoApplyDays) && t.autoApplyDays.length > 0) return t.autoApplyDays;
          return [];
        };

        const targetDays = getDays(targetTemplate);
        const isRemoving = targetDays.some((d) => d.toLowerCase() === day.toLowerCase());

        const updatedTemplates = (currentTT.templates || []).map((t) => {
          if (t.id === templateId) {
            const currentDays = getDays(t);
            const nextDays = isRemoving
              ? currentDays.filter((d) => d.toLowerCase() !== day.toLowerCase())
              : [...currentDays.filter((d) => d.toLowerCase() !== day.toLowerCase()), day];
            return {
              ...t,
              activeDays: nextDays,
              autoApplyDays: nextDays,
            };
          } else {
            // STRICT EXCLUSIVITY: If adding the day to target template, REMOVE it from all other templates
            if (!isRemoving) {
              const otherDays = getDays(t);
              const nextDays = otherDays.filter((d) => d.toLowerCase() !== day.toLowerCase());
              return {
                ...t,
                activeDays: nextDays,
                autoApplyDays: nextDays,
              };
            }
            return t;
          }
        });

        return {
          ...prev,
          timeTracker: {
            ...currentTT,
            templates: updatedTemplates,
          },
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const deleteTimeTrackerTemplate = useCallback(
    (id: string) => {
      setState(
        (prev) => {
          const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const updatedDeleted = [...(prev.deletedEntityIds || []), id].slice(-500);
          const updatedRestored = (prev.restoredEntityIds || []).filter((rId) => rId !== id);
          return {
            ...prev,
            timeTracker: {
              ...currentTT,
              templates: (currentTT.templates || []).filter((t) => t.id !== id),
            },
            deletedEntityIds: updatedDeleted,
            restoredEntityIds: updatedRestored,
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const restoreTimeTrackerTemplate = useCallback(
    (id: string) => {
      setState(
        (prev) => {
          const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const updatedDeleted = (prev.deletedEntityIds || []).filter((dId) => dId !== id);
          const updatedRestored = [...(prev.restoredEntityIds || []), id].slice(-500);
          const exists = (currentTT.templates || []).some((t) => t.id === id);
          let newTemplates = currentTT.templates || [];
          if (!exists) {
            const defaultTpl = DEFAULT_TIME_TRACKER_STATE.templates.find((t) => t.id === id);
            if (defaultTpl) {
              newTemplates = [...newTemplates, defaultTpl];
            }
          }
          return {
            ...prev,
            timeTracker: {
              ...currentTT,
              templates: newTemplates,
            },
            deletedEntityIds: updatedDeleted,
            restoredEntityIds: updatedRestored,
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Shows today's Time Tracker routine points at once (computeTimeTrackerAward). The entry is never
  // uploaded; the server's own row replaces it on the next pull. Past days keep their points.
  const recomputeTimeTrackerDailyPointsForState = (
    baseState: AppState,
    targetDateKey: string,
    newBlocks: TimeTrackerBlock[]
  ): Partial<AppState> => {
    if (targetDateKey !== todayKey()) {
      return {};
    }

    const entryId = timeTrackerAwardId(targetDateKey);
    const entry = computeTimeTrackerAward(newBlocks, targetDateKey, trustedNow().getTime());
    const current = (baseState.pointsHistory || []).find((e) => e && e.id === entryId);
    if (!entry && !current) return {};
    if (
      entry &&
      current &&
      current.amount === entry.amount &&
      JSON.stringify(current.metadata ?? null) === JSON.stringify(entry.metadata)
    ) {
      return {};
    }

    const { excisedEntryIds: _excised, ...excised } = excisePointsEntriesInternal(baseState, (e) => e?.id === entryId);
    return entry
      ? addPointsInternal({ ...baseState, ...excised }, entry.amount, entry.reason, entry.source, entry.metadata, entry.timestamp, entry.id)
      : excised;
  };

  const addDailyTimeBlock = useCallback(
    (dateKey: string, block: Omit<TimeTrackerBlock, 'id'>) => {
      if (dateKey < todayKey()) {
        throw new Error('Past days are read-only.');
      }
      const currentTT = state.timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const existingDateBlocks = currentTT.dailyLogs?.[dateKey] || [];

      // 1. Midnight boundary split check
      const splitBlocks = normalizeOrSplitMidnightBlock(block);

      if (splitBlocks.length === 1) {
        // Single block on dateKey
        const collision = checkTimeCollision(splitBlocks[0], existingDateBlocks);
        if (collision.hasCollision) {
          throw new Error(collision.message || 'Time block collides with an existing scheduled block.');
        }

        const createdBlock: TimeTrackerBlock = {
          ...splitBlocks[0],
          id: uid(),
          createdAt: trustedNow().toISOString(),
          completed: false,
        };

        setState((prev) => {
          const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
          const nextBlocks = [...prevDailyBlocks, createdBlock].sort(
            (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
          );
          const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, nextBlocks);

          return {
            ...prev,
            timeTracker: {
              ...prevTT,
              dailyLogs: {
                ...(prevTT.dailyLogs || {}),
                [dateKey]: nextBlocks,
              },
            },
            ...pointsUpdate,
          };
        });

        return [createdBlock];
      }

      // Crossed midnight: Part 1 is on dateKey, Part 2 is on nextDayKey
      const nextDayKey = getNextDateKey(dateKey);
      const existingNextDayBlocks = currentTT.dailyLogs?.[nextDayKey] || [];

      const part1Collision = checkTimeCollision(splitBlocks[0], existingDateBlocks);
      if (part1Collision.hasCollision) {
        throw new Error(part1Collision.message || `Part 1 (Today) collides with an existing block on ${dateKey}.`);
      }

      const part2Collision = checkTimeCollision(splitBlocks[1], existingNextDayBlocks);
      if (part2Collision.hasCollision) {
        throw new Error(part2Collision.message || `Part 2 (Tomorrow) collides with an existing block on ${nextDayKey}.`);
      }

      const createdPart1: TimeTrackerBlock = {
        ...splitBlocks[0],
        id: uid(),
        createdAt: trustedNow().toISOString(),
        completed: false,
      };

      const createdPart2: TimeTrackerBlock = {
        ...splitBlocks[1],
        id: uid(),
        createdAt: trustedNow().toISOString(),
        completed: false,
      };

      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDateBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const prevNextDayBlocks = prevTT.dailyLogs?.[nextDayKey] || [];

        const nextDateBlocks = [...prevDateBlocks, createdPart1].sort(
          (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
        );
        const nextDaySortedBlocks = [...prevNextDayBlocks, createdPart2].sort(
          (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
        );

        const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, nextDateBlocks);

        return {
          ...prev,
          timeTracker: {
            ...prevTT,
            dailyLogs: {
              ...(prevTT.dailyLogs || {}),
              [dateKey]: nextDateBlocks,
              [nextDayKey]: nextDaySortedBlocks,
            },
          },
          ...pointsUpdate,
        };
      });

      return [createdPart1, createdPart2];
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.timeTracker]
  );

  const updateDailyTimeBlock = useCallback(
    (dateKey: string, blockId: string, updates: Partial<TimeTrackerBlock>) => {
      if (dateKey < todayKey()) {
        throw new Error('Past days are read-only.');
      }
      const currentTT = state.timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const existingBlocks = currentTT.dailyLogs?.[dateKey] || [];
      const targetBlock = existingBlocks.find((b) => b.id === blockId);
      if (!targetBlock) {
        throw new Error('Block not found.');
      }

      const merged = { ...targetBlock, ...updates };
      const splitBlocks = normalizeOrSplitMidnightBlock(merged);

      if (splitBlocks.length === 1) {
        const collision = checkTimeCollision(splitBlocks[0], existingBlocks, blockId);
        if (collision.hasCollision) {
          throw new Error(collision.message || 'Updated block collides with another scheduled block.');
        }

        const updatedSingleBlock: TimeTrackerBlock = {
          ...merged,
          startTime: splitBlocks[0].startTime,
          endTime: splitBlocks[0].endTime,
          updatedAt: trustedNow().toISOString(),
        };

        setState((prev) => {
          const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
          const nextBlocks = prevDailyBlocks
            .map((b) => (b.id === blockId ? updatedSingleBlock : b))
            .sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));

          const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, nextBlocks);

          return {
            ...prev,
            timeTracker: {
              ...prevTT,
              dailyLogs: {
                ...(prevTT.dailyLogs || {}),
                [dateKey]: nextBlocks,
              },
            },
            ...pointsUpdate,
          };
        });
        return;
      }

      // Crossed midnight: split into Part 1 (today) and Part 2 (tomorrow)
      const nextDayKey = getNextDateKey(dateKey);
      const existingNextDayBlocks = currentTT.dailyLogs?.[nextDayKey] || [];

      const part1Collision = checkTimeCollision(splitBlocks[0], existingBlocks, blockId);
      if (part1Collision.hasCollision) {
        throw new Error(part1Collision.message || `Part 1 (Today) collides with an existing block on ${dateKey}.`);
      }

      const part2Collision = checkTimeCollision(splitBlocks[1], existingNextDayBlocks);
      if (part2Collision.hasCollision) {
        throw new Error(part2Collision.message || `Part 2 (Tomorrow) collides with an existing block on ${nextDayKey}.`);
      }

      const updatedPart1: TimeTrackerBlock = {
        ...merged,
        startTime: splitBlocks[0].startTime,
        endTime: splitBlocks[0].endTime,
        id: blockId,
        updatedAt: trustedNow().toISOString(),
      };

      const createdPart2: TimeTrackerBlock = {
        ...merged,
        startTime: splitBlocks[1].startTime,
        endTime: splitBlocks[1].endTime,
        id: uid(),
        createdAt: trustedNow().toISOString(),
        completed: false,
      };

      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDateBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const prevNextDayBlocks = prevTT.dailyLogs?.[nextDayKey] || [];

        const nextDateBlocks = prevDateBlocks
          .map((b) => (b.id === blockId ? updatedPart1 : b))
          .sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));

        const nextDaySortedBlocks = [...prevNextDayBlocks, createdPart2].sort(
          (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
        );

        const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, nextDateBlocks);

        return {
          ...prev,
          timeTracker: {
            ...prevTT,
            dailyLogs: {
              ...(prevTT.dailyLogs || {}),
              [dateKey]: nextDateBlocks,
              [nextDayKey]: nextDaySortedBlocks,
            },
          },
          ...pointsUpdate,
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.timeTracker]
  );

  const deleteDailyTimeBlock = useCallback(
    (dateKey: string, blockId: string) => {
      setState(
        (prev) => {
          if (dateKey < todayKey()) return prev;
          const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
          const updatedDeleted = [...(prev.deletedEntityIds || []), blockId].slice(-500);
          const nextBlocks = prevDailyBlocks.filter((b) => b.id !== blockId);
          const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, nextBlocks);

          return {
            ...prev,
            timeTracker: {
              ...prevTT,
              dailyLogs: {
                ...(prevTT.dailyLogs || {}),
                [dateKey]: nextBlocks,
              },
            },
            deletedEntityIds: updatedDeleted,
            ...pointsUpdate,
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Helper function to revert an un-completed or un-skipped block and cascade-revert any dependent pulled-forward blocks
  const revertBlockAndCascadingPulls = (
    blocks: TimeTrackerBlock[],
    targetBlockId: string
  ): TimeTrackerBlock[] => {
    // Collect IDs of any blocks that were pulled forward because of targetBlockId (if still pending)
    const revertedPulledBlockIds = new Set(
      blocks
        .filter((b) => b.pulledForwardTriggerId === targetBlockId && !b.completed && !b.skipped)
        .map((b) => b.id)
    );

    return blocks
      .map((b) => {
        // 1. Target block being uncompleted/unskipped: restore its own endTime and clear resolution/pull-link state
        if (b.id === targetBlockId) {
          return {
            ...b,
            endTime: b.trimmedOriginalEndTime || b.endTime,
            trimmedOriginalEndTime: undefined,
            trimmedDueToPullId: undefined,
            completed: false,
            completedAt: undefined,
            skipped: false,
            skippedAt: undefined,
            updatedAt: trustedNow().toISOString(),
          };
        }

        // 2. Any block pulled forward because of targetBlockId (if still pending)
        if (revertedPulledBlockIds.has(b.id)) {
          return {
            ...b,
            startTime: b.originalStartTime || b.startTime,
            endTime: b.originalEndTime || b.endTime,
            originalStartTime: undefined,
            originalEndTime: undefined,
            pulledForwardTriggerId: undefined,
            updatedAt: trustedNow().toISOString(),
          };
        }

        // 3. Any preceding block trimmed due to a pulled-forward block that is now reverted
        if (b.trimmedDueToPullId && revertedPulledBlockIds.has(b.trimmedDueToPullId)) {
          return {
            ...b,
            endTime: b.trimmedOriginalEndTime || b.endTime,
            trimmedOriginalEndTime: undefined,
            trimmedDueToPullId: undefined,
            updatedAt: trustedNow().toISOString(),
          };
        }

        return b;
      })
      .sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));
  };

  const toggleDailyTimeBlockCompleted = useCallback(
    (dateKey: string, blockId: string, passedTimeStr?: string) => {
      setState((prev) => {
        if (dateKey !== todayKey()) return prev;
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;

        const isCurrentlyCompleted = target.completed;

        if (isCurrentlyCompleted) {
          // UN-COMPLETING: Use cascade reversion to restore this block and any blocks pulled forward because of it
          const updatedBlocks = revertBlockAndCascadingPulls(prevDailyBlocks, blockId);

          const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);

          return {
            ...prev,
            timeTracker: {
              ...prevTT,
              dailyLogs: {
                ...(prevTT.dailyLogs || {}),
                [dateKey]: updatedBlocks,
              },
            },
            ...pointsUpdate,
          };
        }

        // COMPLETING: Execute trim logic (Dimension 2) ONLY for todayKey
        const updatedBlocks = prevDailyBlocks.map((b) => {
          if (b.id !== blockId) return b;

          let finalEndTime = b.endTime;
          let trimmedOriginalEndTime = b.trimmedOriginalEndTime;

          if (dateKey === todayKey()) {
            let timeStr = passedTimeStr;
            if (!timeStr) {
              const now = trustedNow();
              timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            }
            const currentMins = timeStringToMinutes(timeStr);
            const originalEndMins = timeStringToMinutes(b.endTime);
            const startMins = timeStringToMinutes(b.startTime);

            if (currentMins < originalEndMins && currentMins > startMins) {
              trimmedOriginalEndTime = b.endTime;
              finalEndTime = timeStr;
            }
          }

          return {
            ...b,
            endTime: finalEndTime,
            trimmedOriginalEndTime,
            completed: true,
            completedAt: trustedNow().toISOString(),
            skipped: false,
            skippedAt: undefined,
            updatedAt: trustedNow().toISOString(),
          };
        });

        const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);

        return {
          ...prev,
          timeTracker: {
            ...prevTT,
            dailyLogs: {
              ...(prevTT.dailyLogs || {}),
              [dateKey]: updatedBlocks,
            },
          },
          ...pointsUpdate,
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const markDailyTimeBlockSkipped = useCallback(
    (dateKey: string, blockId: string, passedTimeStr?: string) => {
      setState((prev) => {
        if (dateKey !== todayKey()) return prev;
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;

        const isCurrentlySkipped = target.skipped;

        if (isCurrentlySkipped) {
          // UN-SKIPPING: Use cascade reversion to restore this block and any blocks pulled forward because of it
          const updatedBlocks = revertBlockAndCascadingPulls(prevDailyBlocks, blockId);

          const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);

          return {
            ...prev,
            timeTracker: {
              ...prevTT,
              dailyLogs: {
                ...(prevTT.dailyLogs || {}),
                [dateKey]: updatedBlocks,
              },
            },
            ...pointsUpdate,
          };
        }

        // SKIPPING: Execute trim logic (Dimension 2) ONLY for todayKey
        const updatedBlocks = prevDailyBlocks.map((b) => {
          if (b.id !== blockId) return b;

          let finalEndTime = b.endTime;
          let trimmedOriginalEndTime = b.trimmedOriginalEndTime;

          if (dateKey === todayKey()) {
            let timeStr = passedTimeStr;
            if (!timeStr) {
              const now = trustedNow();
              timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            }
            const currentMins = timeStringToMinutes(timeStr);
            const originalEndMins = timeStringToMinutes(b.endTime);
            const startMins = timeStringToMinutes(b.startTime);

            if (currentMins < originalEndMins && currentMins > startMins) {
              trimmedOriginalEndTime = b.endTime;
              finalEndTime = timeStr;
            }
          }

          return {
            ...b,
            endTime: finalEndTime,
            trimmedOriginalEndTime,
            completed: false,
            completedAt: undefined,
            skipped: true,
            skippedAt: trustedNow().toISOString(),
            updatedAt: trustedNow().toISOString(),
          };
        });

        const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);

        return {
          ...prev,
          timeTracker: {
            ...prevTT,
            dailyLogs: {
              ...(prevTT.dailyLogs || {}),
              [dateKey]: updatedBlocks,
            },
          },
          ...pointsUpdate,
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const undoDailyTimeBlockResolution = useCallback(
    (dateKey: string, blockId: string) => {
      setState((prev) => {
        if (dateKey !== todayKey()) return prev;
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;

        const updatedBlocks = revertBlockAndCascadingPulls(prevDailyBlocks, blockId);

        const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);

        return {
          ...prev,
          timeTracker: {
            ...prevTT,
            dailyLogs: {
              ...(prevTT.dailyLogs || {}),
              [dateKey]: updatedBlocks,
            },
          },
          ...pointsUpdate,
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const pullForwardDailyTimeBlock = useCallback(
    (
      dateKey: string,
      blockId: string,
      newStartTime: string,
      mode: 'shift' | 'stretch' = 'stretch',
      triggerBlockId?: string
    ) => {
      const currentTT = get().timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const currentDailyBlocks = currentTT.dailyLogs?.[dateKey] || [];
      const target = currentDailyBlocks.find((b) => b.id === blockId);
      if (!target) return;

      const originalStartTime = target.originalStartTime || target.startTime;
      let newEndTime = target.endTime;
      const originalEndTime = target.originalEndTime || target.endTime;
      const newStartMins = timeStringToMinutes(newStartTime);

      if (mode === 'shift') {
        const startMins = timeStringToMinutes(target.startTime);
        const endMins = timeStringToMinutes(target.endTime);
        const duration = Math.max(1, endMins - startMins);
        const newEndMins = Math.min(1439, newStartMins + duration);
        newEndTime = minutesToTimeString(newEndMins);
      } else {
        newEndTime = target.originalEndTime || target.endTime;
        if (newStartMins >= timeStringToMinutes(newEndTime)) {
          const newEndMins = Math.min(1439, newStartMins + 15);
          newEndTime = minutesToTimeString(newEndMins);
        }
      }

      if (timeStringToMinutes(newStartTime) >= timeStringToMinutes(newEndTime)) {
        throw new Error('Invalid time range: start time must be before end time.');
      }

      const targetNewBlock: TimeTrackerBlock = {
        ...target,
        startTime: newStartTime,
        endTime: newEndTime,
        originalStartTime,
        originalEndTime,
        pulledForwardTriggerId: triggerBlockId,
        updatedAt: trustedNow().toISOString(),
      };

      // Adjust preceding blocks that overlap with newStartTime (e.g. earlier block ending after newStartTime)
      const adjustedBlocks = currentDailyBlocks.map((b) => {
        if (b.id === blockId) return targetNewBlock;
        const bStart = timeStringToMinutes(b.startTime);
        const bEnd = timeStringToMinutes(b.endTime);
        if (bStart <= newStartMins && bEnd > newStartMins) {
          return {
            ...b,
            endTime: newStartTime,
            trimmedOriginalEndTime: b.trimmedOriginalEndTime || b.endTime,
            trimmedDueToPullId: blockId,
            updatedAt: trustedNow().toISOString(),
          };
        }
        return b;
      });

      // Check collision for targetNewBlock against adjustedBlocks (ignoring target block)
      const collision = checkTimeCollision(targetNewBlock, adjustedBlocks, blockId);
      if (collision.hasCollision) {
        throw new Error(collision.message || 'Cannot pull block forward due to overlapping schedule block.');
      }

      setState(
        (prev) => {
          if (dateKey !== todayKey()) return prev;
          const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];

          const updatedBlocks = prevDailyBlocks.map((b) => {
            if (b.id === blockId) return targetNewBlock;
            const bStart = timeStringToMinutes(b.startTime);
            const bEnd = timeStringToMinutes(b.endTime);
            if (bStart <= newStartMins && bEnd > newStartMins) {
              return {
                ...b,
                endTime: newStartTime,
                trimmedOriginalEndTime: b.trimmedOriginalEndTime || b.endTime,
                trimmedDueToPullId: blockId,
                updatedAt: trustedNow().toISOString(),
              };
            }
            return b;
          });

          const sortedBlocks = updatedBlocks.sort(
            (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
          );

          const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, sortedBlocks);

          return {
            ...prev,
            timeTracker: {
              ...prevTT,
              dailyLogs: {
                ...(prevTT.dailyLogs || {}),
                [dateKey]: sortedBlocks,
              },
            },
            ...pointsUpdate,
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const undoEarlyStartTimeBlock = useCallback(
    (dateKey: string, blockId: string) => {
      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;

        const originalStart = target.originalStartTime || target.startTime;
        const originalEnd = target.originalEndTime || target.endTime;

        const updatedBlocks = prevDailyBlocks
          .map((b) => {
            if (b.id === blockId) {
              return {
                ...b,
                startTime: originalStart,
                endTime: originalEnd,
                originalStartTime: undefined,
                originalEndTime: undefined,
                trimmedOriginalEndTime: undefined,
                pulledForwardTriggerId: undefined,
                completed: false,
                completedAt: undefined,
                skipped: false,
                skippedAt: undefined,
                updatedAt: trustedNow().toISOString(),
              };
            }
            // If preceding block was trimmed to make room for the early start, restore its trimmed end time
            if (
              b.trimmedDueToPullId === blockId ||
              (b.trimmedOriginalEndTime && timeStringToMinutes(b.endTime) <= timeStringToMinutes(target.startTime))
            ) {
              return {
                ...b,
                endTime: b.trimmedOriginalEndTime || b.endTime,
                trimmedOriginalEndTime: undefined,
                trimmedDueToPullId: undefined,
                updatedAt: trustedNow().toISOString(),
              };
            }
            return b;
          })
          .sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));

        return {
          ...prev,
          timeTracker: {
            ...prevTT,
            dailyLogs: {
              ...(prevTT.dailyLogs || {}),
              [dateKey]: updatedBlocks,
            },
          },
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const startDailyBlockBreak = useCallback(
    (dateKey: string, blockId: string, durationMinutes: number) => {
      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;

        const updatedBlocks = prevDailyBlocks.map((b) => {
          if (b.id !== blockId) return b;
          return {
            ...b,
            breakDurationMinutes: durationMinutes,
            breakStartedAt: trustedNow().toISOString(),
            breakEndedAt: undefined,
            updatedAt: trustedNow().toISOString(),
          };
        });

        return {
          ...prev,
          timeTracker: {
            ...prevTT,
            dailyLogs: {
              ...(prevTT.dailyLogs || {}),
              [dateKey]: updatedBlocks,
            },
          },
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const endDailyBlockBreakEarly = useCallback(
    (dateKey: string, blockId: string) => {
      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;

        const now = trustedNow();
        const startMs = target.breakStartedAt ? new Date(target.breakStartedAt).getTime() : now.getTime();
        const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
        const plannedMinutes = target.breakDurationMinutes || 1;
        const actualMinutes = Math.max(1, Math.min(plannedMinutes, Math.ceil(elapsedSeconds / 60)));

        const updatedBlocks = prevDailyBlocks.map((b) => {
          if (b.id !== blockId) return b;
          return {
            ...b,
            breakDurationMinutes: actualMinutes,
            breakEndedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
        });

        return {
          ...prev,
          timeTracker: {
            ...prevTT,
            dailyLogs: {
              ...(prevTT.dailyLogs || {}),
              [dateKey]: updatedBlocks,
            },
          },
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const finalizeDailyBlockBreakNatural = useCallback(
    (dateKey: string, blockId: string) => {
      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target || !target.breakStartedAt || target.breakEndedAt) return prev;

        const startMs = new Date(target.breakStartedAt).getTime();
        const plannedMinutes = target.breakDurationMinutes || 1;
        const exactEndIso = new Date(startMs + plannedMinutes * 60 * 1000).toISOString();

        const updatedBlocks = prevDailyBlocks.map((b) => {
          if (b.id !== blockId) return b;
          return {
            ...b,
            breakEndedAt: exactEndIso,
            updatedAt: trustedNow().toISOString(),
          };
        });

        return {
          ...prev,
          timeTracker: {
            ...prevTT,
            dailyLogs: {
              ...(prevTT.dailyLogs || {}),
              [dateKey]: updatedBlocks,
            },
          },
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const applyTemplateToDate = useCallback(
    (dateKey: string, templateId: string, mode: 'merge' | 'replace' = 'merge') => {
      let addedCount = 0;
      let rejectedCount = 0;

      setState(
        (prev) => {
          if (dateKey < todayKey()) return prev;
          const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const template = prevTT.templates?.find((t) => t.id === templateId);
          if (!template) return prev;

          const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];

          // Internal helper for precise minute calculation
          const getMins = (time: string) => {
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
          };

          // Factory to ensure clean, untracked blocks with fresh IDs
          const createFreshBlock = (b: any) => ({
            ...b,
            id: crypto.randomUUID(),
            createdAt: trustedNow().toISOString(),
            completed: false,
            skipped: false,
            completedAt: undefined,
            skippedAt: undefined,
            originalStartTime: undefined,
            originalEndTime: undefined,
            trimmedOriginalEndTime: undefined,
          });

          let updatedBlocks: TimeTrackerBlock[] = [];

          if (mode === 'replace') {
            // REPLACE: Wipe slate clean, map fresh template blocks
            updatedBlocks = template.blocks.map(createFreshBlock);
            addedCount = updatedBlocks.length;
          } else {
            // MERGE: Keep existing, carefully inject non-overlapping template blocks
            updatedBlocks = [...prevDailyBlocks];

            for (const tBlock of template.blocks) {
              const tStart = getMins(tBlock.startTime);
              const tEnd = getMins(tBlock.endTime);

              const hasOverlap = updatedBlocks.some((existing) => {
                const eStart = getMins(existing.startTime);
                const eEnd = getMins(existing.endTime);
                // Strict overlap formula
                return tStart < eEnd && eStart < tEnd;
              });

              if (!hasOverlap) {
                updatedBlocks.push(createFreshBlock(tBlock));
                addedCount++;
              } else {
                rejectedCount++;
              }
            }
          }

          // Always keep the timeline chronologically sorted
          updatedBlocks.sort((a, b) => getMins(a.startTime) - getMins(b.startTime));

          const replacedBlockIds = mode === 'replace' ? prevDailyBlocks.map((b) => b.id) : [];
          const updatedDeleted = replacedBlockIds.length > 0
            ? [...(prev.deletedEntityIds || []), ...replacedBlockIds].slice(-500)
            : prev.deletedEntityIds;

          const updatedClearedDates = (prevTT.clearedDates || []).filter((d) => d !== dateKey);


          const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);
          const finalDeleted = pointsUpdate.deletedEntityIds
            ? Array.from(new Set([...(updatedDeleted || []), ...pointsUpdate.deletedEntityIds])).slice(-500)
            : updatedDeleted;

          return {
            ...prev,
            timeTracker: {
              ...prevTT,
              dailyLogs: {
                ...(prevTT.dailyLogs || {}),
                [dateKey]: updatedBlocks,
              },
              clearedDates: updatedClearedDates,
            },
            ...pointsUpdate,
            ...(finalDeleted !== undefined ? { deletedEntityIds: finalDeleted } : {}),
          };
        },
        { immediate: true }
      );

      return { added: addedCount, rejected: rejectedCount };
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const clearDailyTimeBlocks = useCallback((dateKey: string) => {
    setState(
      (prev) => {
        if (dateKey < todayKey()) return prev;
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const existingBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const deletedIds = existingBlocks.map((b) => b.id);
        const updatedDeleted = [...(prev.deletedEntityIds || []), ...deletedIds].slice(-500);

        const nextLogs = {
          ...(prevTT.dailyLogs || {}),
          [dateKey]: [], // Intentionally empty array, prevents auto-hydration loop
        };

        const existingCleared = prevTT.clearedDates || [];
        const nextCleared = existingCleared.includes(dateKey)
          ? existingCleared
          : [...existingCleared, dateKey];

        const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, []);
        const finalDeleted = pointsUpdate.deletedEntityIds
          ? Array.from(new Set([...updatedDeleted, ...pointsUpdate.deletedEntityIds])).slice(-500)
          : updatedDeleted;

        return {
          ...prev,
          timeTracker: {
            ...prevTT,
            dailyLogs: nextLogs,
            clearedDates: nextCleared,
          },
          ...pointsUpdate,
          deletedEntityIds: finalDeleted,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hydrateTimeTrackerForDate = useCallback((dateKey: string) => {
    setState((prev) => {
      const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const { updatedState, hydrated } = autoHydrateDailyLog(currentTT, dateKey);
      if (!hydrated) return prev;
      return {
        ...prev,
        timeTracker: updatedState,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    isAuthChecking,
    isSessionLoading,
    storedSessionWait,
    setAuthSessionState,
    logout,
    logoutGuest,
    addPresetHabit,
    addCustomHabit,
    updateHabit,
    deleteHabit,
    toggleHabit,
    toggleReadingHabit,
    isHabitDone,
    saveJournalEntry,
    deleteJournalEntry,
    getTodayJournalEntry,
    markLessonRead,
    setUsername,
    updateProfileUsername,
    updateProfileAvatar,
    setThemePreference,
    toggleThemePreference,
    toggleProfilePrivacy,
    toggleAcceptPartnerInvites,
    toggleNotifDailyReminder,
    toggleNotifPartnerActivity,
    toggleNotifLeagueUpdates,
    getLeagueData,
    refreshLeagueStandings,
    getPublicImprovementPlans,
    // New Module Actions
    logWorkout,
    deleteWorkout,
    setExerciseGoal,
    addBook,
    updateBookTargetDate,
    updateReadingProgress,
    finishBook,
    deleteBook,
    addSkill,
    logSkillPractice,
    updateSkillLevel,
    deleteSkill,
    deleteSkillLog,
    addBadHabit,
    logBadHabitDay,
    undoTodayBadHabitLog,
    deleteBadHabit,
    completeBadHabit,
    updateBadHabit,
    setAddictionTracker,
    deleteAddictionTracker,
    resetAddictionStreak,
    checkAddictionMilestones,
    logCraving,
    deleteCravingLog,
    logFocusSession,
    updateFocusLogReflection,
    deleteFocusLog,
    addDecision,
    reflectDecision,
    deleteDecisionLog,
    logEmotion,
    deleteEmotionLog,
    addWeeklyReflection,
    updateWeeklyReflection,
    deleteWeeklyReflection,
    addWeeklyGoalItem,
    updateWeeklyGoalItem,
    deleteWeeklyGoalItem,
    carryOverGoal,
    syncLinkedWeeklyGoals,
    toggleNotifSundayPlanning,
    // Self Improvement Books Library Actions
    addCuratedBookToLibrary,
    addCustomBookToLibrary,
    updateUserBookStatus,
    restartBook,
    removeBookFromLibrary,
    getUserBookStatus,
    // Social Features Actions
    createImprovementPlan,
    updateImprovementPlan,
    togglePlanVisibility,
    updateTargetGoalProgress,
    setNewTargetGoal,
    markHabitJourneyDone,
    undoHabitJourneyDone,
    addVisionReflectionNote,
    editVisionReflectionNote,
    deleteVisionReflectionNote,
    completeFollowedPlanStep,
    updateFollowedTargetGoalProgress,
    setNewFollowedTargetGoal,
    markFollowedHabitJourneyDone,
    undoFollowedHabitJourneyDone,
    addFollowedVisionReflectionNote,
    editFollowedVisionReflectionNote,
    deleteFollowedVisionReflectionNote,
    copyPublicPlan,
    updatePlanCopyCount,
    deleteFollowedPlan,
    completePlanStep,
    deletePlan,
    sendPartnerInvite,
    acceptPartnerInvite,
    cancelPartnerInvite,
    declinePartnerInvite,
    endPartnership,
    getPartnerProfileStats,
    createSharedChallenge,
    logSharedChallengeHabit,
    deleteSharedChallenge,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotification,
    // Projects & Goals Module Actions
    createGoal,
    updateGoal,
    deleteGoal,
    createProject,
    updateProject,
    moveProjectOrder,
    moveProjectStatus,
    deleteProject,
    createTask,
    updateTask,
    toggleTaskCompleted,
    deleteTask,
    toggleSubtask,
    addSubtask,
    deleteSubtask,
    // Time Tracker Module Actions
    addTimeTrackerActivity,
    updateTimeTrackerActivity,
    deleteTimeTrackerActivity,
    createTimeTrackerTemplate,
    updateTimeTrackerTemplate,
    deleteTimeTrackerTemplate,
    restoreTimeTrackerTemplate,
    toggleTemplateAutoApplyDay,
    addDailyTimeBlock,
    updateDailyTimeBlock,
    deleteDailyTimeBlock,
    toggleDailyTimeBlockCompleted,
    markDailyTimeBlockSkipped,
    undoDailyTimeBlockResolution,
    undoEarlyStartTimeBlock,
    pullForwardDailyTimeBlock,
    startDailyBlockBreak,
    endDailyBlockBreakEarly,
    finalizeDailyBlockBreakNatural,
    applyTemplateToDate,
    clearDailyTimeBlocks,
    hydrateTimeTrackerForDate,
    // Destructive Wipe Confirmation Gate
    destructiveWipeModal,
    isSavingDestructiveWipe,
    handleConfirmDestructiveWipe,
    handleCancelDestructiveWipe,
  };
}

export type AppStore = ReturnType<typeof useAppState>;
