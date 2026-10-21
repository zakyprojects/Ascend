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
  TimeTrackerActivity,
  TimeTrackerTemplate,
  TimeTrackerState,
  TimeTrackerBlock,
  DEFAULT_TIME_TRACKER_ACTIVITIES,
  DEFAULT_TIME_TRACKER_STATE,
  NotificationPreferenceKey,
  RankCelebrated,
} from '@/types';
import { mergeRankCelebrated } from './rankCelebration';
import { isDeviceOffline } from './deviceOffline';

/** The on/off UserProfile settings the Settings switches write to the profile row. */
type ProfileSwitchKey = NotificationPreferenceKey | 'isProfilePublic' | 'acceptPartnerInvites';
import {
  ensureDefaultActivities,
  autoHydrateDailyLog,
  checkTimeCollision,
  normalizeOrSplitMidnightBlock,
  timeStringToMinutes,
  minutesToTimeString,
  commitTimeTrackerDays,
  describeBlockSpan,
  findSplitPartner,
  plannedBlocksForDate,
  templateDays,
  lastBlockOfDay,
} from './timeTracker';
import { findCuratedBook } from './books';
import { uid, generateUUID, generateNumericUID, periodKey, todayKey, isPlanJourneyDoneThisPeriod, calculateActivePlanStreak, getWeekDates, parseDate, getNow, getNextDateKey, weekKey, addDays } from './dates';
import { computeLinkedGoalProgress, linkedEntryPresent, linkedGoalCrossing, linkedItemExists, linkedGoalUnit } from './linkedGoalMetrics';
import { autoStatusChanges } from './projectProgress';
import { reconcileSharedChallengeLifecycle, applyPledgeToggle, mergeSharedChallenge } from './pactLifecycle';
import { isPartnershipUser1 } from './partnershipSide';
import { PresetHabit } from './presets';
import { sameName } from './uniqueNames';
import { computeHabitAwards, isHabitAwardEntry, isRetiredAppHabitAward, presetHabitPoints } from './habitAwards';
import { computeWorkoutAwards, isRetiredAppWorkoutAward, isWorkoutDayEntry } from './workoutAwards';
import { computeSkillAwards, isRetiredAppSkillAward, isSkillDayEntry } from './skillAwards';
import { computeRecoveryChanges, RECOVERY_MILESTONES, trackerStartMs } from './recoveryAwards';
import { computeJournalAward, isJournalDayEntry, isRetiredAppJournalAward, journalEntryEarns } from './journalAwards';
import { computeFocusAwards, isFocusDayEntry, isRetiredAppFocusAward } from './focusAwards';
import { computeTimeTrackerAward, timeTrackerAwardId, timeTrackerGraceDay } from './timeTrackerAwards';
import {
  countedGoalRefs,
  heldCountedGoals,
  isReflectionWindowOpen,
  legacyHeldWeeklyPoints,
  reflectionWindow,
  weeklyGoalAwardTimestamp,
  weeklyScoringGoals,
} from './weeklyAwards';
import { computeLessonAward, isLessonReadInSeason, lessonReadId } from './lessonAwards';
import {
  computeReadingDayAward,
  isBookUnitLocked,
  isReadingDayEntry,
  isRetiredAppReadingAward,
  meetsReadingBonusGates,
  readingBonusCooldown,
  readingBonusAlreadyGiven,
  readingBonusId,
} from './readingAwards';
import {
  getLeaguePeriodStart,
  getLeaguePointsPeriods,
  getLiveLeaguePointsPeriods,
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
  syncSeasonConfig,
} from './leagueTime';
import {
  logoutUser,
  deleteOwnAccount,
  clearLocalUserData,
  updateProfilePrivacy,
  updateProfileAcceptPartnerInvites,
  updateProfileNotificationPreferences,
  setCachedProfiles,
  setCachedLeaguePoints,
  fetchProfileByUidFromSupabase,
} from './auth';
import { hydrateUserSession } from './authSession';
import { createLeagueStandingsRefresher, leaguePeriodKey } from './leagueStandingsRefresh';
import {
  badHabitCreatedDay,
  getAppStateSeasonPoints,
  getBadHabitBadDaysBefore,
} from './habitPenalties';
import { toSeasonHistory } from './seasonArchive';
import { addPointsInternal } from './pointsLedger';
import { clockReady, trustedNow, trustedNowMs } from './clock';
import { editedPlanStructure, type PlanStructureEdits } from './planStructure';
export { addPointsInternal };
import {
  PresetHabitCapItem,
  recomputeTodayPresetPoints,
  WEEKLY_REFLECTION_POINTS,
  READING_POINTS,
  WEEKLY_GOALS_POINTS,
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
  computeBadHabitAwards,
  isBadHabitDayEntry,
  isRetiredAppBadHabitAward,
} from './badHabitAwards';
export { recomputeTodayPresetPoints, calculateWeeklyGoalsPoints, WEEKLY_GOALS_POINTS };
export type { PresetHabitCapItem };
import { calculateUnifiedStreak } from './streakLogic';
import { hasStateData, isGuardedKey } from './dataWeight';
import {
  supabase,
  isSupabaseConfigured,
  syncBroadcaster,
  syncPlanToSupabase,
  syncFollowedPlanToSupabase,
  deletePlanFromSupabase,
  deleteFollowedPlanFromSupabase,
  sendPartnerInviteSupabase,
  fetchUserDataWithStatusFromSupabase,
  getUserDataWatermark,
  setUserDataWatermark,
  resetUserDataWatermark,
  lowerUserDataWatermark,
  saveUserDataToSupabase,
  fetchAllProfilesFromSupabase,
  fetchLeaguePointsFromSupabase,
  fetchProfileByUsernameFromSupabase,
  fetchPartnerInvitesSupabase,
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
  clearNotificationsSupabase,
  NOTIFICATION_WINDOW,
  NOTIFICATION_MAX_AGE_DAYS,
  storedAuthSession,
  hasSessionFor,
} from './supabase';
import { GuardBlockedError, SessionLostError } from './errors';
import { flushOutbox, hasPendingSyncOps, recordSyncedChanges } from './sync/outbox';
import { applyRemoteChanges, prepareRemoteRows, pullSyncedRows, type RemoteChange } from './sync/pull';
import { SYNCED_COLLECTIONS, itemsOf, rowIdOf, syncKeyOf } from './sync/syncedCollections';
import { mergeAppState, deduplicatePresetHabits, mergeAppStateWithGuardResult, isLegitimateTombstoneId } from './stateMerger';
import { toUserMessage } from './userMessage';
import { disablePush } from './push';
import { keepIfUnchanged } from './stateEquality';

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

/**
 * A week doc after this app changed it: it lists the goals deleted from it (removed ids added),
 * so a merge with an older copy can't bring them back. A doc with the list is merged goal by goal
 * on the server (20261019200000_weekly_goals_merge_per_goal.sql); one without it (an older app)
 * keeps last-writer-wins.
 */
function withDeletedGoalIds(doc: WeeklyGoal, removedIds: string[] = []): WeeklyGoal {
  return { ...doc, deletedGoalIds: Array.from(new Set([...(doc.deletedGoalIds || []), ...removedIds])) };
}

/**
 * Removes the current and future weeks' goals linked to deleted habits, books or skills (past
 * weeks keep theirs). The removed goal ids go to the tombstones (`removedGoalIds`) and to each
 * week's deletedGoalIds, so a sync or merge can't bring them back.
 */
function removeLinkedWeeklyGoals(
  weeklyGoals: WeeklyGoal[],
  linkedModule: 'habit' | 'skill' | 'reading',
  itemIds: (string | undefined)[],
  currentWeekKey: string
): { weeklyGoals: WeeklyGoal[]; removedGoalIds: string[] } {
  const validIds = new Set(itemIds.filter((id): id is string => Boolean(id)));
  const removedGoalIds: string[] = [];
  if (validIds.size === 0) return { weeklyGoals, removedGoalIds };

  const isLinked = (g: WeeklyGoalItem) => g.linkedModule === linkedModule && Boolean(g.linkedItemId) && validIds.has(g.linkedItemId!);
  const updated = weeklyGoals.map((w) => {
    if (w.weekKey < currentWeekKey) return w;
    const removed = w.goals.filter(isLinked).map((g) => g.id);
    if (removed.length === 0) return w;
    removedGoalIds.push(...removed);
    return withDeletedGoalIds({ ...w, goals: w.goals.filter((g) => !isLinked(g)) }, removed);
  });
  return { weeklyGoals: removedGoalIds.length > 0 ? updated : weeklyGoals, removedGoalIds };
}

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

const GUEST_STORAGE_KEY = 'ascend_guest_state_v2';
/** How long the boot loader waits on a saved sign-in before offering Retry (offline). */
const STORED_SESSION_WAIT_MS = 8000;
/** Most logs one "Clear older logs" removes (tombstones must fit the 500-id list). */
export const CLEAR_WORKOUTS_MAX = 300;
export const CLEAR_SKILL_LOGS_MAX = 300;
export const CLEAR_CRAVING_LOGS_MAX = 300;
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

  // Preset Habit Retirement Migration: retired presets leave (earned points stay)
  sweptState = applyPresetHabitRemovalMigration(sweptState, weekKey(now), todayKey(now));

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
/**
 * The user's own items still on this device whose rows the server deleted (on another device):
 * applying these changes removes them here. This device's own deletes are already gone from it.
 */
function countRemoteRemovals(state: AppState, changes: RemoteChange[]): number {
  return changes.filter((change) => {
    if (change.item !== null || !change.id || !isGuardedKey(change.key)) return false;
    const collection = SYNCED_COLLECTIONS.find((c) => syncKeyOf(c) === change.key);
    return Boolean(collection && itemsOf(collection, state).some((item) => rowIdOf(collection, item) === change.id));
  }).length;
}

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
    trustedNow().getTime(),
    (state.pointsHistory || []).find((e) => isWorkoutDayEntry(e, day))
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
    trustedNow().getTime(),
    (state.pointsHistory || []).find((e) => isSkillDayEntry(e, day))
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
    trustedNow().getTime(),
    (state.pointsHistory || []).find((e) => isFocusDayEntry(e, day))
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
  const entry = computeJournalAward(
    journalEntries,
    day,
    new Date(`${day}T00:00:00`).getTime(),
    trustedNow().getTime(),
    (state.pointsHistory || []).find((e) => isJournalDayEntry(e, day))
  );
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
    trustedNow().getTime(),
    (state.pointsHistory || []).find((e) => isReadingDayEntry(e, day))
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

/** Local midnight of a day key, in ms (the start of "today" for the earlier-day rule). */
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
  now: Date = getNow()
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
export function reconcileLinkedWeeklyGoals(state: AppState, now: Date = getNow()): AppState {
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

export function useAppState() {
  const [state, setStateRaw] = useState<AppState>(loadInitialState);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  // True while a sign-in made after the initial check (login, sign-up, guest) loads the user's data.
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  // The inbox's first fetch this session: 'loading' until it answers, 'failed' when it could not
  // (offline or a server error; the list on screen stays), 'ready' after a good fetch.
  const [notificationsStatus, setNotificationsStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const notificationsRefreshRef = useRef<(() => Promise<void>) | null>(null);
  // Partners page: whether partnerships, invites and challenges came back from the last fetch.
  const [partnersStatus, setPartnersStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const partnersRefreshRef = useRef<(() => Promise<void>) | null>(null);
  // The initial check found no session while this device still holds a saved sign-in (a phone's
  // network not ready yet): the boot loader stays up until Supabase signs it in or drops it, rather
  // than flashing the sign-in page. 'failed' once that takes too long (offline).
  const [storedSessionWait, setStoredSessionWait] = useState<'idle' | 'waiting' | 'failed'>('idle');
  const storedSessionWaitRef = useRef(false);
  const storedSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHydrated = useRef(false);
  // The signed-in account's data came from the server this session: hydration finished and every
  // synced table was read (at boot, or by a later pull if a boot read failed). A device cache alone
  // never sets it, so moments that compare against saved memory (the rank-up) wait for it.
  const [isServerDataApplied, setIsServerDataApplied] = useState(false);
  const canPersistLocally = useRef(false);
  const authGenerationRef = useRef(0);
  const currentUserRef = useRef<UserProfile | null>(state.currentUser);
  // The SIGNED_OUT handling of the auth listener, also run for a sign-in that died without that event.
  const applySignedOutRef = useRef<(() => void) | null>(null);
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;

  /**
   * The app shows an account whose sign-in this tab no longer holds (storage cleared outside the
   * app, or a sign-out elsewhere this tab never heard of): show it signed out, as SIGNED_OUT would.
   * A refresh token still on the device means Supabase is only waiting to refresh it (offline), so
   * nothing changes then. Unsaved changes stay in the account's device cache and are merged and
   * saved at its next sign-in.
   */
  const checkLostSession = useCallback(async () => {
    const userId = currentUserRef.current?.id;
    if (!userId || !isHydrated.current || storedSessionWaitRef.current) return;
    if (await hasSessionFor(userId)) return;
    if (storedAuthSession()) return;
    if (currentUserRef.current?.id !== userId) return;
    console.warn('[AUTH] Sign-in for this account is gone from this tab; showing it signed out.');
    applySignedOutRef.current?.();
  }, []);
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
      fetchPoints: (now, scope) =>
        fetchLeaguePointsFromSupabase(scope === 'live' ? getLiveLeaguePointsPeriods(now) : getLeaguePointsPeriods(now)),
      now: leagueNow,
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
      apply: ({ profiles, points }) => {
        if (profiles) setCachedProfiles(profiles);
        if (points) setCachedLeaguePoints(points);
        setLeagueDataVersion((v) => v + 1);
      },
      onStatusChange: () => setLeagueDataVersion((v) => v + 1),
    })
  );
  /** Refetches other members' standings; `full` skips the 15 s throttle (sign-in, new period). */
  const refreshLeagueStandings = leagueRefresher.refresh;
  /**
   * Whether other members' standings are in for this sign-in: 'ready' after a full fetch for the
   * current member, 'failed' when the last attempt (or being offline) left none, else 'loading'.
   * Read live each render; leagueDataVersion re-renders on every change.
   */
  const currentUserId = state.currentUser?.id ?? null;
  const getLeagueStandingsStatus = useCallback((): 'loading' | 'ready' | 'failed' => {
    const fetchedFor = leagueRefresher.fetchedUserId();
    if (fetchedFor && fetchedFor === currentUserId) return 'ready';
    if (leagueRefresher.isRefreshing()) return 'loading';
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return offline || leagueRefresher.lastAttemptFailed() ? 'failed' : 'loading';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueRefresher, currentUserId, leagueDataVersion]);
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
    // Drop the items its own tombstones remove, as the save itself does: keeping them in the
    // cache and on screen brought the same prompt back on the next load.
    const stateToSave = mergeAppState(destructiveWipeModal.stateToRetry, destructiveWipeModal.stateToRetry, 'writeSync');
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
      const { changes, everyTableRead } = await pullSyncedRows(userId, full);
      const applied = everyTableRead && isHydrated.current && currentUserRef.current?.id === userId;
      if (changes.length > 0) {
        lowerUserDataWatermark(userId, countRemoteRemovals(stateRef.current, changes));
        setState((prev) => (prev.currentUser?.id === userId ? applyRemoteChanges(prev, changes) : prev));
      }
      if (applied) setIsServerDataApplied(true);
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
          lowerUserDataWatermark(syncedUserId, countRemoteRemovals(stateRef.current, changes));
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
      // Offline every request below fails; the online event forces this sync on return.
      if (isSyncing || isDeviceOffline()) return;
      const now = trustedNowMs();
      if (!force && now - lastSyncTimeRef.current < SYNC_THROTTLE_MS) {
        return;
      }

      const userId = currentUserRef.current?.id;
      if (!userId || !isHydrated.current || !isSupabaseConfigured) return;
      void syncTables(userId, false);

      try {
        isSyncing = true;
        const serverRes = await fetchUserDataWithStatusFromSupabase(userId);
        if (serverRes.exists && serverRes.state) {
          lastSyncTimeRef.current = trustedNowMs();
          setStateRaw((current) => {
            // Reconcile and union-merge server state with current state using mergeAppState
            // Tombstones (deletedEntityIds) prevent resurrecting deleted items while preserving offline progress
            const serverState = serverRes.state!;
            // Nothing new on the server: keep the same state, so no save starts.
            const merged = keepIfUnchanged(
              current,
              reconcileWeeklyGoalsPointsForAllWeeks(
                reconcileLinkedWeeklyGoals(
                  mergeAppState(serverState, current, 'hydration'),
                  getNow()
                ),
                getNow()
              )
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
            if (hasStateData(state)) {
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
            if (err instanceof SessionLostError) {
              // Not a connection problem: kept on the device (dirty flag); no toast.
              void checkLostSession();
              return;
            }
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
      } else if (!isLoggingOutRef.current) {
        // A log-out already sent what was unsaved and is about to end the sign-in; a save started
        // now would reach the server after that and be refused.
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(async () => {
          try {
            await enqueuePersist(state);
            if (typeof window !== 'undefined' && state.currentUser?.id) {
              localStorage.removeItem(`ascend_dirty_${state.currentUser.id}`);
            }
          } catch (err) {
            if (err instanceof SessionLostError) {
              // Not a connection problem: kept on the device (dirty flag); no toast.
              void checkLostSession();
              return;
            }
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
        const [sessionRes] = await Promise.all([
          supabase.auth.getSession(),
          refreshLeagueStandings({ full: true }),
        ]);

        if (mounted) {
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

    /** Leaves the signed-in account: guest state on screen, nothing more saved for the account. */
    const applySignedOut = () => {
      endStoredSessionWait();
      const myGeneration = ++authGenerationRef.current;
      clearLeagueStandings();

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      pendingImmediateResolvers.current = [];
      isHydrated.current = false;
      setIsServerDataApplied(false);
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
    };
    applySignedOutRef.current = applySignedOut;

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
          applySignedOut();
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
          if (currentUserRef.current?.id !== session.user.id) setIsServerDataApplied(false);
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
            const { user, state: hydratedState, tablesRead } = await Promise.race([
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
                reconcileLinkedWeeklyGoals(rawMergedState, getNow()),
                getNow()
              );

              lastKnownGoodStateRef.current = reconciledMergedState;

              setState(reconciledMergedState);
              // Same batch as the state: the first render that sees the flag sees the server data.
              setIsServerDataApplied(tablesRead && !guardResult.hasSuspiciousDrop);

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
              setIsServerDataApplied(false);

              if (cachedState) {
                const sanitizedCached = sanitizeLoadedState(cachedState, fallbackUser);
                setState((current) =>
                  reconcileWeeklyGoalsPointsForAllWeeks(
                    reconcileLinkedWeeklyGoals(mergeAppState(sanitizedCached, current, 'hydration'), getNow()),
                    getNow()
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
                if (!hasStateData(resultingState)) {
                  canPersistLocally.current = true;
                }
              }
            }
          } finally {
            if (mounted && myGeneration === authGenerationRef.current) setIsSessionLoading(false);
            if (mounted) setIsAuthChecking(false);
          }
        } else if (!session?.user) {
          // No session yet, but a saved sign-in: keep the boot loader (see storedSessionWait).
          if (!holdForStoredSession() && mounted) setIsAuthChecking(false);
        }
        // Any other event carries the session of the account that INITIAL_SESSION / SIGNED_IN is
        // loading or has loaded (e.g. TOKEN_REFRESHED, which supabase fires at boot when it
        // refreshed an expired token). It must not end the boot check: that showed the sign-in
        // page while the account was still loading.
      }, 0);
    });

    return () => {
      mounted = false;
      applySignedOutRef.current = null;
      if (storedSessionTimerRef.current) clearTimeout(storedSessionTimerRef.current);
      authListener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Real-time synchronization listener for cross-tab / multi-user updates
  useEffect(() => {
    const unsubscribe = syncBroadcaster.subscribe((event, payload) => {
      // A plan deleted in another tab leaves this tab's plan list too.
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

        if (event === 'FOLLOW_UPDATED') {
          // Another tab of the same account changed a copy: take it, so this tab's older copy
          // never overwrites it on its next save.
          if (!payload?.id || !prev.currentUser?.id || payload.userId !== prev.currentUser.id) return prev;
          const exists = prev.followedPlans.some((f) => f.id === payload.id);
          return {
            ...prev,
            followedPlans: exists
              ? prev.followedPlans.map((f) => (f.id === payload.id ? { ...f, ...payload, syncStatus: f.syncStatus } : f))
              : [{ ...payload, syncStatus: 'synced' }, ...prev.followedPlans],
          };
        }

        if (event === 'FOLLOW_DELETED') {
          if (!prev.followedPlans.some((f) => f.id === payload.followId)) return prev;
          return { ...prev, followedPlans: prev.followedPlans.filter((f) => f.id !== payload.followId) };
        }

        if (event === 'PARTNER_INVITE_SENT') {
          const invite = payload.invite || payload;

          if (
            invite.toUsername.toLowerCase() === prev.username.toLowerCase() ||
            (prev.currentUser?.id && invite.toUserId === prev.currentUser.id)
          ) {
            // Only the invite: its notice is the server's row, which arrives by realtime (N13).
            if (prev.partnerInvites.some((i) => i.id === invite.id)) return prev;
            return { ...prev, partnerInvites: [invite, ...prev.partnerInvites] };
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
    // A new account (or a fresh sign-in) waits for its own first inbox fetch.
    setNotificationsStatus('loading');
    setPartnersStatus('loading');
    // Offline at start: the channel never subscribes and polling waits for 'online', so nothing would
    // end the loading state. Show Couldn't load / Retry now; the 'online' handler re-syncs (C1).
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setNotificationsStatus('failed');
      setPartnersStatus('failed');
    }

    /** Keeps local "read" marks (a mark-read may still be on its way) and drops cleared rows. */
    const mergeFetchedNotifications = (prev: AppState, fetched: AppNotification[]): AppNotification[] => {
      const currentTombstones = new Set(prev.deletedEntityIds || []);
      return fetched
        .filter((fn) => !currentTombstones.has(fn.id))
        .map((fn) => {
          const local = prev.notifications?.find((n) => n.id === fn.id);
          return local && local.read ? { ...fn, read: true } : fn;
        });
    };

    /**
     * This tab still holds this account's session. A tab whose sign-in lapsed would otherwise poll
     * as anon every 10 s and get "permission denied"; it skips, and a sign-in that is gone for good
     * shows the tab signed out (checkLostSession).
     */
    const hasSession = async () => {
      if (await hasSessionFor(userId)) return true;
      void checkLostSession();
      return false;
    };

    const syncNotificationsLive = async () => {
      if ((typeof navigator !== 'undefined' && !navigator.onLine) || !(await hasSession())) {
        setNotificationsStatus((s) => (s === 'ready' ? s : 'failed'));
        return;
      }
      const fetchedNotifs = await fetchNotificationsSupabase(userId);
      if (!fetchedNotifs) {
        // A failed fetch keeps the list on screen; the panel says it couldn't refresh.
        setNotificationsStatus('failed');
        return;
      }
      setNotificationsStatus('ready');
      setState((prev) => {
        const merged = mergeFetchedNotifications(prev, fetchedNotifs);
        if (JSON.stringify(prev.notifications ?? []) === JSON.stringify(merged)) return prev;
        return { ...prev, notifications: merged };
      });
    };
    notificationsRefreshRef.current = syncNotificationsLive;

    const syncPartnerDataLive = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setNotificationsStatus((s) => (s === 'ready' ? s : 'failed'));
        setPartnersStatus('failed');
        return;
      }
      if (!(await hasSession())) {
        setNotificationsStatus((s) => (s === 'ready' ? s : 'failed'));
        setPartnersStatus((s) => (s === 'ready' ? s : 'failed'));
        return;
      }
      try {
        // Each fetch gives null when it failed: that part keeps what is on screen (N1).
        const fetchedInvites = await fetchPartnerInvitesSupabase(userId, username);
        const activePartnerships = await fetchPartnershipsSupabase(userId);
        const pIds = (activePartnerships ?? []).map((p) => p.id);
        const challenges = activePartnerships
          ? pIds.length > 0
            ? await fetchSharedChallengesSupabase(pIds)
            : []
          : null;
        const fetchedNotifs = await fetchNotificationsSupabase(userId);
        setNotificationsStatus(fetchedNotifs ? 'ready' : 'failed');
        setPartnersStatus(fetchedInvites && activePartnerships && challenges ? 'ready' : 'failed');

        if (activePartnerships && activePartnerships.length > 0) {
          // Clean up stale invites in Supabase DB for all active partnerships
          const tombstoneSet = new Set(state.deletedEntityIds || []);
          const seen = new Set<string>();
          for (const p of activePartnerships) {
            if (!p || tombstoneSet.has(p.id)) continue;
            const key = [(p.user1Username || '').toLowerCase(), (p.user2Username || '').toLowerCase()].sort().join(':::');
            if (seen.has(key)) continue;
            seen.add(key);
            cleanupPendingInvitesBetweenUsersSupabase(p.user1Id, p.user1Username, p.user2Id, p.user2Username).catch(() => {});
          }
        }

        setState((prev) => {
          const currentTombstones = new Set(prev.deletedEntityIds || []);

          // 1. Notifications
          const mergedNotifs = fetchedNotifs ? mergeFetchedNotifications(prev, fetchedNotifs) : prev.notifications;

          // 2. Partnerships (authoritative from DB, filtered by tombstones), or the ones on screen
          let finalPartnerships: Partnership[];
          if (activePartnerships) {
            const mergedPartnershipsMap = new Map<string, Partnership>();
            for (const p of activePartnerships) {
              if (!p || currentTombstones.has(p.id)) continue;
              const u1 = (p.user1Username || '').toLowerCase();
              const u2 = (p.user2Username || '').toLowerCase();
              const key = [u1, u2].sort().join(':::');
              if (!mergedPartnershipsMap.has(key)) {
                mergedPartnershipsMap.set(key, p);
              }
            }
            finalPartnerships = Array.from(mergedPartnershipsMap.values());
          } else {
            finalPartnerships = prev.partnerships || [];
          }
          const finalActivePartnershipIds = new Set(finalPartnerships.map((p) => p.id));

          // 3. Invites: pending ones with someone who is not already a partner
          let validInvites = prev.partnerInvites;
          if (fetchedInvites) {
            validInvites = fetchedInvites.filter((inv) => !currentTombstones.has(inv.id));
            if (finalPartnerships.length > 0) {
              const activePartnerUsernames = new Set(
                finalPartnerships.flatMap((p) => [p.user1Username.toLowerCase(), p.user2Username.toLowerCase()])
              );
              const activePartnerUserIds = new Set(finalPartnerships.flatMap((p) => [p.user1Id, p.user2Id]));
              validInvites = fetchedInvites.filter((inv) => {
                if (inv.status !== 'pending' || currentTombstones.has(inv.id)) return false;
                const otherUserId = inv.fromUserId === userId ? inv.toUserId : inv.fromUserId;
                const otherUsername = (
                  inv.fromUsername.toLowerCase() === username.toLowerCase() ? inv.toUsername : inv.fromUsername
                ).toLowerCase();
                const isAlreadyPartner =
                  (otherUserId && activePartnerUserIds.has(otherUserId)) ||
                  (otherUsername && activePartnerUsernames.has(otherUsername));
                return !isAlreadyPartner;
              });
            }
          }

          // 4. Shared challenges (authoritative from DB, merged lifecycle), or the ones on screen
          let finalSharedChallenges = prev.sharedChallenges || [];
          if (challenges) {
            const challengeMap = new Map<string, SharedChallenge>();
            for (const c of challenges) {
              if (!c || currentTombstones.has(c.id) || currentTombstones.has(c.partnershipId)) continue;
              if (!finalActivePartnershipIds.has(c.partnershipId)) continue;
              const existing = (prev.sharedChallenges || []).find((sc) => sc.id === c.id);
              const merged = existing ? mergeSharedChallenge(existing, c) : c;
              challengeMap.set(c.id, reconcileSharedChallengeLifecycle(merged));
            }
            finalSharedChallenges = Array.from(challengeMap.values());
          }

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
        // Background sync error: what is on screen stays; the Partners page offers Retry.
        setPartnersStatus('failed');
      }
    };
    partnersRefreshRef.current = syncPartnerDataLive;

    let pollInterval: any = null;
    // Set first in the cleanup: removeChannel reports CLOSED to the subscribe callback afterwards,
    // which must not start a poll that no cleanup would ever stop.
    let disposed = false;

    // No polling while the tab is hidden; a return to it catches up at once (handleVisibilityChange).
    const startFallbackPolling = () => {
      if (disposed) return;
      if (!pollInterval && (typeof navigator === 'undefined' || navigator.onLine) && !document.hidden) {
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
        // Only this account's notices; they need only the inbox refetch, not the partner queries.
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
          () => syncNotificationsLive()
        )
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
      // A first load still waiting when the connection drops would never finish.
      setPartnersStatus((s) => (s === 'loading' ? 'failed' : s));
      setNotificationsStatus((s) => (s === 'loading' ? 'failed' : s));
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopFallbackPolling();
      } else if (!isSubscribed && (typeof navigator === 'undefined' || navigator.onLine)) {
        startFallbackPolling();
        syncPartnerDataLive();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      stopFallbackPolling();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
      if (!currentState || !isSupabaseConfigured) return;
      const isUnconfirmed = (status?: string) => status === 'pending' || status === 'failed';
      (currentState.improvementPlans || [])
        .filter((p) => isUnconfirmed(p.syncStatus))
        .forEach((plan) => handlePlanSyncExecution(plan));
      (currentState.followedPlans || [])
        .filter((f) => isUnconfirmed(f.syncStatus))
        .forEach((follow) => handleFollowSyncExecution(follow));
    };

    const checkUpdates = (simulatedLeagueNow?: Date) => {
      const leagueTarget = simulatedLeagueNow || leagueNow();
      // Weekly goals and pacts run on the user's own days, never on league time.
      const personalNow = getNow();
      const challengesToSync: SharedChallenge[] = [];

      // A new week, month or season: other members' points for it (and final ones for the period
      // that just closed, which archiving waits for) need a fresh fetch.
      const fetchedPeriod = leagueRefresher.fetchedPeriodKey();
      if (fetchedPeriod && fetchedPeriod !== leaguePeriodKey(leagueTarget)) {
        void refreshLeagueStandings({ full: true });
      }

      setState((prev) => {
        challengesToSync.length = 0;
        // League archives and missed-habit, no-report and exercise-target penalties come from hourly server jobs.
        const weeklyGoalsReconciledState = reconcileWeeklyGoalsPointsForAllWeeks(
          reconcileLinkedWeeklyGoals(prev, personalNow),
          personalNow
        );

        const reconciledChallenges = (weeklyGoalsReconciledState.sharedChallenges || []).map((c) => {
          const updated = reconcileSharedChallengeLifecycle(c, personalNow);
          // A pact that ends here only shows as ended: the server stores the status once both
          // members' last day is over (hourly pact expiry), so a status change is never saved.
          if (updated.status === 'active' && updated.jointStreak !== c.jointStreak) {
            challengesToSync.push(updated);
          }
          return updated;
        });

        const next = { ...weeklyGoalsReconciledState, sharedChallenges: reconciledChallenges };
        // A tick that changed nothing keeps the same state, so nothing re-renders or saves. While
        // an immediate save waits (its own update changed nothing), the tick still runs the
        // autosave as before, which settles that wait.
        return pendingImmediateResolvers.current.length > 0 ? next : keepIfUnchanged(prev, next);
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
        reconcileLinkedWeeklyGoals(sanitizeLoadedState(newState, user), getNow()),
        getNow()
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
      points: presetHabitPoints({ isPreset: false, name, frequency }),
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

        // If target had a completion today, recalculate cap allocation for the remaining habits
        let targetHadTodayDone = false;
        if (target && target.frequency === 'daily' && presetHabitPoints(target) > 0) {
          if (Array.isArray(target.completions)) {
            targetHadTodayDone = target.completions.includes(today);
          } else if (target.completions && typeof target.completions === 'object') {
            const todayRecord = target.completions[today];
            if (todayRecord?.done) {
              targetHadTodayDone = true;
            }
          }
        }

        // Today's award leaves with the habit and the remaining habits share the freed cap.
        let updatedHabits = remainingHabits;
        if (targetHadTodayDone) {
          const awards = applyHabitAwardsInternal(runningState, remainingHabits, today);
          runningState = { ...runningState, ...awards.points };
          updatedHabits = awards.habits;
        }

        const linkedRemoval = removeLinkedWeeklyGoals(runningState.weeklyGoals, 'habit', [habitId], currentWeekKey);
        const updatedDeletedEntityIds = [...(runningState.deletedEntityIds || []), habitId, ...linkedRemoval.removedGoalIds].slice(-500);
        return {
          ...runningState,
          habits: updatedHabits,
          weeklyGoals: linkedRemoval.weeklyGoals,
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
          const linkedRemoval = removeLinkedWeeklyGoals(prev.weeklyGoals, 'habit', [existing.id], currentWeekKey);
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), existing.id, ...linkedRemoval.removedGoalIds].slice(-500);
          return {
            ...prev,
            habits: prev.habits.filter((h) => h.id !== existing.id),
            weeklyGoals: linkedRemoval.weeklyGoals,
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
                    [key]: { done: true, updatedAt: nowIso, pointsAwarded: h.frequency === 'daily' && presetHabitPoints(h) > 0 ? 0 : h.points },
                  },
                  updatedAt: nowIso,
                };
              }
            });

            let runningState = prev;

            // Daily habits that earn points (presets and custom) share the daily cap; weekly ones earn none.
            if (habit && habit.frequency === 'daily' && presetHabitPoints(habit) > 0) {
              const awards = applyHabitAwardsInternal(runningState, habits, todayKey());
              runningState = { ...runningState, ...awards.points };
              habits = awards.habits;
            }

            let updatedChallenges = prev.sharedChallenges;
            if (habit && prev.sharedChallenges.length > 0) {

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

            return reconcileLinkedWeeklyGoals({
              ...runningState,
              habits,
              sharedChallenges: updatedChallenges,
            });
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

  /** Rank-up memory (lib/rankCelebration), saved at once so a reload or another device never shows it again. */
  const setRankCelebrated = useCallback(
    (memory: RankCelebrated) => {
      setState((prev) => ({ ...prev, rankCelebrated: mergeRankCelebrated(prev.rankCelebrated, memory) }), { immediate: true });
    },
    [setState]
  );

  // Flips one on/off profile setting: the switch moves at once, and if the profile write fails
  // it moves back and says so, so a switch never shows a setting the server does not hold.
  const flipProfileSwitch = useCallback(
    async (key: ProfileSwitchKey, write: (userId: string, value: boolean) => Promise<void>) => {
      const current = get().currentUser;
      if (!current?.id) return;
      const nextSetting = !(current[key] ?? true);
      const apply = (value: boolean) =>
        setState(
          (prev) => ({
            ...prev,
            currentUser: prev.currentUser ? { ...prev.currentUser, [key]: value } : null,
          }),
          { immediate: true }
        );

      apply(nextSetting);
      try {
        await write(current.id, nextSetting);
      } catch (err) {
        apply(!nextSetting);
        dispatchToastError("Couldn't change this setting", toUserMessage(err, 'Check your connection and try again.'));
      }
    },
    // False positive: setState/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const toggleProfilePrivacy = useCallback(
    () => flipProfileSwitch('isProfilePublic', updateProfilePrivacy),
    [flipProfileSwitch]
  );

  const toggleAcceptPartnerInvites = useCallback(
    () => flipProfileSwitch('acceptPartnerInvites', updateProfileAcceptPartnerInvites),
    [flipProfileSwitch]
  );

  const toggleNotificationPreference = useCallback(
    (key: NotificationPreferenceKey) =>
      flipProfileSwitch(key, (userId, value) => updateProfileNotificationPreferences(userId, { [key]: value })),
    [flipProfileSwitch]
  );

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
      return reconcileLinkedWeeklyGoals({
        ...prev,
        workouts: awards.workouts,
        ...awards.points,
      });
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
            return reconcileLinkedWeeklyGoals({ ...prev, workouts: remainingWorkouts, deletedEntityIds: updatedDeletedEntityIds });
          }
          const awards = applyWorkoutAwardsInternal(prev, remainingWorkouts, today);
          return reconcileLinkedWeeklyGoals({
            ...prev,
            workouts: awards.workouts,
            deletedEntityIds: updatedDeletedEntityIds,
            ...awards.points,
          });
        },
        { immediate: true, actionLabel: 'Workout deletion', entityId: workoutId }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Removes workout logs dated before `beforeDate` (a local day key). Points already earned stay:
   * no earlier day's award is recomputed, here or on the server. Capped per call so the ids
   * fit in the tombstone list (deletedEntityIds keeps the last 500).
   */
  const clearWorkoutsBefore = useCallback((beforeDate: string) => {
    void (
      setState(
        (prev) => {
          const ids = prev.workouts
            .filter((w) => w.date < beforeDate && w.date !== todayKey())
            .slice(0, CLEAR_WORKOUTS_MAX)
            .map((w) => w.id);
          if (ids.length === 0) return prev;
          const cleared = new Set(ids);
          return {
            ...prev,
            workouts: prev.workouts.filter((w) => !cleared.has(w.id)),
            deletedEntityIds: [...(prev.deletedEntityIds || []), ...ids].slice(-500),
          };
        },
        { immediate: true, actionLabel: 'Clearing old workouts' }
      )
    );
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

      return reconcileLinkedWeeklyGoals({
        ...prev,
        libraryBooks: updatedLibraryBooks,
        books: [],
        readingLogs: updatedReadingLogs,
        habits: updatedHabits,
        deletedEntityIds: updatedDeletedEntityIds,
        ...awards.points,
      });
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
        const alreadyAwarded = readingBonusAlreadyGiven(targetUserBook, prev.pointsHistory || []);
        const pointsToAward =
          !alreadyAwarded &&
          meetsReadingBonusGates(completedBook, updatedReadingLogs, today) &&
          !readingBonusCooldown(targetUserBook.id, prev.pointsHistory || [], today).active
            ? READING_POINTS.completionBonus
            : 0;

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

        // The finish log is a reading day, so it ticks the linked Reading habit like logging pages does.
        let updatedHabits = prev.habits;
        const readingHabit = prev.habits.find((h) => h.linkedModule === 'reading');
        if (readingHabit && unreadDelta > 0) {
          const key = periodKey(readingHabit.frequency || 'daily');
          const completions = Array.isArray(readingHabit.completions)
            ? Object.fromEntries(readingHabit.completions.map((c) => [c, { done: true, updatedAt: readingHabit.updatedAt || now }]))
            : readingHabit.completions || {};
          if (completions[key]?.done !== true) {
            updatedHabits = prev.habits.map((h) =>
              h.id === readingHabit.id
                ? { ...h, completions: { ...completions, [key]: { done: true, updatedAt: now } }, updatedAt: now }
                : h
            );
          }
        }

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
                readingBonusId(targetUserBook.id)
              )
            : awards.points;

        return reconcileLinkedWeeklyGoals({
          ...prev,
          libraryBooks: updatedLibraryBooks,
          readingLogs: awards.readingLogs,
          habits: updatedHabits,
          books: [],
          ...points,
        });
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
        const linkedRemoval = removeLinkedWeeklyGoals(prev.weeklyGoals, 'reading', idsArray, currentWeekKey);
        const updatedDeletedEntityIds = [
          ...(prev.deletedEntityIds || []),
          ...idsArray,
          ...bookLogs.map((l) => l.id),
          ...habitExcisedIds,
          ...linkedRemoval.removedGoalIds,
        ].slice(-500);

        return {
          ...prev,
          books: [],
          libraryBooks: remainingBooks,
          readingLogs: updatedReadingLogs,
          habits: updatedHabits,
          weeklyGoals: linkedRemoval.weeklyGoals,
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
    targetFinishDate?: string,
    reflection?: string
  ) => {
    setState((prev) => {
      const now = trustedNow().toISOString();
      // A book added as already finished is read in full; no log is written, so it earns no points.
      const finished = status === 'completed';
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
        currentAmount: finished ? totalAmount : 0,
        currentPage: finished ? totalAmount : 0,
        unit,
        targetFinishDate: finished ? undefined : targetFinishDate?.trim() || undefined,
        reflection: finished ? reflection?.trim() || undefined : undefined,
        isFinished: finished,
        addedAt: now,
        updatedAt: now,
        dateStarted: status === 'reading' || finished ? now : undefined,
        startedAt: status === 'reading' || finished ? now : undefined,
        dateCompleted: finished ? now : undefined,
        completedAt: finished ? now : undefined,
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
              // A logged book keeps its unit (isBookUnitLocked; the server keeps it too).
              const unit = isBookUnitLocked(b, prev.readingLogs || []) ? b.unit : options?.unit ?? b.unit ?? 'pages';
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

  const updateBookDetails = useCallback(
    (
      bookId: string,
      details: {
        title: string;
        author: string;
        category?: BookCategory | string;
        description?: string;
        totalAmount: number;
        unit: 'pages' | 'chapters';
        targetFinishDate?: string;
        reflection?: string;
      }
    ) => {
      setState((prev) => {
        const now = trustedNow().toISOString();
        return {
          ...prev,
          libraryBooks: prev.libraryBooks.map((b) => {
            if (b.id !== bookId) return b;
            const current = b.currentAmount ?? b.currentPage ?? 0;
            const finished = b.status === 'completed';
            // The form keeps the length at or above the progress; a finished book stays read in full.
            const total = Math.max(1, Math.round(details.totalAmount), finished ? 0 : current);
            const nextCurrent = finished ? total : current;
            return {
              ...b,
              title: details.title.trim() || b.title,
              author: details.author.trim() || 'Unknown Author',
              category: details.category || undefined,
              description: details.description?.trim() || undefined,
              totalAmount: total,
              totalPages: total,
              currentAmount: nextCurrent,
              currentPage: nextCurrent,
              unit: isBookUnitLocked(b, prev.readingLogs || []) ? b.unit : details.unit,
              targetFinishDate: finished ? b.targetFinishDate : details.targetFinishDate?.trim() || undefined,
              reflection: finished ? details.reflection?.trim() || b.reflection : b.reflection,
              updatedAt: now,
            };
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
              // The last takeaway stays until the book is finished again.
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
      return reconcileLinkedWeeklyGoals({
        ...prev,
        skillLogs: awards.skillLogs,
        ...awards.points,
      });
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

          const linkedRemoval = removeLinkedWeeklyGoals(prev.weeklyGoals, 'skill', [skillId], currentWeekKey);
          const updatedDeletedEntityIds = [
            ...(prev.deletedEntityIds || []),
            skillId,
            ...skillLogsToRemove.map((l) => l.id),
            ...linkedRemoval.removedGoalIds,
          ].slice(-500);

          // Only today's award follows the sessions; earlier days' points stay (as on the server).
          const awards = applySkillAwardsInternal(prev, remainingSkillLogs, remainingSkills, todayKey());

          return {
            ...prev,
            skills: remainingSkills,
            skillLogs: awards.skillLogs,
            weeklyGoals: linkedRemoval.weeklyGoals,
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

        // Only today's award follows the sessions; an earlier day's points stay (as on the server),
        // and so do its practice minutes (clearedMinutes), so the skill's hours and level hold.
        const today = todayKey();
        if (target.date !== today) {
          const mins = typeof target.durationMinutes === 'number' && Number.isFinite(target.durationMinutes) ? target.durationMinutes : 0;
          return reconcileLinkedWeeklyGoals({
            ...prev,
            skills: mins > 0
              ? prev.skills.map((sk) => (sk.id === target.skillId ? { ...sk, clearedMinutes: (sk.clearedMinutes || 0) + mins } : sk))
              : prev.skills,
            skillLogs: remainingSkillLogs,
            deletedEntityIds: updatedDeletedEntityIds,
          });
        }
        const awards = applySkillAwardsInternal(prev, remainingSkillLogs, prev.skills, today);
        return reconcileLinkedWeeklyGoals({
          ...prev,
          skillLogs: awards.skillLogs,
          deletedEntityIds: updatedDeletedEntityIds,
          ...awards.points,
        });
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Removes practice logs dated before `beforeDate` (a local day key). Points already earned stay
   * (no earlier day is recomputed), and each skill keeps the cleared minutes in clearedMinutes so
   * its hours and level do not drop. Capped per call like clearWorkoutsBefore.
   */
  const clearSkillLogsBefore = useCallback((beforeDate: string) => {
    void (
      setState(
        (prev) => {
          const toClear = prev.skillLogs
            .filter((l) => l && l.date < beforeDate && l.date !== todayKey())
            .slice(0, CLEAR_SKILL_LOGS_MAX);
          if (toClear.length === 0) return prev;
          const cleared = new Set(toClear.map((l) => l.id));
          const minutesBySkill = new Map<string, number>();
          for (const l of toClear) {
            const mins = typeof l.durationMinutes === 'number' && Number.isFinite(l.durationMinutes) ? l.durationMinutes : 0;
            minutesBySkill.set(l.skillId, (minutesBySkill.get(l.skillId) || 0) + mins);
          }
          return {
            ...prev,
            skills: prev.skills.map((sk) =>
              minutesBySkill.get(sk.id) ? { ...sk, clearedMinutes: (sk.clearedMinutes || 0) + minutesBySkill.get(sk.id)! } : sk
            ),
            skillLogs: prev.skillLogs.filter((l) => !cleared.has(l.id)),
            deletedEntityIds: [...(prev.deletedEntityIds || []), ...cleared].slice(-500),
          };
        },
        { immediate: true, actionLabel: 'Clearing old practice logs' }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- MODULE 4: BAD HABIT REDUCTION TRACKER ACTIONS ---
  const addBadHabit = useCallback((name: string, isPreset = false) => {
    const bh: BadHabit = {
      id: uid(),
      name: name.trim(),
      isPreset,
      isCompleted: false,
      createdAt: trustedNow().toISOString(),
    };
    setState((prev) => {
      // A library bad habit is added once (a quick second tap on Add); the dialog checks names first.
      if (isPreset && prev.badHabits.some((b) => b && !b.isCompleted && sameName(b.name, bh.name))) return prev;
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

      // Same count as the server (habitPenalties.ts getBadHabitBadDaysBefore): 1 + bad days in a row.
      const consecutiveOccurrences =
        status === 'occurred'
          ? 1 + getBadHabitBadDaysBefore(prev.badHabitLogs, badHabitId, date, badHabitCreatedDay(bh.createdAt))
          : 0;

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
          const habitLogs = prev.badHabitLogs.filter((l) => l.badHabitId === badHabitId);
          const today = todayKey();
          const badHabits = prev.badHabits.filter((b) => b.id !== badHabitId);
          const logs = prev.badHabitLogs.filter((l) => l.badHabitId !== badHabitId);

          // Same as the server's bad_habits_award_points: only today's points of the habit go
          // (the day is recomputed without it); earlier points and penalties stay.
          const awards = applyBadHabitAwardsInternal(prev, badHabits, logs, today);

          const toTombstone = [...(prev.deletedEntityIds || []), badHabitId, ...habitLogs.map((l) => l.id).filter(Boolean)];
          return {
            ...prev,
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
    void setState(
      (prev) => {
        if (!prev.addictionTracker) return prev;
        // A relapse starts a new streak; the server takes back this season's points of the old one.
        const next = {
          ...prev,
          addictionTracker: { ...prev.addictionTracker, startDate: trustedNow().toISOString(), milestonesUnlocked: [] },
        };
        return { ...next, ...applyRecoveryAwardsInternal(next) };
      },
      {
        immediate: true,
        actionLabel: 'Sobriety streak reset',
        entityId: get().addictionTracker?.id || 'sobriety_tracker',
      }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get]);

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

  /** Removes up to CLEAR_CRAVING_LOGS_MAX craving logs from before `beforeDate` (local day key). No points ride on cravings. */
  const clearCravingLogsBefore = useCallback((beforeDate: string) => {
    void (
      setState(
        (prev) => {
          const toClear = prev.cravingLogs
            .filter((l) => {
              const at = new Date(l?.date || '');
              return !Number.isNaN(at.getTime()) && todayKey(at) < beforeDate;
            })
            .slice(0, CLEAR_CRAVING_LOGS_MAX);
          if (toClear.length === 0) return prev;
          const cleared = new Set(toClear.map((l) => l.id));
          return {
            ...prev,
            cravingLogs: prev.cravingLogs.filter((l) => !cleared.has(l.id)),
            deletedEntityIds: [...(prev.deletedEntityIds || []), ...cleared].slice(-500),
          };
        },
        { immediate: true, actionLabel: 'Clearing old craving logs' }
      )
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- MODULE 7: PREFRONTAL CORTEX ACTIONS ---
  /**
   * Logs a finished focus session and returns its id. `id` makes the log idempotent (a second call
   * with the same id, or one for a deleted log, changes nothing); `endedAtMs` dates it on the local
   * day it ended. The server awards only its own today, so only a session of today gets a preview.
   */
  const logFocusSession = useCallback(
    (
      taskName: string,
      durationMinutes: number,
      skillId?: string,
      reflection?: string,
      opts?: { id?: string; endedAtMs?: number }
    ): string => {
      const id = opts?.id || uid();
      const endedAt = opts?.endedAtMs !== undefined ? new Date(Math.min(opts.endedAtMs, trustedNowMs())) : trustedNow();
      const date = todayKey(endedAt);
      setState((prev) => {
        if (prev.focusLogs.some((f) => f.id === id) || (prev.deletedEntityIds || []).includes(id)) return prev;
        const focusLog: FocusSessionLog = {
          id,
          date,
          taskName: taskName.trim() || 'Deep Focus',
          skillId,
          durationMinutes,
          pointsAwarded: 0,
          reflection: reflection?.trim() || undefined,
          createdAt: endedAt.toISOString(),
        };
        if (date !== todayKey()) return { ...prev, focusLogs: [focusLog, ...prev.focusLogs] };
        // The server writes the day's award (applyFocusAwardsInternal shows the same row now).
        const awards = applyFocusAwardsInternal(prev, [focusLog, ...prev.focusLogs], date);
        return { ...prev, focusLogs: awards.focusLogs, ...awards.points };
      });
      return id;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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

      const updatedDoc: WeeklyGoal = withDeletedGoalIds({
        id: existingDoc ? existingDoc.id : uid(),
        weekKey: targetWeekKey,
        goals: existingDoc ? existingDoc.goals : [],
        reflections: updatedReflections,
        deletedGoalIds: existingDoc?.deletedGoalIds,
        createdAt: existingDoc ? existingDoc.createdAt : trustedNow().toISOString(),
      });

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

      const updatedDoc = withDeletedGoalIds({ ...doc, reflections: updatedReflections });
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

          const updatedDoc = withDeletedGoalIds({ ...doc, reflections: updatedReflections });
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
      const nowIso = trustedNow().toISOString();

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
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const updatedGoals = existingDoc ? [...existingDoc.goals, newItem] : [newItem];
      const updatedDoc: WeeklyGoal = withDeletedGoalIds({
        id: existingDoc ? existingDoc.id : uid(),
        weekKey: targetWeekKey,
        goals: updatedGoals,
        reflections: existingDoc?.reflections || [],
        deletedGoalIds: existingDoc?.deletedGoalIds,
        createdAt: existingDoc ? existingDoc.createdAt : nowIso,
      });

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
      // What the goal counts changed (link, item, Count or target): it can't count as achieved before now.
      const countEdited =
        (effectiveUpdates.linkedModule !== undefined && effectiveUpdates.linkedModule !== existingGoal.linkedModule) ||
        (effectiveUpdates.linkedItemId !== undefined && (effectiveUpdates.linkedItemId || '') !== (existingGoal.linkedItemId || '')) ||
        (effectiveUpdates.linkedMetricKey !== undefined && effectiveUpdates.linkedMetricKey !== existingGoal.linkedMetricKey) ||
        (effectiveUpdates.targetValue !== undefined && effectiveUpdates.targetValue !== existingGoal.targetValue);

      // No item ('' or missing) = any workout/book/skill.
      const isReLinked =
        (effectiveUpdates.linkedModule !== undefined && effectiveUpdates.linkedModule !== existingGoal.linkedModule) ||
        (effectiveUpdates.linkedItemId !== undefined && (effectiveUpdates.linkedItemId || '') !== (existingGoal.linkedItemId || '')) ||
        (effectiveUpdates.linkedMetricKey !== undefined && effectiveUpdates.linkedMetricKey !== existingGoal.linkedMetricKey);

      const isLinkedGoal = Boolean(targetLinkedModule && targetLinkedModule !== 'none');

      let nextCompleted = existingGoal.completed;
      let nextCompletedAt = existingGoal.completedAt;
      let nextManualProgress = existingGoal.manualProgress;

      let nextCompletedByLogId = existingGoal.completedByLogId;
      if (isReLinked) {
        // If re-linked, reset completion state so it can be cleanly re-evaluated
        nextCompleted = false;
        nextCompletedAt = undefined;
        nextCompletedByLogId = undefined;
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
        ...(effectiveUpdates.linkedItemId !== undefined ? { linkedItemId: effectiveUpdates.linkedItemId || undefined } : {}),
        completed: nextCompleted,
        done: nextCompleted,
        completedAt: nextCompletedAt,
        completedByLogId: isLinkedGoal && nextCompleted ? nextCompletedByLogId : undefined,
        manualProgress: isLinkedGoal ? 0 : nextManualProgress,
        updatedAt: trustedNow().toISOString(),
        ...(countEdited ? { linkEditedAt: trustedNow().toISOString() } : {}),
        title: effectiveUpdates.title !== undefined ? effectiveUpdates.title.trim() : existingGoal.title,
        targetDescription: effectiveUpdates.targetDescription !== undefined ? effectiveUpdates.targetDescription.trim() : existingGoal.targetDescription,
      };

      const updatedGoals = [...doc.goals];
      updatedGoals[goalIdx] = updatedGoal;

      const updatedDoc = withDeletedGoalIds({ ...doc, goals: updatedGoals });
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

          const updatedDoc = withDeletedGoalIds({ ...doc, goals: updatedGoals }, [goalId]);
          const newWeeklyGoals = [...prev.weeklyGoals];
          newWeeklyGoals[docIdx] = updatedDoc;

          // Deleting a carried-over goal settles its source (Zakria 2026-10-15): the source is
          // marked dismissed so it does not come back as an unresolved goal from an earlier week.
          if (deletedGoal?.carriedOverFromWeekKey && deletedGoal.carriedOverFromGoalId) {
            const sourceIdx = newWeeklyGoals.findIndex((w) => w.weekKey === deletedGoal.carriedOverFromWeekKey);
            const sourceDoc = sourceIdx >= 0 ? newWeeklyGoals[sourceIdx] : null;
            if (sourceDoc?.goals.some((g) => g.id === deletedGoal.carriedOverFromGoalId && !g.carryOverDismissed)) {
              const nowIso = trustedNow().toISOString();
              newWeeklyGoals[sourceIdx] = withDeletedGoalIds({
                ...sourceDoc,
                goals: sourceDoc.goals.map((g) =>
                  g.id === deletedGoal.carriedOverFromGoalId ? { ...g, carryOverDismissed: true, updatedAt: nowIso } : g
                ),
              });
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

      const nowIso = trustedNow().toISOString();
      // A goal whose habit, book or skill was deleted carries over as a goal the user updates
      // themselves, in the unit it counted.
      const deadLink = Boolean(targetGoal.linkedModule && targetGoal.linkedModule !== 'none') && !linkedItemExists(targetGoal, prev);
      const carriedItem: WeeklyGoalItem = {
        ...targetGoal,
        id: uid(),
        ...(deadLink
          ? { linkedModule: 'none', linkedItemId: undefined, linkedMetricKey: undefined, unit: linkedGoalUnit(targetGoal, prev) || 'times' }
          : {}),
        completed: false,
        done: false,
        completedAt: undefined,
        completedByLogId: undefined,
        linkEditedAt: undefined,
        manualProgress: options?.resumeProgress ? (targetGoal.manualProgress || 0) : 0,
        carriedOverFromWeekKey: sourceWeekKey,
        carriedOverFromGoalId: targetGoal.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const newGoals = targetDoc ? [...targetDoc.goals, carriedItem] : [carriedItem];
      const newDoc: WeeklyGoal = withDeletedGoalIds({
        id: targetDoc ? targetDoc.id : uid(),
        weekKey: targetWeekKey,
        goals: newGoals,
        reflections: targetDoc?.reflections || [],
        deletedGoalIds: targetDoc?.deletedGoalIds,
        createdAt: targetDoc ? targetDoc.createdAt : nowIso,
      });

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
        reconcileLinkedWeeklyGoals(prev, getNow()),
        getNow()
      )
    );
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
              // Moved to another goal: join the end of that goal's sequence, so it can't take
              // step 1 with its old order and lock the projects already there.
              const movedGoal = 'goalId' in updates && (updates.goalId || undefined) !== (p.goalId || undefined);
              const order =
                movedGoal && updates.goalId && updates.order === undefined
                  ? prev.projects.reduce((max, q) => (q.goalId === updates.goalId && q.id !== id ? Math.max(max, (q.order ?? 0) + 1) : max), 0)
                  : updates.order ?? p.order;
              return { ...p, ...updates, completedAt, order };
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

  // Automatic status (lib/projectProgress.ts): applied on every change to goals, projects or tasks,
  // whichever page, tab or device made it, so it never waits for the Projects page to open.
  // Waits for the server data, so a device cache or a failed read never flips a status.
  useEffect(() => {
    if (!isServerDataApplied) return;
    const pending = autoStatusChanges(state.goals, state.projects, state.tasks);
    if (pending.projects.size === 0 && pending.goals.size === 0) return;
    setState(
      (prev) => {
        const changes = autoStatusChanges(prev.goals, prev.projects, prev.tasks);
        if (changes.projects.size === 0 && changes.goals.size === 0) return prev;
        return {
          ...prev,
          projects: prev.projects.map((p) => {
            const status = changes.projects.get(p.id);
            return status ? { ...p, status, completedAt: resolveProjectCompletedAt(p.status, status, p.completedAt) } : p;
          }),
          goals: prev.goals.map((g) => {
            const status = changes.goals.get(g.id);
            return status ? { ...g, status } : g;
          }),
        };
      },
      { immediate: true }
    );
    // False positive: setState is stable; resolveProjectCompletedAt reads only its arguments and the clock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isServerDataApplied, state.goals, state.projects, state.tasks]);

  // --- SOCIAL FEATURE 1: PERSONAL IMPROVEMENT PLANS ACTIONS ---
  // Every change to a plan or a copy goes through these two: the row is marked pending, saved, and
  // marked synced or failed. Pending and failed rows are retried (retryUnconfirmedPlans) and win over
  // the table on the next load, so an edit made offline or during a failed save is never lost.
  const notifyPlanSaveFailed = (id: string, isCopy: boolean) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('app-toast-error', {
        detail: {
          title: isCopy ? "Couldn't save your copy" : "Couldn't save plan",
          message: "It's saved on this device and will retry automatically.",
          dedupKey: `plan_sync_failed_${id}`,
        },
      })
    );
  };

  const handlePlanSyncExecution = useCallback((planToSync: ImprovementPlan) => {
    const setStatus = (syncStatus: 'pending' | 'synced' | 'failed') =>
      setState((prev) => {
        if (!prev.improvementPlans.some((p) => p.id === planToSync.id)) return prev;
        return {
          ...prev,
          improvementPlans: prev.improvementPlans.map((p) => (p.id === planToSync.id ? { ...p, syncStatus } : p)),
        };
      });
    setStatus('pending');
    syncPlanToSupabase(planToSync)
      .then((res) => {
        setStatus(res ? 'synced' : 'failed');
        if (!res) notifyPlanSaveFailed(planToSync.id, false);
      })
      .catch(() => {
        setStatus('failed');
        notifyPlanSaveFailed(planToSync.id, false);
      });
    // False positive: setState is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFollowSyncExecution = useCallback((followToSync: UserPlanFollow) => {
    const setStatus = (syncStatus: 'pending' | 'synced' | 'failed') =>
      setState((prev) => {
        if (!prev.followedPlans.some((f) => f.id === followToSync.id)) return prev;
        return {
          ...prev,
          followedPlans: prev.followedPlans.map((f) => (f.id === followToSync.id ? { ...f, syncStatus } : f)),
        };
      });
    setStatus('pending');
    syncBroadcaster.broadcast('FOLLOW_UPDATED', followToSync);
    syncFollowedPlanToSupabase(followToSync)
      .then((ok) => {
        setStatus(ok ? 'synced' : 'failed');
        if (!ok) notifyPlanSaveFailed(followToSync.id, true);
      })
      .catch(() => {
        setStatus('failed');
        notifyPlanSaveFailed(followToSync.id, true);
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
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      handlePlanSyncExecution(updatedPlan);
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
      handlePlanSyncExecution(updatedPlan);
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

      // Once per period: today for a daily journey, this week for a weekly one.
      if (isPlanJourneyDoneThisPeriod(target.lastCompletedDate, target.cadence || 'daily')) {
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
        previousCompletedDate: target.lastCompletedDate || undefined,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;

      return { ...prev, improvementPlans: updatedPlans };
    });

    if (updatedPlan) {
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      handlePlanSyncExecution(updatedPlan);
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

      // Undo only the current period's completion.
      if (!isPlanJourneyDoneThisPeriod(target.lastCompletedDate, target.cadence || 'daily')) {
        return prev;
      }

      const currentStreak = target.streakCount || 0;
      const newStreak = Math.max(0, currentStreak - 1);

      // The completion before this one comes back, so the streak it carried survives tomorrow.
      updatedPlan = {
        ...target,
        streakCount: newStreak,
        lastCompletedDate: target.previousCompletedDate || undefined,
        previousCompletedDate: undefined,
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;

      return { ...prev, improvementPlans: updatedPlans };
    });

    if (updatedPlan) {
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      handlePlanSyncExecution(updatedPlan);
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
      handleFollowSyncExecution(updatedFollow);
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

      // Once per period: today for a daily journey, this week for a weekly one.
      if (isPlanJourneyDoneThisPeriod(target.lastCompletedDate, target.cadence || 'daily')) {
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
        previousCompletedDate: target.lastCompletedDate || undefined,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;

      return { ...prev, followedPlans: updatedFollows };
    });

    if (updatedFollow) {
      const follow = updatedFollow as UserPlanFollow;
      handleFollowSyncExecution(follow);
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

      // Undo only the current period's completion.
      if (!isPlanJourneyDoneThisPeriod(target.lastCompletedDate, target.cadence || 'daily')) {
        return prev;
      }

      const currentStreak = target.streakCount || 0;
      const newStreak = Math.max(0, currentStreak - 1);

      // The completion before this one comes back, so the streak it carried survives tomorrow.
      updatedFollow = {
        ...target,
        streakCount: newStreak,
        lastCompletedDate: target.previousCompletedDate || undefined,
        previousCompletedDate: undefined,
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;

      return { ...prev, followedPlans: updatedFollows };
    });

    if (updatedFollow) {
      handleFollowSyncExecution(updatedFollow);
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
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      handlePlanSyncExecution(updatedPlan);
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
      syncBroadcaster.broadcast('PLAN_UPDATED', p);
      handlePlanSyncExecution(p);
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
    stepEdits?: { id?: string; title: string }[],
    typeParams?: PlanStructureEdits
  ) => {
    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      updatedPlan = {
        ...target,
        ...editedPlanStructure(target, title, description, stepEdits, typeParams),
        category: category.trim() || 'Personal Growth',
        isPublic,
        creatorPoints: prev.totalPoints,
        syncStatus: 'pending',
      };

      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;

      return { ...prev, improvementPlans: updatedPlans };
    });

    if (updatedPlan) {
      const planToSync = updatedPlan as ImprovementPlan;
      syncBroadcaster.broadcast('PLAN_UPDATED', planToSync);
      handlePlanSyncExecution(planToSync);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The user's own copy is theirs to reshape: only this copy changes, never the original or other copies.
  // Its link to the original (originalPlanId, sourceUsername) and its progress stay as they are.
  const updateFollowedPlan = useCallback((
    followId: string,
    title: string,
    description: string,
    stepEdits?: { id?: string; title: string }[],
    typeParams?: PlanStructureEdits
  ) => {
    let updatedFollow: UserPlanFollow | null = null;
    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];

      updatedFollow = {
        ...target,
        ...editedPlanStructure(target, title, description, stepEdits, typeParams),
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;
      return { ...prev, followedPlans: updatedFollows };
    });

    if (updatedFollow) {
      handleFollowSyncExecution(updatedFollow);
    }
    // False positive: setState is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlanVisibility = useCallback(async (planId: string, newVisibility?: boolean) => {
    // Sharing changes go to the table first, so "Only me" is true the moment the switch shows it.
    // A plan whose first save hasn't landed yet (no row) changes here and goes out with its save.
    // Errors reach the caller, which shows the toast.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Log in and try again.');

    const local = stateRef.current?.improvementPlans.find((p) => p.id === planId);
    const isPublic = newVisibility ?? !local?.isPublic;

    const { data, error } = await supabase
      .from('improvement_plans')
      .update({ is_public: isPublic })
      .eq('id', planId)
      .eq('creator_id', session.user.id)
      .select('id');
    if (error) throw error;
    const reachedTable = Boolean(data && data.length > 0);
    const isUnconfirmed = local?.syncStatus === 'pending' || local?.syncStatus === 'failed';
    if (!reachedTable && !isUnconfirmed) throw new Error('Try again in a moment.');

    let updatedPlan: ImprovementPlan | null = null;
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      updatedPlan = { ...prev.improvementPlans[idx], isPublic };
      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updatedPlan;
      return { ...prev, improvementPlans: updatedPlans };
    });

    if (updatedPlan) {
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      // An older save still queued would carry the old setting; this one goes after it.
      if (!reachedTable || isUnconfirmed) handlePlanSyncExecution(updatedPlan);
    }
    // False positive: setState and stateRef are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      syncBroadcaster.broadcast('PLAN_UPDATED', { id: planId, copyCount: newCount });

      if (!planFound) return prev;
      return { ...prev, improvementPlans: updatedPlans };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyPublicPlan = useCallback(async (originalPlan: ImprovementPlan) => {
    // Resolves true once the copy is added; false when it is the user's own plan or already copied.
    // Throws when there is no session (the caller shows the one error toast).
    const planId = originalPlan.id;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Log in and try again.');

    const isOwnPlan = originalPlan.creatorId === session.user.id;
    const alreadyCopied = state.followedPlans.some((f) => f.originalPlanId === planId);
    if (isOwnPlan || alreadyCopied) return false;

    // Optimistic count; the trigger on user_plan_follows sets the real copy_count, which arrives by realtime.
    updatePlanCopyCount(planId, (originalPlan.copyCount || 0) + 1);

    const stepsCopy: PlanStep[] = (originalPlan.steps || []).map((s) => ({
      ...s,
      id: uid(),
      completed: false,
    }));

    const copyReviewCadence = originalPlan.reviewCadence || (originalPlan.planType === 'vision' ? 'weekly' : null);
    const createdFollow: UserPlanFollow = {
      id: generateUUID(),
      userId: session.user.id,
      originalPlanId: planId,
      sourceUsername: originalPlan.creatorUsername,
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
      // A deadline the creator already passed means nothing to the copier.
      targetDate: originalPlan.targetDate && originalPlan.targetDate >= todayKey() ? originalPlan.targetDate : undefined,
      cadence: originalPlan.cadence,
      duration: originalPlan.duration,
      startDate: trustedNow().toISOString(),
      streakCount: 0, // Reset streak for copier
      lastCompletedDate: undefined,
      targetReviewDate:
        originalPlan.targetReviewDate && originalPlan.targetReviewDate >= todayKey() ? originalPlan.targetReviewDate : undefined,
      reflectionNotes: [], // Reset reflections to empty for copier

      // The copier's first review is one cadence from now, never the creator's due date.
      reviewCadence: copyReviewCadence,
      nextReviewDueAt: copyReviewCadence
        ? new Date(trustedNowMs() + (copyReviewCadence === 'weekly' ? 7 : 30) * 24 * 60 * 60 * 1000).toISOString()
        : null,
    };

    setState((prev) => {
      return {
        ...prev,
        followedPlans: [createdFollow, ...prev.followedPlans],
      };
    });

    handleFollowSyncExecution(createdFollow);
    return true;
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatePlanCopyCount, state.followedPlans]);

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
      handleFollowSyncExecution(updatedFollow);
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
      handleFollowSyncExecution(updatedFollow);
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
      handleFollowSyncExecution(f);
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
      handleFollowSyncExecution(updatedFollow);
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
      handleFollowSyncExecution(updatedFollow);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteFollowedPlan = useCallback(async (followedPlanId: string) => {
    // Optimistic: the copy leaves at once and its tombstone is saved, so a failed table delete is
    // finished on the next load instead of the copy coming back.
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
    syncBroadcaster.broadcast('FOLLOW_DELETED', { followId: followedPlanId });
    const ok = await deleteFollowedPlanFromSupabase(followedPlanId);
    if (!ok) {
      dispatchToastError("Couldn't remove copy everywhere", "It's removed here and will finish the next time Ascend loads.");
    }
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
      syncBroadcaster.broadcast('PLAN_UPDATED', planToSync);
      handlePlanSyncExecution(planToSync);
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deletePlan = useCallback(async (planId: string) => {
    // The table delete comes first (the caller keeps its confirm dialog open and shows the error
    // if it fails). A plan that never reached the table deletes the same way.
    await deletePlanFromSupabase(planId);

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

      // Waiting invites hold a place, so accepting them all can never go over 5.
      const pendingSent = (state.partnerInvites || []).filter(
        (i) =>
          i.status === 'pending' &&
          (i.fromUserId === state.currentUser?.id || i.fromUsername?.toLowerCase() === state.username.toLowerCase())
      ).length;
      if ((state.partnerships || []).length + pendingSent >= 5) {
        throw new Error('You can have 5 partners, waiting invites included. Cancel an invite or remove a partner first.');
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

      const existingDbInvites = (await fetchPartnerInvitesSupabase(state.currentUser?.id || '', state.username)) ?? [];
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

      syncBroadcaster.broadcast('PARTNER_INVITE_SENT', { invite });

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

      // Never stand in made-up ids: the local partnership must carry the real user ids.
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!fromId || !toId || !uuidPattern.test(fromId) || !uuidPattern.test(toId)) {
        throw new Error("Couldn't accept this invite. Refresh and try again.");
      }

      const result = await acceptPartnerInviteAtomicSupabase(inviteId, fromId, fromUsername, toId, toUsername);

      if (!result.success) {
        setState((prev) => ({
          ...prev,
          partnerInvites: prev.partnerInvites.filter((i) => i.id !== inviteId),
        }));
        throw new Error(result.error || 'This invite is no longer available');
      }

      const partnership: Partnership = {
        id: result.partnershipId,
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
        markNotificationReadSupabase(staleNotif.id).catch(() => {});
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
      markNotificationReadSupabase(staleNotif.id).catch(() => {});
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
        throw new Error('Write what you will do every day.');
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
          `You already have a running challenge "${existingActive.title}" with this partner.`
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

  /** Marks these notices read at once; a failed save puts them back as unread with a toast (N7). */
  const markNotificationsRead = useCallback((notificationIds: string[]) => {
    const ids = new Set(notificationIds);
    const wereUnread = (get().notifications || []).filter((n) => ids.has(n.id) && !n.read).map((n) => n.id);
    if (wereUnread.length === 0) return;
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) => (ids.has(n.id) ? { ...n, read: true } : n)),
    }));
    const revert = (err: unknown) => {
      console.error('Failed to mark notifications read:', err);
      const back = new Set(wereUnread);
      setState((prev) => ({
        ...prev,
        notifications: (prev.notifications || []).map((n) => (back.has(n.id) ? { ...n, read: false } : n)),
      }));
      dispatchToastError("Couldn't mark as read", 'Check your connection and try again.');
    };
    Promise.all(wereUnread.map((id) => markNotificationReadSupabase(id))).catch(revert);
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markNotificationRead = useCallback(
    (notificationId: string) => markNotificationsRead([notificationId]),
    [markNotificationsRead]
  );

  const markAllNotificationsRead = useCallback(() => {
    const wereUnread = (get().notifications || []).filter((n) => !n.read).map((n) => n.id);
    if (wereUnread.length === 0) return;
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) => ({ ...n, read: true })),
    }));
    if (!state.currentUser?.id) return;
    markAllNotificationsReadSupabase(state.currentUser.id).catch((err) => {
      console.error('Failed to mark all notifications read:', err);
      const back = new Set(wereUnread);
      setState((prev) => ({
        ...prev,
        notifications: (prev.notifications || []).map((n) => (back.has(n.id) ? { ...n, read: false } : n)),
      }));
      dispatchToastError("Couldn't mark all as read", 'Check your connection and try again.');
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentUser?.id]);

  /** Removes these notices here and on the server; a failed delete puts them back with a toast. */
  const clearNotifications = useCallback((notificationIds: string[]) => {
    const ids = new Set(notificationIds);
    const cleared = (get().notifications || []).filter((n) => ids.has(n.id));
    if (cleared.length === 0) return;
    const clearedIds = cleared.map((n) => n.id);
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).filter((n) => !ids.has(n.id)),
      deletedEntityIds: [...(prev.deletedEntityIds || []), ...clearedIds].slice(-500),
    }));
    // The table row is the only record across devices, so a failed delete puts it back.
    const request = clearedIds.length === 1 ? clearNotificationSupabase(clearedIds[0]) : clearNotificationsSupabase(clearedIds);
    request.catch((err) => {
      console.error('Failed to clear notifications:', err);
      setState((prev) => {
        const present = new Set((prev.notifications || []).map((n) => n.id));
        const restored = [...cleared.filter((n) => !present.has(n.id)), ...(prev.notifications || [])].sort((x, y) =>
          y.createdAt.localeCompare(x.createdAt)
        );
        return {
          ...prev,
          notifications: restored,
          deletedEntityIds: (prev.deletedEntityIds || []).filter((id) => !ids.has(id)),
        };
      });
      dispatchToastError(clearedIds.length === 1 ? "Couldn't clear the notification" : "Couldn't clear notifications", 'Check your connection and try again.');
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearNotification = useCallback(
    (notificationId: string) => clearNotifications([notificationId]),
    [clearNotifications]
  );

  /** Clears every read notice in the inbox window. */
  const clearReadNotifications = useCallback(() => {
    clearNotifications((get().notifications || []).filter((n) => n.read).map((n) => n.id));
    // False positive: get is stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearNotifications]);

  /** Fetches the inbox again (the panel's Retry). */
  const refreshNotifications = useCallback(() => {
    setNotificationsStatus((s) => (s === 'ready' ? s : 'loading'));
    return notificationsRefreshRef.current?.() ?? Promise.resolve();
  }, []);

  /** Fetches partnerships, invites and challenges again (the Partners page's Retry). */
  const refreshPartners = useCallback(() => {
    setPartnersStatus('loading');
    return partnersRefreshRef.current?.() ?? Promise.resolve();
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
      const updatedAt = trustedNow().toISOString();
      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        // A built-in category edited for the first time is not in the saved list yet.
        const activities = ensureDefaultActivities(currentTT.activities || []);
        return {
          ...prev,
          timeTracker: {
            ...currentTT,
            activities: activities.map((a) => (a.id === id ? { ...a, ...updates, id: a.id, updatedAt } : a)),
          },
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Deletes a custom category. Its blocks on today and later days and in templates move to
   * `replacementId`; past days keep their blocks as they were (shown as a deleted category).
   */
  const deleteTimeTrackerActivity = useCallback(
    (id: string, replacementId: string) => {
      const known = ensureDefaultActivities(get().timeTracker?.activities || []);
      const target = known.find((a) => a.id === id);
      if (!target || target.isSystemDefault) throw new Error("Built-in categories can't be deleted.");
      if (replacementId === id || !known.some((a) => a.id === replacementId)) throw new Error('Choose a category to move them to.');

      const remap = (b: TimeTrackerBlock): TimeTrackerBlock => {
        const usesIt = b.activityId === id || (b.secondaryActivityIds || []).includes(id);
        if (!usesIt) return b;
        const primary = b.activityId === id ? replacementId : b.activityId;
        const secondary = Array.from(
          new Set((b.secondaryActivityIds || []).map((s) => (s === id ? replacementId : s)))
        ).filter((s) => s !== primary);
        return { ...b, activityId: primary, secondaryActivityIds: secondary.length > 0 ? secondary : undefined };
      };

      setState(
        (prev) => {
          const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const nowIso = trustedNow().toISOString();
          const today = todayKey();
          const changedDays: Record<string, TimeTrackerBlock[]> = {};
          for (const [dateKey, blocks] of Object.entries(currentTT.dailyLogs || {})) {
            if (dateKey < today) continue;
            const next = (blocks || []).map(remap);
            if (next.some((b, i) => b !== blocks[i])) changedDays[dateKey] = next;
          }
          const templates = (currentTT.templates || []).map((t) => {
            const blocks = (t.blocks || []).map(remap);
            return blocks.some((b, i) => b !== t.blocks[i]) ? { ...t, blocks, updatedAt: nowIso } : t;
          });
          const committed = commitTimeTrackerDays(currentTT, changedDays, nowIso);
          const todayBlocks = changedDays[today];
          return {
            ...prev,
            timeTracker: {
              ...committed,
              activities: (currentTT.activities || []).filter((a) => a.id !== id),
              templates,
            },
            deletedEntityIds: [...(prev.deletedEntityIds || []), id].slice(-500),
            ...(todayBlocks ? recomputeTimeTrackerDailyPointsForState(prev, today, committed.dailyLogs[today]) : {}),
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** Templates with `days` taken off every template but `keepId` (one template per weekday). */
  const withoutDaysElsewhere = (
    templates: TimeTrackerTemplate[],
    days: string[],
    keepId: string,
    updatedAt: string
  ): TimeTrackerTemplate[] => {
    if (days.length === 0) return templates;
    const taken = new Set(days.map((d) => d.toLowerCase()));
    return templates.map((t) => {
      if (t.id === keepId) return t;
      const current = templateDays(t);
      const next = current.filter((d) => !taken.has(d.toLowerCase()));
      return next.length === current.length ? t : { ...t, activeDays: next, autoApplyDays: next, updatedAt };
    });
  };

  const createTimeTrackerTemplate = useCallback(
    (template: Omit<TimeTrackerTemplate, 'id'>): TimeTrackerTemplate => {
      const targetDays = templateDays(template);
      const nowIso = trustedNow().toISOString();
      const newTemplate: TimeTrackerTemplate = {
        ...template,
        activeDays: targetDays,
        autoApplyDays: targetDays,
        id: uid(),
        createdAt: nowIso,
      };

      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        return {
          ...prev,
          timeTracker: {
            ...currentTT,
            templates: [...withoutDaysElsewhere(currentTT.templates || [], targetDays, newTemplate.id, nowIso), newTemplate],
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
      const nowIso = trustedNow().toISOString();
      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const target = (currentTT.templates || []).find((t) => t.id === id);
        if (!target) return prev;
        const daysGiven = updates.activeDays !== undefined || updates.autoApplyDays !== undefined;
        const nextDays = daysGiven ? templateDays({ activeDays: updates.activeDays || [], autoApplyDays: updates.autoApplyDays }) : templateDays(target);
        const updated: TimeTrackerTemplate = { ...target, ...updates, activeDays: nextDays, autoApplyDays: nextDays, id: target.id, updatedAt: nowIso };
        const templates = withoutDaysElsewhere(currentTT.templates || [], nextDays, id, nowIso).map((t) => (t.id === id ? updated : t));
        return { ...prev, timeTracker: { ...currentTT, templates } };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const toggleTemplateAutoApplyDay = useCallback(
    (templateId: string, day: string) => {
      const nowIso = trustedNow().toISOString();
      setState((prev) => {
        const currentTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const target = (currentTT.templates || []).find((t) => t.id === templateId);
        if (!target) return prev;
        const current = templateDays(target);
        const isRemoving = current.some((d) => d.toLowerCase() === day.toLowerCase());
        const nextDays = isRemoving
          ? current.filter((d) => d.toLowerCase() !== day.toLowerCase())
          : [...current, day];
        const updated: TimeTrackerTemplate = { ...target, activeDays: nextDays, autoApplyDays: nextDays, updatedAt: nowIso };
        const others = isRemoving ? currentTT.templates || [] : withoutDaysElsewhere(currentTT.templates || [], [day], templateId, nowIso);
        return {
          ...prev,
          timeTracker: { ...currentTT, templates: others.map((t) => (t.id === templateId ? updated : t)) },
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

  // Shows today's Time Tracker routine points at once (computeTimeTrackerAward), and yesterday's
  // until 02:00 (the grace window, as the server). The entry is never uploaded; the server's own row
  // replaces it on the next pull. Earlier days keep their points.
  const recomputeTimeTrackerDailyPointsForState = (
    baseState: AppState,
    targetDateKey: string,
    newBlocks: TimeTrackerBlock[]
  ): Partial<AppState> => {
    if (targetDateKey !== todayKey() && targetDateKey !== timeTrackerGraceDay(trustedNow())) {
      return {};
    }

    const entryId = timeTrackerAwardId(targetDateKey);
    const current = (baseState.pointsHistory || []).find((e) => e && e.id === entryId);
    const entry = computeTimeTrackerAward(newBlocks, targetDateKey, trustedNow().getTime(), current);
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

  /** "Overlaps 12:00 AM–6:00 AM." -> "The part after midnight overlaps 12:00 AM–6:00 AM tomorrow." */
  const tomorrowOverlapMessage = (message?: string) =>
    message?.startsWith('Overlaps ')
      ? `The part after midnight ${message.charAt(0).toLowerCase()}${message.slice(1, -1)} tomorrow.`
      : message || 'The part after midnight overlaps a block tomorrow.';

  /**
   * Adds a block. A block that runs past midnight is saved as two linked halves: start to 24:00 on
   * `dateKey` and 00:00 to the end on the next day, each checked against its own day. A day that
   * was never set up keeps the blocks its template shows, plus the new one.
   */
  const addDailyTimeBlock = useCallback(
    (dateKey: string, block: Omit<TimeTrackerBlock, 'id'>) => {
      if (dateKey < todayKey()) {
        throw new Error("Past days can't change.");
      }
      const currentTT = get().timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const parts = normalizeOrSplitMidnightBlock({
        activityId: block.activityId,
        ...(block.secondaryActivityIds?.length ? { secondaryActivityIds: block.secondaryActivityIds } : {}),
        ...(block.customTitle ? { customTitle: block.customTitle } : {}),
        ...(block.notes ? { notes: block.notes } : {}),
        startTime: block.startTime,
        endTime: block.endTime,
      }).map((p, i) => (i === 0 ? { ...p, id: uid(), createdAt: trustedNow().toISOString() } : p));

      const first = checkTimeCollision(parts[0], plannedBlocksForDate(currentTT, dateKey).blocks);
      if (first.hasCollision) throw new Error(first.message || 'This overlaps another block.');
      const nextDayKey = addDays(dateKey, 1);
      if (parts[1]) {
        const second = checkTimeCollision(parts[1], plannedBlocksForDate(currentTT, nextDayKey).blocks);
        if (second.hasCollision) throw new Error(tomorrowOverlapMessage(second.message));
      }

      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const days: Record<string, TimeTrackerBlock[]> = {
          [dateKey]: [...plannedBlocksForDate(prevTT, dateKey).blocks, parts[0]],
        };
        if (parts[1]) days[nextDayKey] = [...plannedBlocksForDate(prevTT, nextDayKey).blocks, parts[1]];
        const nextTT = commitTimeTrackerDays(prevTT, days, trustedNow().toISOString());
        return {
          ...prev,
          timeTracker: nextTT,
          ...recomputeTimeTrackerDailyPointsForState(prev, dateKey, nextTT.dailyLogs[dateKey]),
        };
      });

      return parts;
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Edits a block. Changing its times clears the trim/pull-forward bookkeeping (so un-completing it
   * later keeps the new times). For a half of a midnight block: a label/category change reaches the
   * other half too; new times that still run past midnight move the other half; new times that no
   * longer do unlink the two.
   */
  const updateDailyTimeBlock = useCallback(
    (dateKey: string, blockId: string, updates: Partial<TimeTrackerBlock>) => {
      if (dateKey < todayKey()) {
        throw new Error("Past days can't change.");
      }
      const currentTT = get().timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const dayBlocks = plannedBlocksForDate(currentTT, dateKey).blocks;
      const target = dayBlocks.find((b) => b.id === blockId);
      if (!target) {
        throw new Error('This block is no longer there.');
      }

      const partner = findSplitPartner(currentTT, dateKey, target);
      const span = describeBlockSpan(updates.startTime ?? target.startTime, updates.endTime ?? target.endTime);
      // A stored half never crosses midnight on its own, so new times that do always count as changed.
      const timesChanged = Boolean(span.second) ||
        span.first.startTime !== target.startTime ||
        span.first.endTime !== describeBlockSpan(target.startTime, target.endTime).first.endTime;

      let merged: TimeTrackerBlock = { ...target, ...updates, id: blockId };
      if (timesChanged) {
        merged = {
          ...merged,
          originalStartTime: undefined,
          originalEndTime: undefined,
          trimmedOriginalEndTime: undefined,
          pulledForwardTriggerId: undefined,
          trimmedDueToPullId: undefined,
        };
      }
      // The evening half keeps its pair when it still runs past midnight; any other new crossing
      // starts a pair of its own.
      const keepsPair = Boolean(span.second && partner && partner.dateKey > dateKey);
      const parts = normalizeOrSplitMidnightBlock(keepsPair ? merged : { ...merged, splitPairId: undefined });
      const first: TimeTrackerBlock = { ...parts[0], id: blockId };
      if (!parts[1]) {
        // Label or category only: the halves stay linked. New times: this block stands alone.
        if (!timesChanged && target.splitPairId) first.splitPairId = target.splitPairId;
        else delete first.splitPairId;
      }

      const collision = checkTimeCollision(first, dayBlocks, blockId);
      if (collision.hasCollision) throw new Error(collision.message || 'This overlaps another block.');

      const days: Record<string, TimeTrackerBlock[]> = {};
      const nextDayKey = addDays(dateKey, 1);
      const sharedFields = (b: TimeTrackerBlock): TimeTrackerBlock => ({
        ...b,
        activityId: first.activityId,
        secondaryActivityIds: first.secondaryActivityIds,
        customTitle: first.customTitle,
        notes: first.notes,
      });

      if (parts[1]) {
        const nextBlocks = plannedBlocksForDate(currentTT, nextDayKey).blocks;
        const second: TimeTrackerBlock = keepsPair && partner
          ? { ...sharedFields(partner.block), startTime: parts[1].startTime, endTime: parts[1].endTime, splitPairId: first.splitPairId }
          : parts[1];
        const secondCollision = checkTimeCollision(second, nextBlocks, second.id);
        if (secondCollision.hasCollision) throw new Error(tomorrowOverlapMessage(secondCollision.message));
        days[nextDayKey] = keepsPair
          ? nextBlocks.map((b) => (b.id === second.id ? second : b))
          : [...nextBlocks, second];
      }
      // The old other half: still linked (label change only), or now on its own.
      if (partner && !keepsPair && partner.dateKey >= todayKey()) {
        const others = days[partner.dateKey] ?? plannedBlocksForDate(currentTT, partner.dateKey).blocks;
        days[partner.dateKey] = others.map((b) => {
          if (b.id !== partner.block.id) return b;
          if (!timesChanged) return sharedFields(b);
          const { splitPairId: _unlinked, ...rest } = b;
          return rest;
        });
      }
      days[dateKey] = dayBlocks.map((b) => (b.id === blockId ? first : b));

      setState((prev) => {
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const nextTT = commitTimeTrackerDays(prevTT, days, trustedNow().toISOString());
        return {
          ...prev,
          timeTracker: nextTT,
          ...recomputeTimeTrackerDailyPointsForState(prev, todayKey(), nextTT.dailyLogs[todayKey()] || []),
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Deletes a block. `withPartner` also deletes the other half of a midnight block (when its day
   * can still change); otherwise that half stays on its own.
   */
  const deleteDailyTimeBlock = useCallback(
    (dateKey: string, blockId: string, options?: { withPartner?: boolean }) => {
      setState(
        (prev) => {
          const today = todayKey();
          if (dateKey < today) return prev;
          const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const dayBlocks = plannedBlocksForDate(prevTT, dateKey).blocks;
          const target = dayBlocks.find((b) => b.id === blockId);
          if (!target) return prev;
          const days: Record<string, TimeTrackerBlock[]> = { [dateKey]: dayBlocks.filter((b) => b.id !== blockId) };
          const partner = findSplitPartner(prevTT, dateKey, target);
          if (partner && partner.dateKey >= today) {
            const others = plannedBlocksForDate(prevTT, partner.dateKey).blocks;
            days[partner.dateKey] = options?.withPartner
              ? others.filter((b) => b.id !== partner.block.id)
              : others.map((b) => {
                  if (b.id !== partner.block.id) return b;
                  const { splitPairId: _unlinked, ...rest } = b;
                  return rest;
                });
          }
          const nextTT = commitTimeTrackerDays(prevTT, days, trustedNow().toISOString());
          return {
            ...prev,
            timeTracker: nextTT,
            ...(days[today] ? recomputeTimeTrackerDailyPointsForState(prev, today, nextTT.dailyLogs[today]) : {}),
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
        // Until 02:00, yesterday's last block can still be ticked or unticked (the grace window).
        const inGrace = dateKey === timeTrackerGraceDay(trustedNow());
        if (dateKey !== todayKey() && !inGrace) return prev;
        const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
        const prevDailyBlocks = prevTT.dailyLogs?.[dateKey] || [];
        const target = prevDailyBlocks.find((b) => b.id === blockId);
        if (!target) return prev;
        if (inGrace && (target.skipped || lastBlockOfDay(prevDailyBlocks)?.id !== blockId)) return prev;

        const isCurrentlyCompleted = target.completed;

        if (isCurrentlyCompleted) {
          // UN-COMPLETING: Use cascade reversion to restore this block and any blocks pulled forward because of it
          const updatedBlocks = revertBlockAndCascadingPulls(prevDailyBlocks, blockId);

          const pointsUpdate = recomputeTimeTrackerDailyPointsForState(prev, dateKey, updatedBlocks);

          return {
            ...prev,
            timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
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
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
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
            timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
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
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
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
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
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
            timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: sortedBlocks }, trustedNow().toISOString()),
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
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
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
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
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
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
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
          timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: updatedBlocks }, trustedNow().toISOString()),
        };
      });
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * What applying a template does to a date (pure, so the result is known before the state
   * changes). Merge keeps what the day holds and adds the template blocks that fit; Replace swaps
   * everything for fresh copies of the template's blocks.
   */
  const planTemplateApply = (
    tt: TimeTrackerState,
    dateKey: string,
    templateId: string,
    mode: 'merge' | 'replace'
  ): { blocks: TimeTrackerBlock[]; added: number; rejected: number } | null => {
    const template = (tt.templates || []).find((t) => t.id === templateId);
    if (!template) return null;
    const fresh = (b: TimeTrackerBlock): TimeTrackerBlock => ({
      id: uid(),
      createdAt: trustedNow().toISOString(),
      startTime: b.startTime,
      endTime: b.endTime,
      activityId: b.activityId,
      ...(b.secondaryActivityIds?.length ? { secondaryActivityIds: b.secondaryActivityIds } : {}),
      ...(b.customTitle ? { customTitle: b.customTitle } : {}),
      ...(b.notes ? { notes: b.notes } : {}),
    });
    if (mode === 'replace') {
      const blocks = (template.blocks || []).map(fresh);
      return { blocks, added: blocks.length, rejected: 0 };
    }
    const blocks = [...plannedBlocksForDate(tt, dateKey).blocks];
    let added = 0;
    let rejected = 0;
    for (const tBlock of template.blocks || []) {
      if (checkTimeCollision(tBlock, blocks).hasCollision) {
        rejected++;
      } else {
        blocks.push(fresh(tBlock));
        added++;
      }
    }
    return { blocks, added, rejected };
  };

  /**
   * Applies a template to today or a later date. The result is worked out from the current state
   * first, so the counts it returns are what happened; nothing changes when `applied` is false
   * (past date, template gone, or Merge with nothing that fits).
   */
  const applyTemplateToDate = useCallback(
    (
      dateKey: string,
      templateId: string,
      mode: 'merge' | 'replace' = 'merge'
    ): { applied: boolean; added: number; rejected: number; reason?: 'past' | 'missing' | 'overlap' } => {
      if (dateKey < todayKey()) return { applied: false, added: 0, rejected: 0, reason: 'past' };
      const plan = planTemplateApply(get().timeTracker || DEFAULT_TIME_TRACKER_STATE, dateKey, templateId, mode);
      if (!plan) return { applied: false, added: 0, rejected: 0, reason: 'missing' };
      if (mode === 'merge' && plan.added === 0) return { applied: false, added: 0, rejected: plan.rejected, reason: 'overlap' };

      setState(
        (prev) => {
          const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
          const again = planTemplateApply(prevTT, dateKey, templateId, mode);
          if (!again) return prev;
          const nextTT = commitTimeTrackerDays(prevTT, { [dateKey]: again.blocks }, trustedNow().toISOString());
          return {
            ...prev,
            timeTracker: { ...nextTT, clearedDates: (prevTT.clearedDates || []).filter((d) => d !== dateKey) },
            ...recomputeTimeTrackerDailyPointsForState(prev, dateKey, nextTT.dailyLogs[dateKey]),
          };
        },
        { immediate: true }
      );

      return { applied: true, added: plan.added, rejected: plan.rejected };
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
        // An empty saved day (not absent) keeps its template from filling it again.
        const nextTT = commitTimeTrackerDays(prevTT, { [dateKey]: [] }, trustedNow().toISOString());
        const cleared = prevTT.clearedDates || [];
        return {
          ...prev,
          timeTracker: { ...nextTT, clearedDates: cleared.includes(dateKey) ? cleared : [...cleared, dateKey] },
          ...recomputeTimeTrackerDailyPointsForState(prev, dateKey, []),
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Fills TODAY from its weekday's template when it was never set up (boot, the page, Deep Focus).
   * Other dates are never filled here: a later day shows its template as a preview until the user
   * changes it, and a past day stays as it was.
   */
  const hydrateTimeTrackerForDate = useCallback((dateKey: string) => {
    setState((prev) => {
      if (dateKey !== todayKey()) return prev;
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

  /** Saves a later day's template preview as that day's plan (the "Use it" button). */
  const keepTemplatePreview = useCallback((dateKey: string) => {
    setState((prev) => {
      if (dateKey < todayKey()) return prev;
      const prevTT = prev.timeTracker || DEFAULT_TIME_TRACKER_STATE;
      const planned = plannedBlocksForDate(prevTT, dateKey);
      if (planned.source !== 'template') return prev;
      return { ...prev, timeTracker: commitTimeTrackerDays(prevTT, { [dateKey]: planned.blocks }, trustedNow().toISOString()) };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    isAuthChecking,
    isSessionLoading,
    isServerDataApplied,
    setRankCelebrated,
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
    toggleNotificationPreference,
    getLeagueData,
    refreshLeagueStandings,
    getLeagueStandingsStatus,
    // New Module Actions
    logWorkout,
    deleteWorkout,
    clearWorkoutsBefore,
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
    clearSkillLogsBefore,
    addBadHabit,
    logBadHabitDay,
    undoTodayBadHabitLog,
    deleteBadHabit,
    updateBadHabit,
    setAddictionTracker,
    deleteAddictionTracker,
    resetAddictionStreak,
    checkAddictionMilestones,
    logCraving,
    deleteCravingLog,
    clearCravingLogsBefore,
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
    // Self Improvement Books Library Actions
    addCuratedBookToLibrary,
    addCustomBookToLibrary,
    updateUserBookStatus,
    updateBookDetails,
    restartBook,
    removeBookFromLibrary,
    getUserBookStatus,
    // Social Features Actions
    createImprovementPlan,
    updateImprovementPlan,
    updateFollowedPlan,
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
    markNotificationsRead,
    markAllNotificationsRead,
    clearNotification,
    clearNotifications,
    clearReadNotifications,
    refreshNotifications,
    notificationsStatus,
    refreshPartners,
    partnersStatus,
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
    keepTemplatePreview,
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
