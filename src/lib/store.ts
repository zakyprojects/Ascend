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
} from '@/types';
import { findCuratedBook } from './books';
import { uid, generateUUID, generateNumericUID, periodKey, todayKey, isTodayLocal, calculateActivePlanStreak, getWeekReflectionCutoff, previousPeriodKey, parseDate } from './dates';
import { reconcileSharedChallengeLifecycle, applyPledgeToggle, mergeSharedChallenge } from './pactLifecycle';
import { PresetHabit } from './presets';
import { SEED_ACCOUNTS } from './seedAccounts';
import {
  getLeaguePeriodStart,
  getLeaguePeriodLabel,
  calculatePeriodPoints,
  generateCompetitors,
  getUserRank,
  createArchive,
} from './leagues';
import {
  logoutUser,
  updateProfilePrivacy,
  updateProfileAcceptPartnerInvites,
  updateProfileNotificationPreferences,
  getAllPublicImprovementPlans,
  getRegisteredCompetitors,
  setCachedProfiles,
  setCachedPublicPlans,
  updateCachedPublicPlan,
  getCachedPublicPlanById,
  removeCachedPublicPlan,
  fetchProfileByUidFromSupabase,
} from './auth';
import { hydrateUserSession } from './authSession';
import {
  processHabitPenalties,
  processBadHabitNoReports,
  processExerciseTargetPenalties,
  processReadingTargetPenalties,
  processBookDeadlinePenalties,
  getMissPenaltyMultiplier,
  getHighestUserStreak,
} from './habitPenalties';
import { calculateUnifiedStreak } from './streakLogic';
import {
  supabase,
  isSupabaseConfigured,
  syncBroadcaster,
  syncPlanToSupabase,
  deletePlanFromSupabase,
  incrementPlanCopyCountSupabase,
  syncFollowedPlanToSupabase,
  deleteFollowedPlanFromSupabase,
  addReflectionNoteToSupabase,
  deleteReflectionNoteFromSupabase,
  sendPartnerInviteSupabase,
  fetchUserDataFromSupabase,
  fetchUserDataWithStatusFromSupabase,
  setUserDataWatermark,
  saveUserDataToSupabase,
  fetchAllProfilesFromSupabase,
  fetchProfileByUsernameFromSupabase,
  fetchPublicPlansFromSupabase,
  fetchPartnerInvitesSupabase,
  savePartnershipSupabase,
  fetchPartnershipSupabase,
  fetchPartnershipsSupabase,
  deletePartnershipSupabase,
  deletePartnerInviteSupabase,
  saveSharedChallengeSupabase,
  fetchSharedChallengesSupabase,
  deleteSharedChallengeSupabase,
  acceptPartnerInviteAtomicSupabase,
  cleanupPendingInvitesBetweenUsersSupabase,
  togglePartnerStatsVisibilitySupabase,
  fetchNotificationsSupabase,
  createNotificationSupabase,
  markNotificationReadSupabase,
  markAllNotificationsReadSupabase,
  clearNotificationSupabase,
} from './supabase';
import { mergeAppState } from './stateMerger';

// Cross-tab real-time state synchronization channel
export const STATE_SYNC_CHANNEL_NAME = 'ascend-state-sync';

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
      timestamp: Date.now(),
    };
    channel.postMessage(msg);
    channel.close();
  } catch (e) {
    /* ignore BroadcastChannel errors */
  }
}

function removeLinkedWeeklyGoals(
  weeklyGoals: WeeklyGoal[],
  linkedModule: 'habit' | 'skill' | 'reading',
  itemIds: (string | undefined)[]
): WeeklyGoal[] {
  const validIds = new Set(itemIds.filter((id): id is string => Boolean(id)));
  if (validIds.size === 0) return weeklyGoals;

  return weeklyGoals.map((w) => {
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

const GUEST_STORAGE_KEY = 'ascend_guest_state_v2';

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return sanitizeLoadedState(parsed, null);
  } catch {
    return DEFAULT_STATE;
  }
}

function sanitizeLoadedState(st: Partial<AppState>, profile: UserProfile | null): AppState {
  const pointsHistory = st.pointsHistory ?? [];
  const totalPoints = typeof st.totalPoints === 'number'
    ? Math.max(0, st.totalPoints)
    : (pointsHistory.length > 0
        ? Math.max(0, pointsHistory.reduce((acc, entry) => acc + (entry.amount || 0), 0))
        : 0);

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

  const baseState: AppState = {
    ...DEFAULT_STATE,
    ...st,
    currentUser: profile,
    username: profile ? profile.username : (st.username ?? 'Guest User'),
    habits: st.habits ?? [],
    journalEntries: st.journalEntries ?? [],
    totalPoints,
    pointsHistory,
    leagueArchives: st.leagueArchives ?? [],
    readLessonIds: st.readLessonIds ?? [],
    workouts: st.workouts ?? [],
    books: st.books ?? [],
    readingLogs: st.readingLogs ?? [],
    skills: st.skills ?? [],
    skillLogs: st.skillLogs ?? [],
    badHabits: (st.badHabits ?? []).map((bh) => ({
      ...bh,
      commitmentDays: bh.commitmentDays || 30,
      isCompleted: bh.isCompleted ?? false,
    })),
    badHabitLogs: sanitizedBadHabitLogs,
    addictionTracker: st.addictionTracker ?? null,
    cravingLogs: st.cravingLogs ?? [],
    focusLogs: st.focusLogs ?? [],
    decisionLogs: st.decisionLogs ?? [],
    emotionLogs: st.emotionLogs ?? [],
    weeklyGoals: (st.weeklyGoals ?? []).map((wg) => {
      let reflections: WeeklyGoalReflection[] = Array.isArray(wg.reflections) ? wg.reflections : [];
      if (reflections.length === 0 && wg.insights && wg.insights.trim()) {
        reflections = [
          {
            id: uid(),
            content: wg.insights.trim(),
            createdAt: wg.createdAt || new Date().toISOString(),
            pointsAwarded: Boolean(wg.isReviewed),
          },
        ];
      }
      return {
        ...wg,
        reflections,
        goals: (wg.goals ?? []).map((g: any) => ({
          id: g.id || uid(),
          title: g.title || g.text || 'Weekly Goal',
          targetDescription: g.targetDescription || '',
          priority: g.priority || 'medium',
          linkedModule: g.linkedModule || 'none',
          linkedItemId: g.linkedItemId || undefined,
          targetValue: typeof g.targetValue === 'number' ? g.targetValue : undefined,
          unit: g.unit || undefined,
          manualProgress: typeof g.manualProgress === 'number' ? g.manualProgress : undefined,
          completed: Boolean(g.completed ?? g.done),
          archived: Boolean(g.archived),
          carriedOverFromWeekKey: g.carriedOverFromWeekKey || undefined,
          createdAt: g.createdAt || new Date().toISOString(),
        })),
      };
    }),
    goals: st.goals ?? [],
    projects: st.projects ?? [],
    tasks: (st.tasks ?? []).map((t) => ({
      ...t,
      subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    })),
    libraryBooks: st.libraryBooks ?? [],
    improvementPlans: st.improvementPlans ?? [],
    followedPlans: st.followedPlans ?? [],
    partnerInvites: (st.partnerInvites ?? []).filter(
      (inv) => !(st.deletedEntityIds || []).includes(inv.id)
    ),
    partnership:
      st.partnership && (st.deletedEntityIds || []).includes(st.partnership.id)
        ? null
        : (st.partnership ?? null),
    partnerships: (st.partnerships ?? []).filter(
      (p) => !(st.deletedEntityIds || []).includes(p.id)
    ),
    sharedChallenges: (st.sharedChallenges ?? [])
      .filter(
        (c) => !(st.deletedEntityIds || []).includes(c.id) && !(st.deletedEntityIds || []).includes(c.partnershipId)
      )
      .map((c) => reconcileSharedChallengeLifecycle(c)),
    notifications: (st.notifications ?? [])
      .filter((n: any) => !n.createdAt || n.createdAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .filter((n: any) => !(st.deletedEntityIds || []).includes(n.id))
      .slice(0, 50),
    deletedEntityIds: (st.deletedEntityIds ?? []).slice(-500),
  };

  let sweptState = baseState;
  const now = new Date();
  const updatedWeeklyGoals = sweptState.weeklyGoals.map((wg) => {
    const cutoff = getWeekReflectionCutoff(wg.weekKey);
    if (now >= cutoff) {
      const { updatedReflections, nextState } = reconcileReflectionPoints(
        sweptState,
        wg.weekKey,
        wg.reflections || [],
        now
      );
      sweptState = nextState;
      return { ...wg, reflections: updatedReflections };
    }
    return wg;
  });
  sweptState = { ...sweptState, weeklyGoals: updatedWeeklyGoals };

  return processBadHabitNoReports(sweptState);
}

function persistState(state: AppState) {
  try {
    if (state.currentUser?.id) {
      saveUserDataToSupabase(state.currentUser.id, state);
      // Clean up local guest storage key once session is authenticated
      try {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    } else {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
    }
  } catch (e) {
    console.error('Failed to persist state', e);
  }
}

function addPointsInternal(
  prev: AppState,
  amount: number,
  reason: string,
  source: string,
  metadata?: Record<string, any>
): Pick<AppState, 'totalPoints' | 'pointsHistory'> {
  const newTotalPoints = Math.max(0, prev.totalPoints + amount);
  const actualAmount = newTotalPoints - prev.totalPoints;
  return {
    totalPoints: newTotalPoints,
    pointsHistory: [
      {
        id: uid(),
        amount: actualAmount,
        reason,
        source,
        timestamp: new Date().toISOString(),
        ...(metadata ? { metadata } : {}),
      },
      ...prev.pointsHistory,
    ].slice(0, 500),
  };
}

function reconcileReflectionPoints(
  prevState: AppState,
  weekKey: string,
  reflections: WeeklyGoalReflection[],
  now = new Date()
): {
  updatedReflections: WeeklyGoalReflection[];
  nextState: AppState;
} {
  const cutoff = getWeekReflectionCutoff(weekKey);
  let updatedReflections = [...reflections];
  let currentState = prevState;

  if (now < cutoff) {
    updatedReflections = updatedReflections.map((r) =>
      r.pointsAwarded ? { ...r, pointsAwarded: false } : r
    );
    return {
      updatedReflections,
      nextState: currentState,
    };
  }

  const previousHolder = (
    prevState.weeklyGoals.find((w) => w.weekKey === weekKey)?.reflections || []
  ).find((r) => r.pointsAwarded);

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

  if (latest && previousHolder?.id !== latest.id) {
    const latestId = latest.id;
    if (previousHolder) {
      const pointsDeduct = addPointsInternal(
        currentState,
        -20,
        `Weekly reflection points reassigned for ${weekKey}`,
        'weekly_review'
      );
      currentState = { ...currentState, ...pointsDeduct };
    }

    updatedReflections = updatedReflections.map((r) =>
      r.id === latestId ? { ...r, pointsAwarded: true } : { ...r, pointsAwarded: false }
    );

    const pointsAward = addPointsInternal(
      currentState,
      20,
      `Weekly reflection completed for ${weekKey}`,
      'weekly_review'
    );
    currentState = { ...currentState, ...pointsAward };
  } else if (!latest && previousHolder) {
    const pointsDeduct = addPointsInternal(
      currentState,
      -20,
      `Weekly reflection deleted for ${weekKey}`,
      'weekly_review'
    );
    currentState = { ...currentState, ...pointsDeduct };
  } else if (latest) {
    const latestId = latest.id;
    updatedReflections = updatedReflections.map((r) =>
      r.id === latestId ? { ...r, pointsAwarded: true } : { ...r, pointsAwarded: false }
    );
  }

  return {
    updatedReflections,
    nextState: currentState,
  };
}

export function useAppState() {
  const [state, setStateRaw] = useState<AppState>(loadInitialState);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const isHydrated = useRef(false);
  const currentUserRef = useRef<UserProfile | null>(state.currentUser);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const archiveTimer = useRef<number | null>(null);
  const pendingImmediateFlush = useRef(false);

  // Cross-tab synchronization tracking
  const tabId = useRef<string>(Math.random().toString(36).substring(2) + Date.now().toString(36)).current;
  const isRemoteBroadcastUpdate = useRef(false);

  useEffect(() => {
    currentUserRef.current = state.currentUser;
  }, [state.currentUser]);

  const setState = useCallback(
    (
      updater: AppState | ((prev: AppState) => AppState),
      options?: { immediate?: boolean }
    ) => {
      if (options?.immediate) {
        pendingImmediateFlush.current = true;
      }
      setStateRaw(updater);
    },
    []
  );

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
  const lastSyncTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isSyncing = false;
    const SYNC_THROTTLE_MS = 180000; // 3 minutes

    const handleReconnectAndSync = async (force = false) => {
      if (isSyncing) return;
      const now = Date.now();
      if (!force && now - lastSyncTimeRef.current < SYNC_THROTTLE_MS) {
        return;
      }

      const userId = currentUserRef.current?.id;
      if (!userId || !isHydrated.current || !isSupabaseConfigured) return;

      try {
        isSyncing = true;
        console.log('[SYNC] Network reconnected or tab visible, reconciling server state...');
        const serverRes = await fetchUserDataWithStatusFromSupabase(userId);
        if (serverRes.exists && serverRes.state) {
          lastSyncTimeRef.current = Date.now();
          setStateRaw((current) => {
            // Reconcile and union-merge server state with current state using mergeAppState
            // Tombstones (deletedEntityIds) prevent resurrecting deleted items while preserving offline progress
            const serverState = serverRes.state!;
            const merged = mergeAppState(serverState, current);
            setUserDataWatermark(userId, merged);
            return merged;
          });
        }
      } catch (e) {
        console.error('[SYNC] Error syncing state on reconnection/visibility:', e);
      } finally {
        isSyncing = false;
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
  }, []);

  useEffect(() => {
    if (isRemoteBroadcastUpdate.current) {
      // This state update was synced from another tab via BroadcastChannel.
      // Skip duplicate persistence and re-broadcast.
      isRemoteBroadcastUpdate.current = false;
      return;
    }

    if (isHydrated.current) {
      // Broadcast state to all other tabs immediately
      broadcastStateToTabs(state, tabId);

      if (pendingImmediateFlush.current) {
        pendingImmediateFlush.current = false;
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
          debounceTimer.current = null;
        }
        persistState(state);
      } else {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          persistState(state);
        }, 500);
      }
    }
  }, [state, tabId]);

  // Initial Supabase data load & auth listener (single source of truth for session state)
  useEffect(() => {
    let mounted = true;

    async function initSupabaseData() {
      if (!isSupabaseConfigured) {
        if (mounted) setIsAuthChecking(false);
        return;
      }

      try {
        const [profiles, publicPlans, sessionRes] = await Promise.all([
          fetchAllProfilesFromSupabase(),
          fetchPublicPlansFromSupabase(),
          supabase.auth.getSession(),
        ]);

        if (mounted) {
          setCachedProfiles(profiles);
          setCachedPublicPlans(publicPlans);
          if (!sessionRes.data?.session) {
            setIsAuthChecking(false);
          }
        }
      } catch (e) {
        console.error('Error loading Supabase data:', e);
        if (mounted) setIsAuthChecking(false);
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
          if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
            debounceTimer.current = null;
          }
          pendingImmediateFlush.current = false;
          isHydrated.current = false;
          currentUserRef.current = null;

          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem('ascend_active_focus_session');
              sessionStorage.removeItem('ascend_focus_tab_alive');
            } catch (e) {
              /* ignore */
            }
          }
          const guestRaw = localStorage.getItem(GUEST_STORAGE_KEY);
          let guestState = DEFAULT_STATE;
          if (guestRaw) {
            try {
              guestState = JSON.parse(guestRaw);
            } catch {
              /* use default */
            }
          }
          setState(sanitizeLoadedState(guestState, null));
          setIsAuthChecking(false);
          return;
        }

        if (
          (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') &&
          session?.user
        ) {
          if (isHydrated.current && currentUserRef.current?.id === session.user.id) {
            setIsAuthChecking(false);
            return;
          }

          const userId = session.user.id;
          const email = session.user.email || '';

          // Read signup defaults stored by signUpUser(), if this is a fresh signup
          let signupDefaults: { username: string; avatar: string; guestState?: AppState } | undefined;
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

            if (mounted) {
              isHydrated.current = true;
              const sanitizedState = sanitizeLoadedState(hydratedState, user);
              console.log('[STAGE 3: ZUSTAND STATE WRITE]', {
                username: user.username,
                totalPoints: sanitizedState.totalPoints,
                plansCount: sanitizedState.improvementPlans?.length,
                improvementPlans: (sanitizedState.improvementPlans || []).map((p) => ({
                  id: p.id,
                  title: p.title,
                  planType: p.planType,
                  streakCount: p.streakCount,
                  lastCompletedDate: p.lastCompletedDate,
                })),
              });
              setState(() => sanitizedState);
            }
          } catch (e) {
            console.error('Error hydrating auth session:', e);
            // If hydration fails or times out, attempt to restore from local cache first
            if (mounted) {
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
                createdAt: session.user.created_at || new Date().toISOString(),
                isProfilePublic: true,
              };

              // CRITICAL: isHydrated MUST remain false so no empty/fallback state is auto-saved over Supabase
              isHydrated.current = false;

              if (cachedState) {
                const sanitizedCached = sanitizeLoadedState(cachedState, fallbackUser);
                setState((current) => mergeAppState(sanitizedCached, current));
              } else {
                setState((prev) => {
                  if (prev.currentUser?.id === userId) return prev;
                  return {
                    ...prev,
                    currentUser: fallbackUser,
                    username: fallbackUser.username,
                  };
                });
              }
            }
          } finally {
            if (mounted) setIsAuthChecking(false);
          }
        } else {
          if (mounted) setIsAuthChecking(false);
        }
      }, 0);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Real-time synchronization listener for cross-tab / multi-user updates
  useEffect(() => {
    const unsubscribe = syncBroadcaster.subscribe((event, payload) => {
      setState((prev) => {
        if (event === 'PLAN_CREATED' || event === 'PLAN_UPDATED') {
          const exists = prev.improvementPlans.some((p) => p.id === payload.id);
          const updatedPlans = exists
            ? prev.improvementPlans.map((p) => (p.id === payload.id ? payload : p))
            : [payload, ...prev.improvementPlans];
          return { ...prev, improvementPlans: updatedPlans };
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
              createdAt: new Date().toISOString(),
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
          if (
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
          const exists = prev.sharedChallenges.some((c) => c.id === payload.id);
          if (exists) {
            return {
              ...prev,
              sharedChallenges: prev.sharedChallenges.map((c) => (c.id === payload.id ? mergeSharedChallenge(c, payload) : c)),
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
  }, []);

  // Smart Realtime Subscriptions with adaptive fallback polling
  useEffect(() => {
    if (!state.currentUser?.id) return;
    const userId = state.currentUser.id;
    const username = state.username;

    const syncPartnerDataLive = async () => {
      try {
        const fetchedInvites = await fetchPartnerInvitesSupabase(userId, username);
        const activePartnerships = await fetchPartnershipsSupabase(userId, username);
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
          const mergedNotifs = fetchedNotifs
            .filter((fn) => !(prev.deletedEntityIds || []).includes(fn.id))
            .map((fn) => {
              const local = prev.notifications?.find((n) => n.id === fn.id);
              return local && local.read ? { ...fn, read: true } : fn;
            });
          return {
            ...prev,
            partnerInvites: validInvites,
            partnerships: filteredPartnerships,
            partnership: filteredPartnerships[0] || null,
            sharedChallenges: challenges
              .filter(
                (c) => !(prev.deletedEntityIds || []).includes(c.id) && !(prev.deletedEntityIds || []).includes(c.partnershipId)
              )
              .map((c) => {
                const existing = prev.sharedChallenges?.find((prevC) => prevC.id === c.id);
                const merged = existing ? mergeSharedChallenge(existing, c) : c;
                return reconcileSharedChallengeLifecycle(merged);
              }),
            notifications: mergedNotifs,
          };
        });
      } catch (e) {
        /* ignore background sync error */
      }
    };

    let pollInterval: any = null;

    const startFallbackPolling = () => {
      if (!pollInterval) {
        pollInterval = setInterval(syncPartnerDataLive, 10000);
      }
    };

    const stopFallbackPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    let channel: any = null;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel(`social_realtime_${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'partner_invites' }, () => syncPartnerDataLive())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'partnerships' }, () => syncPartnerDataLive())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_challenges' }, () => syncPartnerDataLive())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => syncPartnerDataLive())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            stopFallbackPolling();
            syncPartnerDataLive();
          } else {
            startFallbackPolling();
          }
        });
    } else {
      startFallbackPolling();
    }

    return () => {
      stopFallbackPolling();
      if (channel) supabase.removeChannel(channel);
    };
  }, [state.currentUser?.id, state.username]);

  // Check for league period rollovers and missed-habit penalties on mount and every minute
  useEffect(() => {
    const checkUpdates = (simulatedNow?: Date) => {
      const targetNow = simulatedNow || new Date();
      setState((prev) => {
        const archivedState = checkAndArchiveLeagues(prev, targetNow);
        const habitPenalized = processHabitPenalties(archivedState, targetNow);
        const badHabitPenalized = processBadHabitNoReports(habitPenalized, targetNow);
        const exercisePenalized = processExerciseTargetPenalties(badHabitPenalized, targetNow);
        const readingPenalized = processReadingTargetPenalties(exercisePenalized, targetNow);
        const bookPenalized = processBookDeadlinePenalties(readingPenalized, targetNow);

        const reconciledChallenges = (bookPenalized.sharedChallenges || []).map((c) => {
          const updated = reconcileSharedChallengeLifecycle(c, targetNow);
          if (updated.status !== c.status || updated.jointStreak !== c.jointStreak) {
            saveSharedChallengeSupabase(updated);
            syncBroadcaster.broadcast('CHALLENGE_UPDATED', updated);
          }
          return updated;
        });

        return {
          ...bookPenalized,
          sharedChallenges: reconciledChallenges,
        };
      });
    };
    checkUpdates();
    archiveTimer.current = window.setInterval(() => checkUpdates(), 60000);

    (window as any).__triggerPenaltyCheck = (simulatedDateIso?: string) => {
      const simDate = simulatedDateIso ? new Date(simulatedDateIso) : new Date();
      console.log('Manually triggering penalty check for:', simDate.toISOString());
      checkUpdates(simDate);
    };

    (window as any).__advanceDays = (daysToAdvance: number = 1) => {
      const targetDate = new Date(Date.now() + daysToAdvance * 86400000);
      console.log(`Advancing simulated time by ${daysToAdvance} day(s) to:`, targetDate.toISOString());
      checkUpdates(targetDate);
    };

    return () => {
      if (archiveTimer.current) window.clearInterval(archiveTimer.current);
      delete (window as any).__triggerPenaltyCheck;
      delete (window as any).__advanceDays;
    };
  }, []);

  const setAuthSessionState = useCallback((user: UserProfile | null, newState: AppState) => {
    setState(sanitizeLoadedState(newState, user));
  }, []);

  const logout = useCallback(() => {
    logoutUser();
    // Revert to guest state
    const guestRaw = localStorage.getItem(GUEST_STORAGE_KEY);
    let guestState = DEFAULT_STATE;
    if (guestRaw) {
      try {
        guestState = JSON.parse(guestRaw);
      } catch {}
    }
    setState(sanitizeLoadedState(guestState, null));
  }, []);

  const addPoints = useCallback(
    (amount: number, reason: string, source: string, metadata?: Record<string, any>) => {
      setState((prev) => ({
        ...prev,
        ...addPointsInternal(prev, amount, reason, source, metadata),
      }));
    },
    []
  );

  const addPresetHabit = useCallback((preset: PresetHabit) => {
    const habit: Habit = {
      id: uid(),
      name: preset.name,
      frequency: preset.frequency,
      points: preset.points,
      isPreset: true,
      category: preset.category,
      createdAt: new Date().toISOString(),
      completions: [],
      createdAtPeriod: periodKey(preset.frequency),
      missedPeriods: [],
      consecutiveMisses: 0,
    };
    setState((prev) => ({ ...prev, habits: [...prev.habits, habit] }));
    return habit;
  }, []);

  const addCustomHabit = useCallback((name: string, frequency: Habit['frequency']) => {
    const habit: Habit = {
      id: uid(),
      name,
      frequency,
      points: 0, // Custom habits earn no points
      isPreset: false,
      createdAt: new Date().toISOString(),
      completions: [],
      createdAtPeriod: periodKey(frequency),
      missedPeriods: [],
      consecutiveMisses: 0,
    };
    setState((prev) => ({ ...prev, habits: [...prev.habits, habit] }));
    return habit;
  }, []);

  const deleteHabit = useCallback((habitId: string) => {
    setState(
      (prev) => {
        const target = prev.habits.find((h) => h.id === habitId);
        let pointsUpdate = { totalPoints: prev.totalPoints, pointsHistory: prev.pointsHistory };
        if (target && target.isPreset && target.points > 0 && target.completions && target.completions.length > 0) {
          const ptsToDeduct = target.completions.length * target.points;
          pointsUpdate = addPointsInternal(
            prev,
            -ptsToDeduct,
            `Habit deleted: ${target.name} (${target.completions.length} completion(s) removed)`,
            'habit'
          );
        }
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), habitId].slice(-500);
        return {
          ...prev,
          habits: prev.habits.filter((h) => h.id !== habitId),
          weeklyGoals: removeLinkedWeeklyGoals(prev.weeklyGoals, 'habit', [habitId]),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  const toggleHabit = useCallback(
    (habitId: string) => {
      let completed = false;
      setState((prev) => {
        const habits = prev.habits.map((h) => {
          if (h.id !== habitId) return h;
          const key = periodKey(h.frequency);
          const isDone = h.completions.includes(key);
          if (isDone) {
            completed = false;
            return { ...h, completions: h.completions.filter((c) => c !== key) };
          } else {
            completed = true;
            return {
              ...h,
              completions: [...h.completions, key],
              consecutiveMisses: 0, // Completion breaks the consecutive miss streak!
            };
          }
        });

        const habit = prev.habits.find((h) => h.id === habitId);
        let pointsUpdate: Pick<AppState, 'totalPoints' | 'pointsHistory'> = {
          totalPoints: prev.totalPoints,
          pointsHistory: prev.pointsHistory,
        };

        if (habit) {
          const habitMeta = {
            category: habit.category,
            habitId: habit.id,
            habitName: habit.name,
          };
          const pts = (habit.isPreset && habit.points > 0) ? habit.points : 0;
          if (completed) {
            pointsUpdate = addPointsInternal(
              prev,
              pts,
              `Habit completed: ${habit.name}`,
              'habit_completed',
              habitMeta
            );
          } else {
            pointsUpdate = addPointsInternal(
              prev,
              -pts,
              `Habit unchecked: ${habit.name}`,
              'habit_unchecked',
              habitMeta
            );
          }
        }

        let updatedChallenges = prev.sharedChallenges;
        if (habit && prev.sharedChallenges.length > 0) {
          const today = todayKey();

          updatedChallenges = prev.sharedChallenges.map((target) => {
            const challengePartnership =
              (prev.partnerships || []).find((p) => p.id === target.partnershipId) || prev.partnership;

            if (!challengePartnership) return target;

            const isUser1 =
              (prev.currentUser?.id && challengePartnership.user1Id === prev.currentUser.id) ||
              challengePartnership.user1Username.toLowerCase() === prev.username.toLowerCase();

            const myCategory = isUser1 ? (target.user1Category || 'habit') : (target.user2Category || 'habit');
            const myTarget = (isUser1 ? (target.user1Target || target.targetHabitName) : (target.user2Target || target.targetHabitName)).trim().toLowerCase();

            if (myCategory === 'habit' && myTarget === habit.name.trim().toLowerCase()) {
              const { updated } = applyPledgeToggle(target, isUser1, completed);
              saveSharedChallengeSupabase(updated);
              syncBroadcaster.broadcast('CHALLENGE_UPDATED', updated);
              return updated;
            }

            return target;
          });
        }

        return { ...prev, habits, sharedChallenges: updatedChallenges, ...pointsUpdate };
      });
      return completed;
    },
    []
  );

  const isHabitDone = useCallback((habit: Habit, date = new Date()): boolean => {
    return habit.completions.includes(periodKey(habit.frequency, date));
  }, []);

  const saveJournalEntry = useCallback(
    (mood: JournalEntry['mood'], content: string, existingId?: string) => {
      const date = todayKey();
      const trimmed = content.trim();
      const isQualifying = trimmed.length > 0;

      setState((prev) => {
        const existingIdx = prev.journalEntries.findIndex(
          (e) => (existingId && e.id === existingId) || e.date === date
        );

        const existing = existingIdx >= 0 ? prev.journalEntries[existingIdx] : null;
        const wasAwarded = existing ? existing.pointsAwarded : false;

        let pointsUpdate: Pick<AppState, 'totalPoints' | 'pointsHistory'> = {
          totalPoints: prev.totalPoints,
          pointsHistory: prev.pointsHistory,
        };

        let newPointsAwarded = wasAwarded;

        if (isQualifying && !wasAwarded) {
          // Award points for non-empty entry
          pointsUpdate = addPointsInternal(prev, 5, 'Journal entry completed', 'journal');
          newPointsAwarded = true;
        } else if (!isQualifying && wasAwarded) {
          // Deduct points when entry content is erased to empty
          pointsUpdate = addPointsInternal(prev, -5, 'Journal entry content removed', 'journal');
          newPointsAwarded = false;
        }

        if (existing) {
          const updated = [...prev.journalEntries];
          updated[existingIdx] = {
            ...existing,
            mood,
            content: trimmed,
            createdAt: new Date().toISOString(),
            pointsAwarded: newPointsAwarded,
          };
          return { ...prev, journalEntries: updated, ...pointsUpdate };
        }

        const newEntry: JournalEntry = {
          id: uid(),
          date,
          mood,
          content: trimmed,
          createdAt: new Date().toISOString(),
          pointsAwarded: newPointsAwarded,
        };
        return { ...prev, journalEntries: [newEntry, ...prev.journalEntries], ...pointsUpdate };
      });
    },
    []
  );

  const deleteJournalEntry = useCallback((entryId: string) => {
    setState(
      (prev) => {
        const entry = prev.journalEntries.find((e) => e.id === entryId);
        if (!entry) return prev;

        let pointsUpdate: Pick<AppState, 'totalPoints' | 'pointsHistory'> = {
          totalPoints: prev.totalPoints,
          pointsHistory: prev.pointsHistory,
        };

        if (entry.pointsAwarded) {
          pointsUpdate = addPointsInternal(prev, -5, 'Journal entry deleted', 'journal');
        }

        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), entryId].slice(-500);

        return {
          ...prev,
          journalEntries: prev.journalEntries.filter((e) => e.id !== entryId),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  const getTodayJournalEntry = useCallback((date = new Date()): JournalEntry | null => {
    const key = todayKey(date);
    return state.journalEntries.find((e) => e.date === key) ?? null;
  }, [state.journalEntries]);

  const markLessonRead = useCallback(
    (lessonId: string, lessonTitle: string, points: number) => {
      setState((prev) => {
        if (prev.readLessonIds.includes(lessonId)) return prev;
        const pointsUpdate = addPointsInternal(prev, points, `Lesson read: ${lessonTitle}`, 'lesson');
        return {
          ...prev,
          readLessonIds: [...prev.readLessonIds, lessonId],
          ...pointsUpdate,
        };
      });
    },
    []
  );

  const setUsername = useCallback((username: string) => {
    setState((prev) => ({
      ...prev,
      username,
      currentUser: prev.currentUser ? { ...prev.currentUser, username } : null,
    }));
  }, []);

  const updateProfileUsername = useCallback((newUsername: string, lastChangedAt?: string) => {
    setState((prev) => {
      if (!prev.currentUser) return prev;
      const updatedUser = {
        ...prev.currentUser,
        username: newUsername,
        lastUsernameChangeAt: lastChangedAt || new Date().toISOString(),
      };
      return {
        ...prev,
        currentUser: updatedUser,
        username: newUsername,
      };
    });
  }, []);

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
  }, []);

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
  }, [state.currentUser]);

  // --- MODULE 1: EXERCISE TRACKER ACTIONS ---
  const logWorkout = useCallback((type: string, durationMinutes: number) => {
    const date = todayKey();
    setState((prev) => {
      const pointsEarnedToday = prev.workouts
        .filter((w) => w.date === date)
        .reduce((sum, w) => sum + w.pointsAwarded, 0);

      const maxAllowed = Math.max(0, 60 - pointsEarnedToday);
      const pointsToAward = Math.min(durationMinutes, maxAllowed);

      const workout: WorkoutLog = {
        id: uid(),
        date,
        type: type.trim() || 'General Workout',
        durationMinutes,
        pointsAwarded: pointsToAward,
        createdAt: new Date().toISOString(),
      };

      let pointsUpdate = { totalPoints: prev.totalPoints, pointsHistory: prev.pointsHistory };
      if (pointsToAward > 0) {
        pointsUpdate = addPointsInternal(prev, pointsToAward, `Workout logged: ${workout.type} (${durationMinutes}m)`, 'exercise');
      }

      return {
        ...prev,
        workouts: [workout, ...prev.workouts],
        ...pointsUpdate,
      };
    });
  }, []);

  const deleteWorkout = useCallback((workoutId: string) => {
    setState(
      (prev) => {
        const target = prev.workouts.find((w) => w.id === workoutId);
        if (!target) return prev;
        let pointsUpdate = { totalPoints: prev.totalPoints, pointsHistory: prev.pointsHistory };
        if (target.pointsAwarded > 0) {
          pointsUpdate = addPointsInternal(prev, -target.pointsAwarded, `Workout deleted: ${target.type}`, 'exercise');
        }
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), workoutId].slice(-500);
        return {
          ...prev,
          workouts: prev.workouts.filter((w) => w.id !== workoutId),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  const setExerciseGoal = useCallback((targetWeeklySessions: number) => {
    setState((prev) => ({
      ...prev,
      exerciseGoal: targetWeeklySessions > 0 ? { targetWeeklySessions, consecutiveMisses: 0 } : null,
    }));
  }, []);

  // --- MODULE 2: READING TRACKER ACTIONS ---
  const addBook = useCallback(
    (title: string, author: string, totalPages: number, unit: 'pages' | 'chapters', targetFinishDate?: string) => {
      const book: Book = {
        id: uid(),
        title: title.trim(),
        author: author.trim() || 'Unknown Author',
        totalPages: Math.max(1, totalPages),
        unit,
        currentPage: 0,
        isFinished: false,
        targetFinishDate: targetFinishDate?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({ ...prev, books: [book, ...prev.books] }));
      return book;
    },
    []
  );

  const setReadingGoal = useCallback((goal: { cadence: 'daily' | 'weekly'; targetPages?: number } | null) => {
    setState((prev) => ({
      ...prev,
      readingGoal: goal ? { ...goal, consecutiveMisses: 0 } : null,
    }));
  }, []);

  const updateBookTargetDate = useCallback((bookId: string, targetFinishDate?: string) => {
    setState((prev) => ({
      ...prev,
      books: prev.books.map((b) => (b.id === bookId ? { ...b, targetFinishDate: targetFinishDate?.trim() || undefined } : b)),
    }));
  }, []);

  const updateReadingProgress = useCallback((bookId: string, progressAmount: number, newCurrentPage: number) => {
    const date = todayKey();
    setState((prev) => {
      const bookIdx = prev.books.findIndex((b) => b.id === bookId);
      if (bookIdx === -1) return prev;
      const target = prev.books[bookIdx];

      const alreadyLoggedToday = prev.readingLogs.some((l) => l.date === date && l.bookId === bookId);
      const pointsToAward = alreadyLoggedToday ? 0 : 5;

      const updatedBook: Book = {
        ...target,
        currentPage: Math.min(target.totalPages, Math.max(0, newCurrentPage)),
      };

      const readingLog: ReadingProgressLog = {
        id: uid(),
        bookId,
        date,
        progressAmount,
        pointsAwarded: pointsToAward,
        createdAt: new Date().toISOString(),
      };

      const updatedBooks = [...prev.books];
      updatedBooks[bookIdx] = updatedBook;

      let pointsUpdate = { totalPoints: prev.totalPoints, pointsHistory: prev.pointsHistory };
      if (pointsToAward > 0) {
        pointsUpdate = addPointsInternal(prev, pointsToAward, `Reading progress: ${target.title}`, 'reading');
      }

      return {
        ...prev,
        books: updatedBooks,
        readingLogs: [readingLog, ...prev.readingLogs],
        ...pointsUpdate,
      };
    });
  }, []);

  const finishBook = useCallback((bookId: string, reflection: string) => {
    setState((prev) => {
      const bookIdx = prev.books.findIndex((b) => b.id === bookId);
      if (bookIdx === -1) return prev;
      const target = prev.books[bookIdx];
      if (target.isFinished) return prev;

      const bonusPoints = 30;
      const updatedBook: Book = {
        ...target,
        currentPage: target.totalPages,
        isFinished: true,
        reflection: reflection.trim(),
        finishedAt: new Date().toISOString(),
      };

      const updatedBooks = [...prev.books];
      updatedBooks[bookIdx] = updatedBook;

      const pointsUpdate = addPointsInternal(prev, bonusPoints, `Book finished: ${target.title}`, 'reading_bonus');

      return {
        ...prev,
        books: updatedBooks,
        ...pointsUpdate,
      };
    });
  }, []);

  const deleteBook = useCallback((bookId: string) => {
    setState(
      (prev) => {
        const target = prev.books.find((b) => b.id === bookId);
        if (!target) return prev;

        const bookLogs = prev.readingLogs.filter((l) => l.bookId === bookId);
        const logPointsTotal = bookLogs.reduce((sum, l) => sum + (l.pointsAwarded || 0), 0);
        const finishPoints = target.isFinished ? 30 : 0;
        const totalBookPoints = logPointsTotal + finishPoints;

        let pointsUpdate = {};
        if (totalBookPoints > 0) {
          pointsUpdate = addPointsInternal(prev, -totalBookPoints, `Book deleted: ${target.title}`, 'reading');
        }

        const targetTitleLower = target.title.toLowerCase();
        const updatedDeletedEntityIds = [
          ...(prev.deletedEntityIds || []),
          bookId,
          ...bookLogs.map((l) => l.id),
        ].slice(-500);

        return {
          ...prev,
          books: prev.books.filter((b) => b.id !== bookId),
          readingLogs: prev.readingLogs.filter((l) => l.bookId !== bookId),
          libraryBooks: prev.libraryBooks.filter(
            (lb) => lb.linkedBookId !== bookId && lb.title.toLowerCase() !== targetTitleLower
          ),
          weeklyGoals: removeLinkedWeeklyGoals(prev.weeklyGoals, 'reading', [bookId]),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  // --- SELF IMPROVEMENT BOOKS LIBRARY ACTIONS ---
  const addCuratedBookToLibrary = useCallback(
    (curatedBook: CuratedBook, initialStatus: UserBookStatus = 'to-read') => {
      setState((prev) => {
        const alreadyExists = prev.libraryBooks.some((lb) => lb.curatedBookId === curatedBook.id);
        if (alreadyExists) return prev;

        const now = new Date().toISOString();
        const userBook: UserBook = {
          id: uid(),
          curatedBookId: curatedBook.id,
          title: curatedBook.title,
          author: curatedBook.author,
          description: curatedBook.description,
          category: curatedBook.category,
          coverImageUrl: curatedBook.coverImageUrl,
          isCustom: false,
          status: initialStatus,
          addedAt: now,
          startedAt: initialStatus === 'reading' || initialStatus === 'completed' ? now : undefined,
          completedAt: initialStatus === 'completed' ? now : undefined,
          pointsAwarded: 0,
        };

        let newState: AppState = { ...prev, libraryBooks: [userBook, ...prev.libraryBooks] };

        if (initialStatus === 'reading' || initialStatus === 'completed') {
          const existingInTracker = prev.books.some((b) => b.title === curatedBook.title);
          if (!existingInTracker) {
            const trackerBook: Book = {
              id: uid(),
              title: curatedBook.title,
              author: curatedBook.author,
              totalPages: 250,
              unit: 'pages',
              currentPage: 0,
              isFinished: initialStatus === 'completed',
              finishedAt: initialStatus === 'completed' ? now : undefined,
              createdAt: now,
            };
            newState = { ...newState, books: [trackerBook, ...newState.books] };
            userBook.linkedBookId = trackerBook.id;

            if (initialStatus === 'completed') {
              const pointsUpdate = addPointsInternal(
                newState,
                curatedBook.pointsOnCompletion,
                `Curated book completed: ${curatedBook.title}`,
                'library_book_bonus'
              );
              newState = { ...newState, ...pointsUpdate };
              userBook.pointsAwarded = curatedBook.pointsOnCompletion;
            }
          }
        }

        return newState;
      });
    },
    []
  );

  const addCustomBookToLibrary = useCallback(
    (title: string, author: string, description?: string, category?: BookCategory) => {
      setState((prev) => {
        const now = new Date().toISOString();
        const userBook: UserBook = {
          id: uid(),
          title: title.trim(),
          author: author.trim() || 'Unknown Author',
          description: description?.trim(),
          category,
          isCustom: true,
          status: 'to-read',
          addedAt: now,
          pointsAwarded: 0,
        };
        return { ...prev, libraryBooks: [userBook, ...prev.libraryBooks] };
      });
    },
    []
  );

  const updateUserBookStatus = useCallback((userBookId: string, newStatus: UserBookStatus) => {
    setState((prev) => {
      const idx = prev.libraryBooks.findIndex((lb) => lb.id === userBookId);
      if (idx === -1) return prev;
      const target = prev.libraryBooks[idx];
      if (target.status === newStatus) return prev;

      const now = new Date().toISOString();
      let updated: UserBook = {
        ...target,
        status: newStatus,
        startedAt: newStatus === 'reading' || newStatus === 'completed' ? target.startedAt ?? now : target.startedAt,
        completedAt: newStatus === 'completed' ? now : undefined,
      };

      let newState: AppState = { ...prev };

      if (newStatus === 'reading' && !target.linkedBookId) {
        const existingInTracker = prev.books.some((b) => b.title === target.title);
        if (!existingInTracker) {
          const trackerBook: Book = {
            id: uid(),
            title: target.title,
            author: target.author,
            totalPages: 250,
            unit: 'pages',
            currentPage: 0,
            isFinished: false,
            createdAt: now,
          };
          newState = { ...newState, books: [trackerBook, ...newState.books] };
          updated = { ...updated, linkedBookId: trackerBook.id };
        }
      }

      if (newStatus === 'completed' && target.status !== 'completed') {
        if (target.linkedBookId) {
          const trackerIdx = newState.books.findIndex((b) => b.id === target.linkedBookId);
          if (trackerIdx !== -1) {
            const trackerBooks = [...newState.books];
            trackerBooks[trackerIdx] = {
              ...trackerBooks[trackerIdx],
              currentPage: trackerBooks[trackerIdx].totalPages,
              isFinished: true,
              finishedAt: now,
            };
            newState = { ...newState, books: trackerBooks };
          }
        } else {
          const existingInTracker = prev.books.some((b) => b.title === target.title);
          if (!existingInTracker) {
            const trackerBook: Book = {
              id: uid(),
              title: target.title,
              author: target.author,
              totalPages: 250,
              unit: 'pages',
              currentPage: 250,
              isFinished: true,
              finishedAt: now,
              createdAt: now,
            };
            newState = { ...newState, books: [trackerBook, ...newState.books] };
            updated = { ...updated, linkedBookId: trackerBook.id };
          }
        }

        if (!target.isCustom && target.curatedBookId) {
          const curated = findCuratedBook(target.curatedBookId);
          if (curated && target.pointsAwarded === 0) {
            const pointsUpdate = addPointsInternal(
              newState,
              curated.pointsOnCompletion,
              `Curated book completed: ${curated.title}`,
              'library_book_bonus'
            );
            newState = { ...newState, ...pointsUpdate };
            updated = { ...updated, pointsAwarded: curated.pointsOnCompletion };
          }
        }
      }

      if (newStatus !== 'completed' && target.status === 'completed' && target.pointsAwarded > 0) {
        const pointsUpdate = addPointsInternal(
          newState,
          -target.pointsAwarded,
          `Book completion reverted: ${target.title}`,
          'library_book_bonus'
        );
        newState = { ...newState, ...pointsUpdate };
        updated = { ...updated, pointsAwarded: 0, completedAt: undefined };

        if (updated.linkedBookId) {
          const trackerIdx = newState.books.findIndex((b) => b.id === updated.linkedBookId);
          if (trackerIdx !== -1) {
            const trackerBooks = [...newState.books];
            trackerBooks[trackerIdx] = {
              ...trackerBooks[trackerIdx],
              isFinished: false,
              finishedAt: undefined,
              currentPage: Math.min(trackerBooks[trackerIdx].currentPage, Math.floor(trackerBooks[trackerIdx].totalPages * 0.8)),
            };
            newState = { ...newState, books: trackerBooks };
          }
        }
      }

      const updatedLibrary = [...newState.libraryBooks];
      updatedLibrary[idx] = updated;
      return { ...newState, libraryBooks: updatedLibrary };
    });
  }, []);

  const removeBookFromLibrary = useCallback((userBookId: string) => {
    setState(
      (prev) => {
        const target = prev.libraryBooks.find((lb) => lb.id === userBookId);
        if (!target) return prev;

        const linkedBookId = target.linkedBookId;
        const targetTitleLower = target.title.toLowerCase();

        // Calculate points awarded across associated reading logs being removed
        const associatedLogs = prev.readingLogs.filter((l) =>
          linkedBookId ? l.bookId === linkedBookId || l.bookId === userBookId : l.bookId === userBookId
        );
        const logPointsToDeduct = associatedLogs.reduce((sum, l) => sum + (l.pointsAwarded || 0), 0);

        let pointsUpdate: Pick<AppState, 'totalPoints' | 'pointsHistory'> = {
          totalPoints: prev.totalPoints,
          pointsHistory: prev.pointsHistory,
        };
        const totalDeduction = (target.pointsAwarded || 0) + logPointsToDeduct;
        if (totalDeduction > 0) {
          pointsUpdate = addPointsInternal(
            prev,
            -totalDeduction,
            `Book removed from library: ${target.title}`,
            'library_book_bonus'
          );
        }

        const matchingBookIds = prev.books
          .filter((b) => (linkedBookId ? b.id === linkedBookId : b.title.toLowerCase() === targetTitleLower))
          .map((b) => b.id);
        const idsToRemove = [userBookId, linkedBookId, ...matchingBookIds].filter(Boolean) as string[];
        const updatedDeletedEntityIds = [
          ...(prev.deletedEntityIds || []),
          ...idsToRemove,
          ...associatedLogs.map((l) => l.id),
        ].slice(-500);

        return {
          ...prev,
          libraryBooks: prev.libraryBooks.filter((lb) => lb.id !== userBookId),
          books: prev.books.filter(
            (b) => (linkedBookId ? b.id !== linkedBookId : b.title.toLowerCase() !== targetTitleLower)
          ),
          readingLogs: prev.readingLogs.filter((l) =>
            linkedBookId ? l.bookId !== linkedBookId && l.bookId !== userBookId : l.bookId !== userBookId
          ),
          weeklyGoals: removeLinkedWeeklyGoals(prev.weeklyGoals, 'reading', idsToRemove),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

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
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, skills: [...prev.skills, skill] }));
    return skill;
  }, []);

  const logSkillPractice = useCallback((skillId: string, durationMinutes: number, note: string) => {
    const date = todayKey();
    setState((prev) => {
      const targetSkill = prev.skills.find((s) => s.id === skillId);
      if (!targetSkill) return prev;

      const pointsEarnedToday = prev.skillLogs
        .filter((l) => l.date === date)
        .reduce((sum, l) => sum + l.pointsAwarded, 0);

      const maxAllowed = Math.max(0, 60 - pointsEarnedToday);
      const pointsToAward = Math.min(durationMinutes, maxAllowed);

      const session: SkillSessionLog = {
        id: uid(),
        skillId,
        date,
        durationMinutes,
        note: note.trim(),
        pointsAwarded: pointsToAward,
        createdAt: new Date().toISOString(),
      };

      let pointsUpdate = { totalPoints: prev.totalPoints, pointsHistory: prev.pointsHistory };
      if (pointsToAward > 0) {
        pointsUpdate = addPointsInternal(prev, pointsToAward, `Skill practiced: ${targetSkill.name} (${durationMinutes}m)`, 'skill');
      }

      return {
        ...prev,
        skillLogs: [session, ...prev.skillLogs],
        ...pointsUpdate,
      };
    });
  }, []);

  const updateSkillLevel = useCallback((skillId: string, manualLevel: SkillLevel) => {
    setState((prev) => ({
      ...prev,
      skills: prev.skills.map((s) => (s.id === skillId ? { ...s, manualLevel } : s)),
    }));
  }, []);

  const deleteSkill = useCallback((skillId: string) => {
    setState(
      (prev) => {
        const skillLogs = prev.skillLogs.filter((l) => l.skillId === skillId);
        const totalPointsToDeduct = skillLogs.reduce((sum, l) => sum + (l.pointsAwarded || 0), 0);

        let pointsUpdate = {};
        if (totalPointsToDeduct > 0) {
          const targetSkill = prev.skills.find((s) => s.id === skillId);
          const skillName = targetSkill ? targetSkill.name : 'Skill';
          pointsUpdate = addPointsInternal(
            prev,
            -totalPointsToDeduct,
            `Skill deleted (${skillLogs.length} session log(s) removed): ${skillName}`,
            'skill'
          );
        }

        const updatedDeletedEntityIds = [
          ...(prev.deletedEntityIds || []),
          skillId,
          ...skillLogs.map((l) => l.id),
        ].slice(-500);

        return {
          ...prev,
          skills: prev.skills.filter((s) => s.id !== skillId),
          skillLogs: prev.skillLogs.filter((l) => l.skillId !== skillId),
          weeklyGoals: removeLinkedWeeklyGoals(prev.weeklyGoals, 'skill', [skillId]),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  const deleteSkillLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const target = prev.skillLogs.find((s) => s.id === logId);
        let pointsUpdate = {};
        if (target && target.pointsAwarded > 0) {
          pointsUpdate = addPointsInternal(prev, -target.pointsAwarded, `Skill practice log deleted`, 'skill');
        }
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
        return {
          ...prev,
          skillLogs: prev.skillLogs.filter((s) => s.id !== logId),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  // --- MODULE 4: BAD HABIT REDUCTION TRACKER ACTIONS ---
  const addBadHabit = useCallback((name: string, commitmentDays: number = 30) => {
    const finalCommitment = Math.max(30, Math.floor(Number(commitmentDays) || 30));
    const bh: BadHabit = {
      id: uid(),
      name: name.trim(),
      commitmentDays: finalCommitment,
      isCompleted: false,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, badHabits: [...prev.badHabits, bh] }));
    return bh;
  }, []);

  const logBadHabitDay = useCallback((badHabitId: string, date: string, status: 'resisted' | 'occurred') => {
    setState((prev) => {
      try {
        const bh = prev.badHabits.find((b) => b.id === badHabitId);
        if (!bh || bh.isCompleted) return prev;

        const existingLog = prev.badHabitLogs.find((l) => l.badHabitId === badHabitId && l.date === date);
        if (existingLog) return prev;

        const activeHabits = prev.badHabits
          .filter((h) => !h.isCompleted)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const activeIndex = activeHabits.findIndex((h) => h.id === badHabitId);
        const isPointEligible = activeIndex >= 0 && activeIndex < 2;

        let pointsChange = 0;
        let reason = '';
        let consecutiveOccurrences = 0;

        if (status === 'resisted') {
          pointsChange = isPointEligible ? 10 : 0;
          reason = `Bad habit resisted: ${bh.name}`;
        } else {
          const pastLogs = (prev.badHabitLogs || [])
            .filter((l) => l && l.badHabitId === badHabitId && l.date < date)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

          consecutiveOccurrences = 1;
          for (const log of pastLogs) {
            if (log && (log.status === 'occurred' || log.status === 'no_report')) {
              consecutiveOccurrences++;
            } else {
              break;
            }
          }

          const multiplier = getMissPenaltyMultiplier(consecutiveOccurrences, prev.totalPoints || 0);
          const penaltyAmount = isPointEligible ? Math.round(10 * multiplier) : 0;
          pointsChange = -penaltyAmount;
          reason = `Bad habit occurred (${multiplier}x penalty): ${bh.name}`;
        }

        let pointsUpdate = {};
        if (pointsChange !== 0) {
          pointsUpdate = addPointsInternal(
            prev,
            pointsChange,
            reason,
            status === 'resisted' ? 'bad_habit_resisted' : 'bad_habit_occurred'
          );
        }

        const newLog: BadHabitLog = {
          id: uid(),
          badHabitId,
          date,
          status,
          consecutiveOccurrences: status === 'occurred' ? consecutiveOccurrences : 0,
          pointsAwardedOrDeducted: pointsChange,
          createdAt: new Date().toISOString(),
        };

        const filteredLogs = (prev.badHabitLogs || []).filter((l) => !(l && l.badHabitId === badHabitId && l.date === date));
        return {
          ...prev,
          badHabitLogs: [newLog, ...filteredLogs],
          ...pointsUpdate,
        };
      } catch (err) {
        console.error(`[ERROR IN logBadHabitDay FOR STATUS ${status}]:`, err);
        return prev;
      }
    });
  }, []);

  const undoTodayBadHabitLog = useCallback((badHabitId: string) => {
    setState((prev) => {
      const today = todayKey();
      const target = prev.badHabitLogs.find((l) => l.badHabitId === badHabitId && l.date === today);
      if (!target) return prev;
      if (target.status === 'no_report') return prev;

      let pointsUpdate = {};
      if (target.pointsAwardedOrDeducted !== 0) {
        const reverseAmount = -target.pointsAwardedOrDeducted;
        const bh = prev.badHabits.find((b) => b.id === badHabitId);
        pointsUpdate = addPointsInternal(
          prev,
          reverseAmount,
          `Undid today's action for bad habit: ${bh?.name || badHabitId}`,
          'bad_habit_undo'
        );
      }

      return {
        ...prev,
        badHabitLogs: prev.badHabitLogs.filter((l) => !(l.badHabitId === badHabitId && l.date === today)),
        ...pointsUpdate,
      };
    });
  }, []);

  const deleteBadHabit = useCallback((badHabitId: string) => {
    setState(
      (prev) => {
        const habitLogs = prev.badHabitLogs.filter((l) => l.badHabitId === badHabitId);
        const bh = prev.badHabits.find((b) => b.id === badHabitId);

        let pointsUpdate = {};
        if (bh && !bh.isCompleted) {
          const netPoints = habitLogs.reduce((sum, l) => sum + (l.pointsAwardedOrDeducted || 0), 0);

          if (netPoints !== 0) {
            const reverseAmount = -netPoints;
            pointsUpdate = addPointsInternal(
              prev,
              reverseAmount,
              `Bad habit deleted (reversed net points): ${bh.name}`,
              'bad_habit_delete'
            );
          }
        }

        const updatedDeletedEntityIds = [
          ...(prev.deletedEntityIds || []),
          badHabitId,
          ...habitLogs.map((l) => l.id || `${l.badHabitId}_${l.date}`),
        ].slice(-500);

        return {
          ...prev,
          badHabits: prev.badHabits.filter((b) => b.id !== badHabitId),
          badHabitLogs: prev.badHabitLogs.filter((l) => l.badHabitId !== badHabitId),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  const completeBadHabit = useCallback((badHabitId: string) => {
    setState((prev) => {
      const bh = prev.badHabits.find((b) => b.id === badHabitId);
      if (!bh) return prev;

      return {
        ...prev,
        badHabits: prev.badHabits.map((b) =>
          b.id === badHabitId
            ? { ...b, isCompleted: true, completedAt: new Date().toISOString() }
            : b
        ),
      };
    });
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
  }, []);

  const deleteBadHabitLog = useCallback((badHabitId: string, date: string) => {
    setState(
      (prev) => {
        const target = prev.badHabitLogs.find((l) => l.badHabitId === badHabitId && l.date === date);
        let pointsUpdate = {};
        if (target && target.pointsAwardedOrDeducted !== 0) {
          pointsUpdate = addPointsInternal(
            prev,
            -target.pointsAwardedOrDeducted,
            `Bad habit log cleared for ${date}`,
            'bad_habit_clear'
          );
        }
        const targetComposite = target?.id || `${badHabitId}_${date}`;
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), targetComposite].slice(-500);
        return {
          ...prev,
          badHabitLogs: prev.badHabitLogs.filter((l) => !(l.badHabitId === badHabitId && l.date === date)),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  // --- MODULE 5: ADDICTION RECOVERY ACTIONS ---
  const setAddictionTracker = useCallback((title: string, startDateIso?: string) => {
    setState((prev) => {
      const tracker: AddictionTracker = {
        id: prev.addictionTracker?.id || uid(),
        title: title.trim() || 'Sobriety Tracker',
        startDate: startDateIso || new Date().toISOString(),
        milestonesUnlocked: prev.addictionTracker?.milestonesUnlocked || [],
        createdAt: prev.addictionTracker?.createdAt || new Date().toISOString(),
      };
      return { ...prev, addictionTracker: tracker };
    });
  }, []);

  const resetAddictionStreak = useCallback(() => {
    setState((prev) => {
      if (!prev.addictionTracker) return prev;
      return {
        ...prev,
        addictionTracker: {
          ...prev.addictionTracker,
          startDate: new Date().toISOString(),
          milestonesUnlocked: [],
        },
      };
    });
  }, []);

  const checkAddictionMilestones = useCallback(() => {
    setState((prev) => {
      if (!prev.addictionTracker) return prev;
      const start = new Date(prev.addictionTracker.startDate).getTime();
      const now = new Date().getTime();
      const hoursElapsed = (now - start) / (1000 * 60 * 60);

      const unlocked = [...prev.addictionTracker.milestonesUnlocked];
      let addedPoints = 0;
      const historyToAdd: PointsEntry[] = [];

      const newlyUnlockedLabels: string[] = [];
      if (hoursElapsed >= 24 && !unlocked.includes('24h')) {
        unlocked.push('24h');
        addedPoints += 20;
        newlyUnlockedLabels.push('24 Hours Clean');
        historyToAdd.push({ id: uid(), amount: 20, reason: 'Sobriety Milestone: 24 Hours Clean! 🎉', source: 'recovery_milestone', timestamp: new Date().toISOString() });
      }
      if (hoursElapsed >= 168 && !unlocked.includes('1w')) {
        unlocked.push('1w');
        addedPoints += 50;
        newlyUnlockedLabels.push('1 Week Clean');
        historyToAdd.push({ id: uid(), amount: 50, reason: 'Sobriety Milestone: 1 Week Clean! 🏅', source: 'recovery_milestone', timestamp: new Date().toISOString() });
      }
      if (hoursElapsed >= 720 && !unlocked.includes('1m')) {
        unlocked.push('1m');
        addedPoints += 150;
        newlyUnlockedLabels.push('1 Month Clean');
        historyToAdd.push({ id: uid(), amount: 150, reason: 'Sobriety Milestone: 1 Month Clean! 🏆', source: 'recovery_milestone', timestamp: new Date().toISOString() });
      }

      if (addedPoints === 0) return prev;

      if (prev.currentUser?.id && newlyUnlockedLabels.length > 0) {
        const substance = prev.addictionTracker.title || 'Sobriety';
        const dedupKey = `sobriety_${prev.addictionTracker.id}_${unlocked.sort().join('_')}`;
        createNotificationSupabase({
          recipientId: prev.currentUser.id,
          type: 'addiction_milestone',
          title: 'Sobriety Milestone Reached! 🎉',
          message: `Congratulations! You unlocked milestone(s): ${newlyUnlockedLabels.join(', ')} for ${substance}.`,
          payload: { substance, milestones: newlyUnlockedLabels, dedupKey },
        });
      }

      return {
        ...prev,
        addictionTracker: {
          ...prev.addictionTracker,
          milestonesUnlocked: unlocked,
        },
        totalPoints: prev.totalPoints + addedPoints,
        pointsHistory: [...historyToAdd, ...prev.pointsHistory].slice(0, 500),
      };
    });
  }, []);

  const logCraving = useCallback((intensity: number, trigger: string, copingStrategy: string) => {
    const log: CravingLog = {
      id: uid(),
      date: new Date().toISOString(),
      intensity,
      trigger: trigger.trim(),
      copingStrategy: copingStrategy.trim(),
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, cravingLogs: [log, ...prev.cravingLogs] }));
  }, []);

  const deleteAddictionTracker = useCallback(() => {
    setState(
      (prev) => {
        let milestonePtsDeducted = 0;
        if (prev.addictionTracker?.milestonesUnlocked) {
          if (prev.addictionTracker.milestonesUnlocked.includes('24h')) milestonePtsDeducted += 20;
          if (prev.addictionTracker.milestonesUnlocked.includes('1w')) milestonePtsDeducted += 50;
          if (prev.addictionTracker.milestonesUnlocked.includes('1m')) milestonePtsDeducted += 150;
        }
        let pointsUpdate = {};
        if (milestonePtsDeducted > 0) {
          pointsUpdate = addPointsInternal(prev, -milestonePtsDeducted, 'Sobriety tracker deleted', 'addiction_recovery');
        }
        const trackerId = prev.addictionTracker?.id;
        const updatedDeletedEntityIds = [
          ...(prev.deletedEntityIds || []),
          ...(trackerId ? [trackerId] : []),
          ...prev.cravingLogs.map((l) => l.id),
        ].slice(-500);

        return {
          ...prev,
          addictionTracker: null,
          cravingLogs: [],
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  const deleteCravingLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
        return {
          ...prev,
          cravingLogs: prev.cravingLogs.filter((l) => l.id !== logId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
  }, []);

  // --- MODULE 7: PREFRONTAL CORTEX ACTIONS ---
  const logFocusSession = useCallback((taskName: string, durationMinutes: number, skillId?: string, reflection?: string) => {
    const date = todayKey();
    const pointsToAward = Math.max(5, Math.round(durationMinutes * 0.6));
    setState((prev) => {
      const focusLog: FocusSessionLog = {
        id: uid(),
        date,
        taskName: taskName.trim() || 'Deep Focus',
        skillId,
        durationMinutes,
        pointsAwarded: pointsToAward,
        reflection: reflection?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      const pointsUpdate = addPointsInternal(prev, pointsToAward, `Focus session completed (${durationMinutes}m)`, 'focus');
      return {
        ...prev,
        focusLogs: [focusLog, ...prev.focusLogs],
        ...pointsUpdate,
      };
    });
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
  }, []);

  const addDecision = useCallback((title: string, rationale: string, expectedOutcome: string, revisitDate: string) => {
    const decision: DecisionLog = {
      id: uid(),
      title: title.trim(),
      rationale: rationale.trim(),
      expectedOutcome: expectedOutcome.trim(),
      revisitDate,
      isReflected: false,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, decisionLogs: [decision, ...prev.decisionLogs] }));
    return decision;
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

      const pointsUpdate = addPointsInternal(prev, 15, `Decision reflection: ${target.title}`, 'decision_reflection');
      return { ...prev, decisionLogs: updatedLogs, ...pointsUpdate };
    });
  }, []);

  const logEmotion = useCallback((emotion: string, intensity: number, context: string) => {
    const log: EmotionLog = {
      id: uid(),
      date: new Date().toISOString(),
      emotion: emotion.trim(),
      intensity,
      context: context.trim(),
      pointsAwarded: 5,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => {
      const pointsUpdate = addPointsInternal(prev, 5, `Emotion labeled: ${emotion}`, 'emotion_label');
      return {
        ...prev,
        emotionLogs: [log, ...prev.emotionLogs],
        ...pointsUpdate,
      };
    });
  }, []);

  const deleteFocusLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const target = prev.focusLogs.find((f) => f.id === logId);
        let pointsUpdate = {};
        if (target && target.pointsAwarded > 0) {
          pointsUpdate = addPointsInternal(prev, -target.pointsAwarded, `Focus session deleted: ${target.taskName}`, 'focus');
        }
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
        return {
          ...prev,
          focusLogs: prev.focusLogs.filter((f) => f.id !== logId),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  const deleteDecisionLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const target = prev.decisionLogs.find((d) => d.id === logId);
        let ptsToDeduct = 0;
        if (target) {
          ptsToDeduct = target.isReflected ? 30 : 15;
        }
        let pointsUpdate = {};
        if (ptsToDeduct > 0 && target) {
          pointsUpdate = addPointsInternal(prev, -ptsToDeduct, `Decision log deleted: ${target.title}`, 'decision_journal');
        }
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
        return {
          ...prev,
          decisionLogs: prev.decisionLogs.filter((d) => d.id !== logId),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  const deleteEmotionLog = useCallback((logId: string) => {
    setState(
      (prev) => {
        const target = prev.emotionLogs.find((e) => e.id === logId);
        let pointsUpdate = {};
        if (target) {
          pointsUpdate = addPointsInternal(prev, -5, `Emotion label deleted: ${target.emotion}`, 'emotion_label');
        }
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), logId].slice(-500);
        return {
          ...prev,
          emotionLogs: prev.emotionLogs.filter((e) => e.id !== logId),
          deletedEntityIds: updatedDeletedEntityIds,
          ...pointsUpdate,
        };
      },
      { immediate: true }
    );
  }, []);

  const addWeeklyReflection = useCallback((weekKey: string, content: string) => {
    if (!content.trim()) return;
    setState((prev) => {
      const idx = prev.weeklyGoals.findIndex((w) => w.weekKey === weekKey);
      const existingDoc = idx >= 0 ? prev.weeklyGoals[idx] : null;

      const existingReflections = existingDoc?.reflections || [];

      const newRef: WeeklyGoalReflection = {
        id: uid(),
        content: content.trim(),
        createdAt: new Date().toISOString(),
        pointsAwarded: false,
      };

      const candidateReflections = [...existingReflections, newRef];

      const { updatedReflections, nextState } = reconcileReflectionPoints(
        prev,
        weekKey,
        candidateReflections
      );

      const updatedDoc: WeeklyGoal = {
        id: existingDoc ? existingDoc.id : uid(),
        weekKey,
        goals: existingDoc ? existingDoc.goals : [],
        reflections: updatedReflections,
        createdAt: existingDoc ? existingDoc.createdAt : new Date().toISOString(),
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
  }, []);

  const updateWeeklyReflection = useCallback((weekKey: string, reflectionId: string, content: string) => {
    if (!content.trim()) return;
    setState((prev) => {
      const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === weekKey);
      if (docIdx === -1) return prev;

      const doc = prev.weeklyGoals[docIdx];
      const reflections = doc.reflections || [];
      const refIdx = reflections.findIndex((r) => r.id === reflectionId);
      if (refIdx === -1) return prev;

      const existingRef = reflections[refIdx];
      const updatedRef: WeeklyGoalReflection = {
        ...existingRef,
        content: content.trim(),
        updatedAt: new Date().toISOString(),
      };

      const candidateReflections = [...reflections];
      candidateReflections[refIdx] = updatedRef;

      const { updatedReflections, nextState } = reconcileReflectionPoints(
        prev,
        weekKey,
        candidateReflections
      );

      const updatedDoc = { ...doc, reflections: updatedReflections };
      const newWeeklyGoals = [...nextState.weeklyGoals];
      newWeeklyGoals[docIdx] = updatedDoc;

      return {
        ...nextState,
        weeklyGoals: newWeeklyGoals,
      };
    });
  }, []);

  const deleteWeeklyReflection = useCallback((weekKey: string, reflectionId: string) => {
    setState((prev) => {
      const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === weekKey);
      if (docIdx === -1) return prev;

      const doc = prev.weeklyGoals[docIdx];
      const targetRef = (doc.reflections || []).find((r) => r.id === reflectionId);
      if (!targetRef) return prev;

      const candidateReflections = (doc.reflections || []).filter((r) => r.id !== reflectionId);

      const { updatedReflections, nextState } = reconcileReflectionPoints(
        prev,
        weekKey,
        candidateReflections
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
    });
  }, []);

  const addWeeklyGoalItem = useCallback((weekKey: string, goalData: Partial<WeeklyGoalItem>) => {
    setState((prev) => {
      const idx = prev.weeklyGoals.findIndex((w) => w.weekKey === weekKey);
      const existingDoc = idx >= 0 ? prev.weeklyGoals[idx] : null;

      const newItem: WeeklyGoalItem = {
        id: uid(),
        title: (goalData.title || goalData.text || '').trim() || 'New Weekly Goal',
        targetDescription: goalData.targetDescription?.trim() || '',
        priority: goalData.priority || 'medium',
        linkedModule: goalData.linkedModule || 'none',
        linkedItemId: goalData.linkedItemId || undefined,
        targetValue: typeof goalData.targetValue === 'number' && goalData.targetValue > 0 ? goalData.targetValue : undefined,
        unit: goalData.unit?.trim() || undefined,
        manualProgress: typeof goalData.manualProgress === 'number' ? goalData.manualProgress : 0,
        completed: Boolean(goalData.completed),
        carriedOverFromWeekKey: goalData.carriedOverFromWeekKey,
        createdAt: new Date().toISOString(),
      };

      const updatedGoals = existingDoc ? [...existingDoc.goals, newItem] : [newItem];
      const updatedDoc: WeeklyGoal = {
        id: existingDoc ? existingDoc.id : uid(),
        weekKey,
        goals: updatedGoals,
        reflections: existingDoc?.reflections || [],
        createdAt: existingDoc ? existingDoc.createdAt : new Date().toISOString(),
      };

      const newWeeklyGoals = [...prev.weeklyGoals];
      if (idx >= 0) {
        newWeeklyGoals[idx] = updatedDoc;
      } else {
        newWeeklyGoals.unshift(updatedDoc);
      }

      return { ...prev, weeklyGoals: newWeeklyGoals };
    });
  }, []);

  const updateWeeklyGoalItem = useCallback((weekKey: string, goalId: string, updates: Partial<WeeklyGoalItem>) => {
    setState((prev) => {
      const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === weekKey);
      if (docIdx === -1) return prev;

      const doc = prev.weeklyGoals[docIdx];
      const goalIdx = doc.goals.findIndex((g) => g.id === goalId);
      if (goalIdx === -1) return prev;

      const existingGoal = doc.goals[goalIdx];
      const updatedGoal: WeeklyGoalItem = {
        ...existingGoal,
        ...updates,
        title: updates.title !== undefined ? updates.title.trim() : existingGoal.title,
        targetDescription: updates.targetDescription !== undefined ? updates.targetDescription.trim() : existingGoal.targetDescription,
      };

      const updatedGoals = [...doc.goals];
      updatedGoals[goalIdx] = updatedGoal;

      const updatedDoc = { ...doc, goals: updatedGoals };
      const newWeeklyGoals = [...prev.weeklyGoals];
      newWeeklyGoals[docIdx] = updatedDoc;

      return { ...prev, weeklyGoals: newWeeklyGoals };
    });
  }, []);

  const deleteWeeklyGoalItem = useCallback((weekKey: string, goalId: string) => {
    setState((prev) => {
      const docIdx = prev.weeklyGoals.findIndex((w) => w.weekKey === weekKey);
      if (docIdx === -1) return prev;

      const doc = prev.weeklyGoals[docIdx];
      const updatedGoals = doc.goals.filter((g) => g.id !== goalId);

      const updatedDoc = { ...doc, goals: updatedGoals };
      const newWeeklyGoals = [...prev.weeklyGoals];
      newWeeklyGoals[docIdx] = updatedDoc;
      const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), goalId].slice(-500);

      return { ...prev, weeklyGoals: newWeeklyGoals, deletedEntityIds: updatedDeletedEntityIds };
    });
  }, []);

  const carryOverGoal = useCallback((sourceWeekKey: string, targetWeekKey: string, goalId: string, options?: { resumeProgress?: boolean }) => {
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
          (g) => g.title.trim().toLowerCase() === targetGoal.title.trim().toLowerCase()
        )
      ) {
        return prev;
      }

      const carriedItem: WeeklyGoalItem = {
        ...targetGoal,
        id: uid(),
        completed: false,
        manualProgress: options?.resumeProgress ? (targetGoal.manualProgress || 0) : 0,
        carriedOverFromWeekKey: sourceWeekKey,
        createdAt: new Date().toISOString(),
      };

      const newGoals = targetDoc ? [...targetDoc.goals, carriedItem] : [carriedItem];
      const newDoc: WeeklyGoal = {
        id: targetDoc ? targetDoc.id : uid(),
        weekKey: targetWeekKey,
        goals: newGoals,
        reflections: targetDoc?.reflections || [],
        createdAt: targetDoc ? targetDoc.createdAt : new Date().toISOString(),
      };

      let newWeeklyGoals = [...prev.weeklyGoals];
      if (targetDocIdx >= 0) {
        newWeeklyGoals[targetDocIdx] = newDoc;
      } else {
        newWeeklyGoals.unshift(newDoc);
      }

      return { ...prev, weeklyGoals: newWeeklyGoals };
    });
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
        createdAt: new Date().toISOString(),
      };
      setState(
        (prev) => ({
          ...prev,
          goals: [newGoal, ...prev.goals],
        }),
        { immediate: true }
      );
      return newGoal;
    },
    []
  );

  const updateGoal = useCallback(
    (id: string, updates: Partial<Omit<Goal, 'id' | 'createdAt'>>) => {
      setState(
        (prev) => ({
          ...prev,
          goals: prev.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        }),
        { immediate: true }
      );
    },
    []
  );

  const deleteGoal = useCallback((id: string) => {
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
      { immediate: true }
    );
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
      return currentCompletedAt || new Date().toISOString();
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
        completedAt: isCompleted ? new Date().toISOString() : undefined,
        manualProgress: data.manualProgress !== undefined ? data.manualProgress : 0,
        order: projectOrder !== undefined ? projectOrder : 0,
        createdAt: new Date().toISOString(),
      };
      setState(
        (prev) => ({
          ...prev,
          projects: [newProject, ...prev.projects],
        }),
        { immediate: true }
      );
      return newProject;
    },
    [state.projects]
  );

  const updateProject = useCallback(
    (id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>) => {
      setState(
        (prev) => ({
          ...prev,
          projects: prev.projects.map((p) => {
            if (p.id !== id) return p;
            const completedAt = resolveProjectCompletedAt(p.status, updates.status, p.completedAt, updates.completedAt);
            return { ...p, ...updates, completedAt };
          }),
        }),
        { immediate: true }
      );
    },
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
  }, []);

  const moveProjectStatus = useCallback((id: string, newStatus: ProjectStatus) => {
    setState(
      (prev) => ({
        ...prev,
        projects: prev.projects.map((p) => {
          if (p.id !== id) return p;
          const completedAt = resolveProjectCompletedAt(p.status, newStatus, p.completedAt);
          return { ...p, status: newStatus, completedAt };
        }),
      }),
      { immediate: true }
    );
  }, []);

  const deleteProject = useCallback((id: string) => {
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
      { immediate: true }
    );
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
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        tasks: [newTask, ...prev.tasks],
      }));
      return newTask;
    },
    []
  );

  const updateTask = useCallback(
    (id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => {
      setState((prev) => ({
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
      }));
    },
    []
  );

  const toggleTaskCompleted = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== id) return t;
        // If task has subtasks, do not allow manual toggle directly (completion is driven by subtasks)
        if ((t.subtasks || []).length > 0) return t;
        return { ...t, completed: !t.completed };
      }),
    }));
  }, []);

  const deleteTask = useCallback((id: string) => {
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
      { immediate: true }
    );
  }, []);

  const toggleSubtask = useCallback((taskId: string, subtaskId: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const updatedSubtasks = (t.subtasks || []).map((st) =>
          st.id === subtaskId ? { ...st, completed: !st.completed } : st
        );
        const allCompleted = updatedSubtasks.length > 0 && updatedSubtasks.every((st) => st.completed);
        return { ...t, subtasks: updatedSubtasks, completed: allCompleted };
      }),
    }));
  }, []);

  const addSubtask = useCallback((taskId: string, title: string) => {
    if (!title.trim()) return;
    const newSubtask: TaskSubtask = {
      id: uid(),
      title: title.trim(),
      completed: false,
    };
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const updatedSubtasks = [...(t.subtasks || []), newSubtask];
        const allCompleted = updatedSubtasks.length > 0 && updatedSubtasks.every((st) => st.completed);
        return { ...t, subtasks: updatedSubtasks, completed: allCompleted };
      }),
    }));
  }, []);

  const deleteSubtask = useCallback((taskId: string, subtaskId: string) => {
    setState((prev) => {
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
    });
  }, []);

  // --- SOCIAL FEATURE 1: PERSONAL IMPROVEMENT PLANS ACTIONS ---
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
          ? [{ id: uid(), createdAt: new Date().toISOString(), note: typeParams.initialReflectionNote.trim() }]
          : [];

        const reviewCadence = typeParams?.reviewCadence || null;
        let nextReviewDueAt: string | null = null;
        if (reviewCadence === 'weekly') {
          nextReviewDueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (reviewCadence === 'monthly') {
          nextReviewDueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
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
          createdAt: new Date().toISOString(),

          // Phase B Plan Type Properties
          planType,
          targetValue: typeParams?.targetValue,
          targetUnit: typeParams?.targetUnit,
          currentProgress: typeParams?.currentProgress ?? 0,
          targetDate: typeParams?.targetDate,
          cadence: typeParams?.cadence ?? 'daily',
          duration: typeParams?.duration ?? 30,
          startDate: typeParams?.startDate || new Date().toISOString(),
          streakCount: 0,
          lastCompletedDate: undefined,
          targetReviewDate: typeParams?.targetReviewDate,
          reflectionNotes,

          // Phase C Review Loop
          reviewCadence,
          nextReviewDueAt,
        };

        return {
          ...prev,
          improvementPlans: [newPlan, ...prev.improvementPlans],
        };
      });

      if (newPlan) {
        updateCachedPublicPlan(newPlan);
        syncBroadcaster.broadcast('PLAN_CREATED', newPlan);
        syncPlanToSupabase(newPlan);
      }
      return newPlan;
    },
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

      const nowIso = new Date().toISOString();
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
      console.log('[REAL-USER DEBUG: MARK DONE SUCCESS]', {
        planId: (updatedPlan as any).id,
        title: (updatedPlan as any).title,
        newStreakCount: (updatedPlan as any).streakCount,
        lastCompletedDate: (updatedPlan as any).lastCompletedDate,
      });
      updateCachedPublicPlan(updatedPlan);
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      syncPlanToSupabase(updatedPlan);
    }
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

      const nowIso = new Date().toISOString();
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
      console.log('[REAL-USER DEBUG: MARK FOLLOWED DONE SUCCESS]', {
        followId: follow.id,
        newStreakCount: follow.streakCount,
      });
      syncFollowedPlanToSupabase(follow);
    }
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
        createdAt: new Date().toISOString(),
        note: note.trim(),
      };

      if (target.reviewCadence === 'weekly') {
        nextDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (target.reviewCadence === 'monthly') {
        nextDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
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
        };

        const updatedPlans = [...prev.improvementPlans];
        updatedPlans[idx] = updatedPlan;
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), noteId].slice(-500);
        return { ...prev, improvementPlans: updatedPlans, deletedEntityIds: updatedDeletedEntityIds };
      },
      { immediate: true }
    );

    if (updatedPlan) {
      updateCachedPublicPlan(updatedPlan);
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      syncPlanToSupabase(updatedPlan);
    }
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

      const newReviewCadence = typeParams?.reviewCadence !== undefined ? typeParams.reviewCadence : target.reviewCadence;
      let newNextReviewDueAt = target.nextReviewDueAt;
      if (newReviewCadence !== target.reviewCadence || (newReviewCadence && !newNextReviewDueAt)) {
        if (newReviewCadence === 'weekly') {
          newNextReviewDueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (newReviewCadence === 'monthly') {
          newNextReviewDueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
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
  }, []);

  const togglePlanVisibility = useCallback(async (planId: string, newVisibility?: boolean) => {
    try {
      console.log(`[Visibility Update] Initiating toggle for plan ID: ${planId}`);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        alert("Error: You must be logged in to change plan visibility.");
        return;
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
        alert(`Database Error (Visibility Update): ${error ? (error.message || error.code) : '0 rows updated in database. Permission denied or plan not found.'}`);
        return;
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
      alert(`Fatal Error: ${err.message || 'Check console'}`);
    }
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
  }, []);

  const copyPublicPlan = useCallback(async (originalPlan: ImprovementPlan) => {
    const planId = originalPlan.id;
    try {
      console.log(`[Copy Plan] Initiating copy for plan ID: ${planId}`);

      // 1. Verify Session First
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        alert("Error: You must be logged in to copy a plan.");
        return;
      }

      const isOwnPlan = (originalPlan.creatorUsername || '').toLowerCase() === (state.username || '').toLowerCase() || (originalPlan.creatorId && state.currentUser?.id && originalPlan.creatorId === state.currentUser.id);
      const alreadyCopied = state.followedPlans.some((f) => f.originalPlanId === planId);

      if (isOwnPlan || alreadyCopied) {
        return;
      }

      // 2. ATOMIC RPC EXECUTION FIRST (Do not wait for user_plan_follows)
      console.log(`[Copy Plan] Calling RPC increment_plan_copy_count...`);
      const { data: newCount, error: rpcError } = await supabase
        .rpc('increment_plan_copy_count', { target_plan_id: planId });

      if (rpcError) {
        console.error("[Copy Plan] RPC FAILED:", rpcError);
        alert(`Database Error (RPC): ${rpcError.message || rpcError.code}`);
        throw rpcError;
      }

      console.log(`[Copy Plan] RPC Success! New copy count is: ${newCount}`);
      const finalCount = typeof newCount === 'number' && newCount > 0 ? newCount : (originalPlan.copyCount || 0) + 1;

      // 3. Update the global Zustand state optimistically
      updatePlanCopyCount(planId, finalCount);

      // 4. NOW attempt to create the follow record
      console.log(`[Copy Plan] Inserting into user_plan_follows...`);
      const stepsCopy: PlanStep[] = originalPlan.steps.map((s) => ({
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
        steps: (originalPlan.steps || []).map((s) => ({
          ...s,
          id: uid(),
          completed: false,
        })),
        isCompleted: false,
        pointsAwarded: 0,
        createdAt: new Date().toISOString(),

        // Phase B Plan Type Additions (fresh starting values for follower)
        planType: originalPlan.planType || 'milestone',
        targetValue: originalPlan.targetValue,
        targetUnit: originalPlan.targetUnit,
        currentProgress: 0, // Reset progress for copier
        targetDate: originalPlan.targetDate,
        cadence: originalPlan.cadence,
        duration: originalPlan.duration,
        startDate: new Date().toISOString(),
        streakCount: 0, // Reset streak for copier
        lastCompletedDate: undefined,
        targetReviewDate: originalPlan.targetReviewDate,
        reflectionNotes: [], // Reset reflections to empty for copier
      };

      setState((prev) => ({
        ...prev,
        followedPlans: [createdFollow, ...prev.followedPlans],
      }));

      syncFollowedPlanToSupabase(createdFollow);
    } catch (err: any) {
      console.error("[Copy Plan] FATAL ERROR CATCH:", err);
      alert(`Fatal Error during copy: ${err.message || 'Check console'}`);
    }
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
        createdAt: new Date().toISOString(),
        note: note.trim(),
      };

      if (target.reviewCadence === 'weekly') {
        nextDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (target.reviewCadence === 'monthly') {
        nextDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
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
      updateCachedPublicPlan(updatedPlan);
      syncBroadcaster.broadcast('PLAN_UPDATED', updatedPlan);
      syncPlanToSupabase(updatedPlan);
    }
  }, []);

  const deletePlan = useCallback(async (planId: string) => {
    try {
      console.log(`[Delete Plan] Initiating DB deletion for plan ID: ${planId}`);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        alert("Error: You must be logged in to delete a plan.");
        return;
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
        alert(`Database Error (Delete Plan): ${error ? (error.message || error.code) : '0 rows deleted in database. Permission denied or plan not found.'}`);
        return;
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
      alert(`Fatal Error during deletion: ${err.message || 'Check console'}`);
    }
  }, []);

  // --- SOCIAL FEATURE 2: ACCOUNTABILITY PARTNER & SHARED CHALLENGES ---
  const sendPartnerInvite = useCallback(
    async (targetUidInput: string) => {
      const trimmedUid = targetUidInput.trim();
      if (!trimmedUid) {
        throw new Error('User ID cannot be empty');
      }

      if (state.currentUser?.uid && trimmedUid === state.currentUser.uid) {
        throw new Error("You can't send an accountability invite to yourself.");
      }

      if ((state.partnerships || []).length >= 5) {
        throw new Error("You've reached the maximum limit of 5 accountability partners. Remove one to add another.");
      }

      const profileData = await fetchProfileByUidFromSupabase(trimmedUid);

      if (!profileData) {
        throw new Error(`No user found with User ID '${trimmedUid}'. Please verify the 6-digit User ID and try again.`);
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

      const targetPartnerships = await fetchPartnershipsSupabase(targetUserId, targetUsername);
      if (targetPartnerships.length >= 5) {
        throw new Error(`The user '${targetUsername}' has reached the maximum limit of 5 accountability partners.`);
      }

      // 1. Check if target user is ALREADY an active partner with current user (local + DB)
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

      const isAlreadyPartnerDb = targetPartnerships.some(
        (p) =>
          p.user1Id === state.currentUser?.id ||
          p.user2Id === state.currentUser?.id ||
          p.user1Username?.toLowerCase() === state.username.toLowerCase() ||
          p.user2Username?.toLowerCase() === state.username.toLowerCase()
      );
      if (isAlreadyPartnerDb) {
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
        createdAt: new Date().toISOString(),
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

      sendPartnerInviteSupabase(invite).catch((err) => {
        console.warn('Background Supabase send partner invite warning:', err);
      });

      createNotificationSupabase(notifData).catch((err) => {
        console.warn('Background Supabase create notification warning:', err);
      });

      return invite;
    },
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

      const inviterPartnerships = await fetchPartnershipsSupabase(fromId, fromUsername);
      if (inviterPartnerships.length >= 5) {
        throw new Error(`The inviter '${fromUsername}' has reached the maximum limit of 5 accountability partners.`);
      }

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
        user1AllowStats: true,
        user2AllowStats: true,
        pairedAt: new Date().toISOString(),
      };

      syncBroadcaster.broadcast('PARTNER_ACCEPTED', partnership);

      await createNotificationSupabase({
        recipientId: fromId,
        actorId: toId,
        actorUsername: toUsername,
        actorAvatar: state.currentUser?.avatar || '🧑',
        type: 'partner_invite_accepted',
        title: 'Partner Invite Accepted 🎉',
        message: `${toUsername} accepted your partner invite!`,
        payload: { partnershipId, dedupKey: `partner_invite_accepted_${partnershipId}` },
      });

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
  }, []);

  const declinePartnerInvite = useCallback(async (inviteId: string) => {
    const invite = state.partnerInvites.find((i) => i.id === inviteId);
    if (invite) {
      await createNotificationSupabase({
        recipientId: invite.fromUserId,
        actorId: state.currentUser?.id,
        actorUsername: state.username,
        actorAvatar: state.currentUser?.avatar || '🧑',
        type: 'partner_invite_declined',
        title: 'Partner Invite Declined',
        message: `${state.username} declined your partner invite.`,
        payload: { inviteId, dedupKey: `partner_invite_declined_${inviteId}` },
      });
    }

    const staleNotif = (state.notifications || []).find(
      (n) => n.type === 'partner_invite' && (n.payload?.inviteId === inviteId || (invite && n.actorId === invite.fromUserId))
    );
    if (staleNotif) {
      markNotificationReadSupabase(staleNotif.id);
    }

    await deletePartnerInviteSupabase(inviteId);
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
  }, [state.partnerInvites, state.notifications, state.username, state.currentUser]);

  const endPartnership = useCallback((partnershipId?: string) => {
    const targetId = partnershipId || state.partnership?.id || state.partnerships[0]?.id;
    if (targetId) {
      deletePartnershipSupabase(targetId).catch((err) => {
        console.warn('Background Supabase delete partnership warning:', err);
      });
    }
    syncBroadcaster.broadcast('PARTNER_ENDED', { partnershipId: targetId });
    setState(
      (prev) => {
        const updatedPartnerships = (prev.partnerships || []).filter((p) => p.id !== targetId);
        const removedChallengeIds = prev.sharedChallenges
          .filter((c) => c.partnershipId === targetId)
          .map((c) => c.id);
        const updatedDeletedEntityIds = [
          ...(prev.deletedEntityIds || []),
          ...(targetId ? [targetId] : []),
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
  }, [state.partnership, state.partnerships]);

  const getPartnerProfileStats = useCallback(async (partnerUsername: string) => {
    if (!partnerUsername) return null;
    const profile = await fetchProfileByUsernameFromSupabase(partnerUsername);
    if (!profile) {
      const seed = SEED_ACCOUNTS.find((s) => s.username.toLowerCase() === partnerUsername.toLowerCase());
      if (seed) {
        return {
          totalPoints: seed.totalPoints,
          stats: seed.stats,
          avatar: seed.avatar,
        };
      }
      return null;
    }
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

    return {
      totalPoints: profile.total_points || 0,
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

  const togglePartnerStatsVisibility = useCallback(
    async (partnershipId: string, allow: boolean) => {
      const currentUserId = state.currentUser?.id || '';
      try {
        await togglePartnerStatsVisibilitySupabase(partnershipId, currentUserId, allow);
      } catch (err: any) {
        console.warn('Persisting stats visibility to Supabase skipped:', err?.message);
      }
      setState((prev) => {
        const updated = (prev.partnerships || []).map((p) => {
          if (p.id !== partnershipId) return p;
          const isUser1 = p.user1Id === currentUserId;
          return {
            ...p,
            user1AllowStats: isUser1 ? allow : p.user1AllowStats,
            user2AllowStats: isUser1 ? p.user2AllowStats : allow,
          };
        });
        return {
          ...prev,
          partnerships: updated,
          partnership: updated[0] || null,
        };
      });
    },
    [state.currentUser?.id]
  );

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
          c.partnershipId === pId &&
          c.status === 'active' &&
          c.title.trim().toLowerCase() === normTitle
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
        createdAt: new Date().toISOString(),
      };

      const backupChallenges = state.sharedChallenges;

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
        // Rollback UI state to backup
        setState((prev) => ({
          ...prev,
          sharedChallenges: backupChallenges,
        }));
        throw err;
      }
    },
    [state.partnership, state.partnerships, state.sharedChallenges]
  );

  const deleteSharedChallenge = useCallback(async (challengeId: string) => {
    const backupChallenges = state.sharedChallenges;
    const backupDeletedEntityIds = state.deletedEntityIds;

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
      // Rollback UI state to backup
      setState((prev) => ({
        ...prev,
        sharedChallenges: backupChallenges,
        deletedEntityIds: backupDeletedEntityIds,
      }));
      throw err;
    }
  }, [state.sharedChallenges, state.deletedEntityIds]);

  const logSharedChallengeHabit = useCallback(
    async (challengeId: string, forcedState?: boolean) => {
      const today = todayKey();
      const backupChallenges = state.sharedChallenges;

      const idx = state.sharedChallenges.findIndex((c) => c.id === challengeId);
      if (idx === -1) return;
      const target = state.sharedChallenges[idx];

      const challengePartnership =
        (state.partnerships || []).find((p) => p.id === target.partnershipId) || state.partnership;

      const isUser1 = challengePartnership
        ? (state.currentUser?.id && challengePartnership.user1Id === state.currentUser.id) ||
          challengePartnership.user1Username.toLowerCase() === state.username.toLowerCase()
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

      const wereBothDoneBefore =
        (target.user1DoneDates || (target.user1DoneDate ? [target.user1DoneDate] : [])).includes(today) &&
        (target.user2DoneDates || (target.user2DoneDate ? [target.user2DoneDate] : [])).includes(today);
      const { updated, becameCompleted } = applyPledgeToggle(target, isUser1, isDoneToday);

      const updatedChallenges = [...state.sharedChallenges];
      updatedChallenges[idx] = updated;

      // Optimistically update local UI state
      setState((prev) => ({
        ...prev,
        sharedChallenges: updatedChallenges,
      }));

      try {
        await saveSharedChallengeSupabase(updated);
        syncBroadcaster.broadcast('CHALLENGE_UPDATED', updated);

        if (challengePartnership) {
          const partnerUserId = isUser1 ? challengePartnership.user2Id : challengePartnership.user1Id;
          const partnerUsername = isUser1 ? challengePartnership.user2Username : challengePartnership.user1Username;

          if (isDoneToday && !wereBothDoneBefore) {
            const dedupKey = `partner_pledge_done_${target.id}_${today}`;
            createNotificationSupabase({
              recipientId: partnerUserId,
              actorId: state.currentUser?.id,
              actorUsername: state.username,
              actorAvatar: state.currentUser?.avatar || '🧑',
              type: 'partner_pledge_done',
              title: 'Partner Completed Challenge Today',
              message: `${state.username} completed today's target for "${target.title}"! Don't break your joint streak!`,
              payload: { challengeId: target.id, dateKey: today, dedupKey },
            }).catch(() => {});
          }

          if (becameCompleted) {
            const dedupKey = `challenge_completed_${target.id}`;
            createNotificationSupabase({
              recipientId: partnerUserId,
              actorId: state.currentUser?.id,
              actorUsername: state.username,
              actorAvatar: state.currentUser?.avatar || '🧑',
              type: 'challenge_completed',
              title: 'Shared Challenge Completed! 🎉',
              message: `Congratulations! You and ${state.username} completed the "${target.title}" challenge!`,
              payload: { challengeId: target.id, dedupKey },
            }).catch(() => {});
          }
        }
      } catch (err: any) {
        console.error('Failed to log shared challenge day in Supabase:', err);
        // Rollback UI state to backup
        setState((prev) => ({
          ...prev,
          sharedChallenges: backupChallenges,
        }));
        throw err;
      }
    },
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
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    if (state.currentUser?.id) {
      markAllNotificationsReadSupabase(state.currentUser.id);
    }
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) => ({ ...n, read: true })),
    }));
  }, [state.currentUser?.id]);

  const clearNotification = useCallback((notificationId: string) => {
    clearNotificationSupabase(notificationId);
    setState((prev) => {
      const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), notificationId].slice(-500);
      return {
        ...prev,
        notifications: (prev.notifications || []).filter((n) => n.id !== notificationId),
        deletedEntityIds: updatedDeletedEntityIds,
      };
    });
  }, []);

  // Multi-user & Seed Competitor League Helper
  const getLeagueData = useCallback(
    (type: LeagueType) => {
      const start = getLeaguePeriodStart(type);
      const userPoints = calculatePeriodPoints(state.pointsHistory, start, new Date(), state.totalPoints);

      const unified = calculateUnifiedStreak(state);

      const habitsCompletedCount = state.habits.reduce((acc, h) => acc + (h.completions?.length || 0), 0);
      const exerciseMinutes = state.workouts.reduce((sum, w) => sum + w.durationMinutes, 0);
      const booksRead = state.books.filter((b) => b.isFinished).length;
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
      };

      const activeHabitsList = state.habits.map((h) => ({
        name: h.name,
        category: h.category,
        frequency: h.frequency,
        isPreset: h.isPreset,
      }));

      const competitors = generateCompetitors(
        type,
        userPoints,
        state.currentUser,
        state.username,
        state.totalPoints,
        userStats,
        activeHabitsList
      );
      const userRank = getUserRank(competitors);
      return { competitors, userRank, userPoints };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.pointsHistory,
      state.habits,
      state.workouts,
      state.books,
      state.readingLogs,
      state.badHabits,
      state.badHabitLogs,
      state.skillLogs,
      state.journalEntries,
      state.currentUser,
      state.username,
      state.totalPoints,
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

  return {
    state,
    isAuthChecking,
    setAuthSessionState,
    logout,
    addPoints,
    addPresetHabit,
    addCustomHabit,
    deleteHabit,
    toggleHabit,
    isHabitDone,
    saveJournalEntry,
    deleteJournalEntry,
    getTodayJournalEntry,
    markLessonRead,
    setUsername,
    updateProfileUsername,
    updateProfileAvatar,
    toggleProfilePrivacy,
    toggleAcceptPartnerInvites,
    toggleNotifDailyReminder,
    toggleNotifPartnerActivity,
    toggleNotifLeagueUpdates,
    getLeagueData,
    getPublicImprovementPlans,
    // New Module Actions
    logWorkout,
    deleteWorkout,
    setExerciseGoal,
    addBook,
    updateBookTargetDate,
    updateReadingProgress,
    setReadingGoal,
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
    deleteBadHabitLog,
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
    toggleNotifSundayPlanning,
    // Self Improvement Books Library Actions
    addCuratedBookToLibrary,
    addCustomBookToLibrary,
    updateUserBookStatus,
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
    togglePartnerStatsVisibility,
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
  };
}

export type AppStore = ReturnType<typeof useAppState>;

function checkAndArchiveLeagues(state: AppState, now: Date = new Date()): AppState {
  const types: LeagueType[] = ['weekly', 'monthly', 'ninetyDay'];
  const newArchives: LeagueArchive[] = [];

  for (const type of types) {
    const currentPeriodLabel = getLeaguePeriodLabel(type, now);

    const hasCurrentArchive = state.leagueArchives.some(
      (a) => a.type === type && a.periodLabel === currentPeriodLabel
    );

    const currentStart = getLeaguePeriodStart(type, now);

    const previousPeriodPoints = state.pointsHistory.filter((entry) => {
      const ts = new Date(entry.timestamp);
      return ts < currentStart && entry.amount > 0;
    });

    if (previousPeriodPoints.length === 0) continue;

    const typeArchives = state.leagueArchives.filter((a) => a.type === type);
    if (typeArchives.length >= 12) continue;

    if (hasCurrentArchive) continue;

    const prevPoints = previousPeriodPoints.reduce((sum, e) => sum + e.amount, 0);
    if (prevPoints === 0) continue;

    const competitors = generateCompetitors(
      type,
      prevPoints,
      state.currentUser,
      state.username,
      state.totalPoints,
      undefined,
      undefined,
      new Date(currentStart.getTime() - 1)
    );
    const userRank = getUserRank(competitors);

    const prevDate = new Date(currentStart.getTime() - 1);
    const prevLabel = getLeaguePeriodLabel(type, prevDate);

    if (state.leagueArchives.some((a) => a.type === type && a.periodLabel === prevLabel)) continue;

    newArchives.push(createArchive(type, competitors, userRank, prevPoints, prevLabel));
  }

  if (newArchives.length === 0) return state;

  return {
    ...state,
    leagueArchives: [...newArchives, ...state.leagueArchives].slice(0, 36),
  };
}
