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
  PlanStep,
  ImprovementPlan,
  UserPlanFollow,
  PartnerInvite,
  Partnership,
  SharedChallenge,
  PartnerNotification,
  UserBook,
  UserBookStatus,
  CuratedBook,
  BookCategory,
  VisionReflectionNote,
  PlanType,
  SharedChallengeCategory,
  AppNotification,
} from '@/types';
import { findCuratedBook } from './books';
import { uid, generateUUID, generateNumericUID, periodKey, todayKey, isTodayLocal } from './dates';
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
import { processHabitPenalties, processBadHabitNoReports, getMissPenaltyMultiplier, getHighestUserStreak } from './habitPenalties';
import {
  supabase,
  isSupabaseConfigured,
  syncBroadcaster,
  syncPlanToSupabase,
  deletePlanFromSupabase,
  incrementPlanCopyCountSupabase,
  syncFollowedPlanToSupabase,
  deleteFollowedPlanFromSupabase,
  sendPartnerInviteSupabase,
  fetchUserDataFromSupabase,
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
  togglePartnerStatsVisibilitySupabase,
  fetchNotificationsSupabase,
  createNotificationSupabase,
  markNotificationReadSupabase,
  markAllNotificationsReadSupabase,
  clearNotificationSupabase,
} from './supabase';

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
    weeklyGoals: st.weeklyGoals ?? [],
    libraryBooks: st.libraryBooks ?? [],
    improvementPlans: st.improvementPlans ?? [],
    followedPlans: st.followedPlans ?? [],
    partnerInvites: st.partnerInvites ?? [],
    partnership: st.partnership ?? null,
    sharedChallenges: st.sharedChallenges ?? [],
    partnerNotifications: st.partnerNotifications ?? [],
  };

  return processBadHabitNoReports(baseState);
}

function persistState(state: AppState) {
  try {
    if (state.currentUser?.id) {
      saveUserDataToSupabase(state.currentUser.id, state);
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
  return {
    totalPoints: Math.max(0, prev.totalPoints + amount),
    pointsHistory: [
      {
        id: uid(),
        amount,
        reason,
        source,
        timestamp: new Date().toISOString(),
        ...(metadata ? { metadata } : {}),
      },
      ...prev.pointsHistory,
    ].slice(0, 500),
  };
}

export function useAppState() {
  const [state, setState] = useState<AppState>(loadInitialState);
  const isHydrated = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const archiveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (isHydrated.current) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        persistState(state);
      }, 2000);
    }
  }, [state]);

  // Initial Supabase data load & auth listener (single source of truth for session state)
  useEffect(() => {
    let mounted = true;

    async function initSupabaseData() {
      if (!isSupabaseConfigured) return;

      try {
        const [profiles, publicPlans] = await Promise.all([
          fetchAllProfilesFromSupabase(),
          fetchPublicPlansFromSupabase(),
        ]);

        if (mounted) {
          setCachedProfiles(profiles);
          setCachedPublicPlans(publicPlans);
        }
      } catch (e) {
        console.error('Error loading Supabase data:', e);
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
          return;
        }

        if (
          (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') &&
          session?.user
        ) {
          if (isHydrated.current && state.currentUser?.id === session.user.id) {
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

          // 8-second hard timeout: if hydration hangs, abort gracefully
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Auth hydration timed out after 8s')), 8000)
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
              setState(sanitizedState);
            }
          } catch (e) {
            console.error('Error hydrating auth session:', e);
            // Don't leave user stuck — if hydration fails or times out,
            // build a minimal profile from what we have and let them in
            if (mounted) {
              const fallbackUser: UserProfile = {
                id: userId,
                uid: generateNumericUID(),
                email,
                username: session.user.user_metadata?.username || email.split('@')[0],
                avatar: session.user.user_metadata?.avatar || '🧑',
                createdAt: session.user.created_at || new Date().toISOString(),
                isProfilePublic: true,
              };
              isHydrated.current = true;
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
        }
      }, 0);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
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
              sharedChallenges: prev.sharedChallenges.map((c) => (c.id === payload.id ? payload : c)),
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
        const activePartnerships = await fetchPartnershipsSupabase(userId);
        const pIds = activePartnerships.map((p) => p.id);
        const challenges = pIds.length > 0 ? await fetchSharedChallengesSupabase(pIds) : [];
        const fetchedNotifs = await fetchNotificationsSupabase(userId);

        setState((prev) => ({
          ...prev,
          partnerInvites: fetchedInvites,
          partnerships: activePartnerships,
          partnership: activePartnerships[0] || null,
          sharedChallenges: challenges,
          notifications: fetchedNotifs,
        }));
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
    const checkUpdates = () => {
      setState((prev) => {
        const archivedState = checkAndArchiveLeagues(prev);
        const habitPenalized = processHabitPenalties(archivedState);
        return processBadHabitNoReports(habitPenalized);
      });
    };
    checkUpdates();
    archiveTimer.current = window.setInterval(checkUpdates, 60000);
    return () => {
      if (archiveTimer.current) window.clearInterval(archiveTimer.current);
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
    setState((prev) => {
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
      return {
        ...prev,
        habits: prev.habits.filter((h) => h.id !== habitId),
        ...pointsUpdate,
      };
    });
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
              const updatedUser1Date = isUser1 ? (completed ? today : undefined) : target.user1DoneDate;
              const updatedUser2Date = !isUser1 ? (completed ? today : undefined) : target.user2DoneDate;

              const wereBothDoneBefore = target.user1DoneDate === today && target.user2DoneDate === today;
              const areBothDoneNow = updatedUser1Date === today && updatedUser2Date === today;

              let newStreak = target.jointStreak || 0;
              if (areBothDoneNow && !wereBothDoneBefore) {
                newStreak += 1;
              } else if (!areBothDoneNow && wereBothDoneBefore && newStreak > 0) {
                newStreak = Math.max(0, newStreak - 1);
              }

              const isCompleted = newStreak >= target.durationDays;
              const updated: SharedChallenge = {
                ...target,
                user1DoneDate: updatedUser1Date,
                user2DoneDate: updatedUser2Date,
                jointStreak: newStreak,
                status: isCompleted ? 'completed' : 'active',
              };

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
    setState((prev) => {
      const entry = prev.journalEntries.find((e) => e.id === entryId);
      if (!entry) return prev;

      let pointsUpdate: Pick<AppState, 'totalPoints' | 'pointsHistory'> = {
        totalPoints: prev.totalPoints,
        pointsHistory: prev.pointsHistory,
      };

      if (entry.pointsAwarded) {
        pointsUpdate = addPointsInternal(prev, -5, 'Journal entry deleted', 'journal');
      }

      return {
        ...prev,
        journalEntries: prev.journalEntries.filter((e) => e.id !== entryId),
        ...pointsUpdate,
      };
    });
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
    setState((prev) => {
      const target = prev.workouts.find((w) => w.id === workoutId);
      if (!target) return prev;
      let pointsUpdate = { totalPoints: prev.totalPoints, pointsHistory: prev.pointsHistory };
      if (target.pointsAwarded > 0) {
        pointsUpdate = addPointsInternal(prev, -target.pointsAwarded, `Workout deleted: ${target.type}`, 'exercise');
      }
      return {
        ...prev,
        workouts: prev.workouts.filter((w) => w.id !== workoutId),
        ...pointsUpdate,
      };
    });
  }, []);

  // --- MODULE 2: READING TRACKER ACTIONS ---
  const addBook = useCallback((title: string, author: string, totalPages: number, unit: 'pages' | 'chapters') => {
    const book: Book = {
      id: uid(),
      title: title.trim(),
      author: author.trim() || 'Unknown Author',
      totalPages: Math.max(1, totalPages),
      unit,
      currentPage: 0,
      isFinished: false,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, books: [book, ...prev.books] }));
    return book;
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
    setState((prev) => {
      const target = prev.books.find((b) => b.id === bookId);
      let pointsUpdate = {};
      if (target?.isFinished) {
        pointsUpdate = addPointsInternal(prev, -30, `Book deleted: ${target.title}`, 'reading');
      }
      return {
        ...prev,
        books: prev.books.filter((b) => b.id !== bookId),
        readingLogs: prev.readingLogs.filter((l) => l.bookId !== bookId),
        ...pointsUpdate,
      };
    });
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
    setState((prev) => {
      const target = prev.libraryBooks.find((lb) => lb.id === userBookId);
      if (!target) return prev;

      let pointsUpdate: Pick<AppState, 'totalPoints' | 'pointsHistory'> = {
        totalPoints: prev.totalPoints,
        pointsHistory: prev.pointsHistory,
      };
      if (target.pointsAwarded > 0) {
        pointsUpdate = addPointsInternal(
          prev,
          -target.pointsAwarded,
          `Book removed from library: ${target.title}`,
          'library_book_bonus'
        );
      }

      return {
        ...prev,
        libraryBooks: prev.libraryBooks.filter((lb) => lb.id !== userBookId),
        ...pointsUpdate,
      };
    });
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
    setState((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s.id !== skillId),
      skillLogs: prev.skillLogs.filter((l) => l.skillId !== skillId),
    }));
  }, []);

  const deleteSkillLog = useCallback((logId: string) => {
    setState((prev) => {
      const target = prev.skillLogs.find((s) => s.id === logId);
      let pointsUpdate = {};
      if (target && target.pointsAwarded > 0) {
        pointsUpdate = addPointsInternal(prev, -target.pointsAwarded, `Skill practice log deleted`, 'skill');
      }
      return {
        ...prev,
        skillLogs: prev.skillLogs.filter((s) => s.id !== logId),
        ...pointsUpdate,
      };
    });
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
    setState((prev) => {
      const newState = { ...prev, badHabits: [...prev.badHabits, bh] };
      persistState(newState);
      return newState;
    });
    return bh;
  }, []);

  const logBadHabitDay = useCallback((badHabitId: string, date: string, status: 'resisted' | 'occurred') => {
    setState((prev) => {
      try {
        const bh = prev.badHabits.find((b) => b.id === badHabitId);
        if (!bh || bh.isCompleted) return prev;

        // Lock check: Once logged for today, both actions lock for the rest of that day
        const existingLog = prev.badHabitLogs.find((l) => l.badHabitId === badHabitId && l.date === date);
        if (existingLog) return prev;

        // Determine point-eligibility based on creation order among active habits
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
        const newState: AppState = {
          ...prev,
          badHabitLogs: [newLog, ...filteredLogs],
          ...pointsUpdate,
        };

        console.log(`[BAD HABIT ACTION LOGGED: ${status.toUpperCase()}]`, {
          badHabitId,
          habitName: bh.name,
          date,
          status,
          pointsChange,
          newTotalPoints: newState.totalPoints,
          logId: newLog.id
        });

        // Immediate synchronous persistence to Supabase DB
        persistState(newState);
        return newState;
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
      // Automatic no-report penalty CANNOT be undone
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

      const newState: AppState = {
        ...prev,
        badHabitLogs: prev.badHabitLogs.filter((l) => !(l.badHabitId === badHabitId && l.date === today)),
        ...pointsUpdate,
      };

      // Immediate synchronous persistence to Supabase DB
      persistState(newState);
      return newState;
    });
  }, []);

  const deleteBadHabit = useCallback((badHabitId: string) => {
    setState((prev) => {
      const habitLogs = prev.badHabitLogs.filter((l) => l.badHabitId === badHabitId);
      const bh = prev.badHabits.find((b) => b.id === badHabitId);

      // Reverses ALL net points earned/lost through that habit
      const netPoints = habitLogs.reduce((sum, l) => sum + (l.pointsAwardedOrDeducted || 0), 0);

      let pointsUpdate = {};
      if (netPoints !== 0 && bh) {
        const reverseAmount = -netPoints;
        pointsUpdate = addPointsInternal(
          prev,
          reverseAmount,
          `Bad habit deleted (reversed net points): ${bh.name}`,
          'bad_habit_delete'
        );
      }

      const newState: AppState = {
        ...prev,
        badHabits: prev.badHabits.filter((b) => b.id !== badHabitId),
        badHabitLogs: prev.badHabitLogs.filter((l) => l.badHabitId !== badHabitId),
        ...pointsUpdate,
      };

      // Immediate synchronous persistence to Supabase DB
      persistState(newState);
      return newState;
    });
  }, []);

  const completeBadHabit = useCallback((badHabitId: string) => {
    setState((prev) => {
      const bh = prev.badHabits.find((b) => b.id === badHabitId);
      if (!bh) return prev;

      const newState: AppState = {
        ...prev,
        badHabits: prev.badHabits.map((b) =>
          b.id === badHabitId
            ? { ...b, isCompleted: true, completedAt: new Date().toISOString() }
            : b
        ),
      };

      // Immediate synchronous persistence to Supabase DB
      persistState(newState);
      return newState;
    });
  }, []);

  const deleteBadHabitLog = useCallback((badHabitId: string, date: string) => {
    setState((prev) => {
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
      return {
        ...prev,
        badHabitLogs: prev.badHabitLogs.filter((l) => !(l.badHabitId === badHabitId && l.date === date)),
        ...pointsUpdate,
      };
    });
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

      if (hoursElapsed >= 24 && !unlocked.includes('24h')) {
        unlocked.push('24h');
        addedPoints += 20;
        historyToAdd.push({ id: uid(), amount: 20, reason: 'Sobriety Milestone: 24 Hours Clean! 🎉', source: 'recovery_milestone', timestamp: new Date().toISOString() });
      }
      if (hoursElapsed >= 168 && !unlocked.includes('1w')) {
        unlocked.push('1w');
        addedPoints += 50;
        historyToAdd.push({ id: uid(), amount: 50, reason: 'Sobriety Milestone: 1 Week Clean! 🏅', source: 'recovery_milestone', timestamp: new Date().toISOString() });
      }
      if (hoursElapsed >= 720 && !unlocked.includes('1m')) {
        unlocked.push('1m');
        addedPoints += 150;
        historyToAdd.push({ id: uid(), amount: 150, reason: 'Sobriety Milestone: 1 Month Clean! 🏆', source: 'recovery_milestone', timestamp: new Date().toISOString() });
      }

      if (addedPoints === 0) return prev;

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
    setState((prev) => {
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
      return {
        ...prev,
        addictionTracker: null,
        cravingLogs: [],
        ...pointsUpdate,
      };
    });
  }, []);

  const deleteCravingLog = useCallback((logId: string) => {
    setState((prev) => ({
      ...prev,
      cravingLogs: prev.cravingLogs.filter((l) => l.id !== logId),
    }));
  }, []);

  // --- MODULE 7: PREFRONTAL CORTEX ACTIONS ---
  const logFocusSession = useCallback((taskName: string, durationMinutes: number, skillId?: string) => {
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

  const saveWeeklyGoal = useCallback((weekKey: string, goals: WeeklyGoalItem[], insights?: string, isReviewed?: boolean) => {
    setState((prev) => {
      const idx = prev.weeklyGoals.findIndex((w) => w.weekKey === weekKey);
      const existing = idx >= 0 ? prev.weeklyGoals[idx] : null;
      const wasReviewed = existing ? existing.isReviewed : false;

      let pointsUpdate = { totalPoints: prev.totalPoints, pointsHistory: prev.pointsHistory };
      if (isReviewed && !wasReviewed) {
        pointsUpdate = addPointsInternal(prev, 20, `Weekly goal review completed`, 'weekly_review');
      }

      const item: WeeklyGoal = {
        id: existing ? existing.id : uid(),
        weekKey,
        goals,
        insights: insights?.trim(),
        isReviewed: isReviewed ?? wasReviewed,
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
      };

      let newWeeklyGoals = [...prev.weeklyGoals];
      if (idx >= 0) {
        newWeeklyGoals[idx] = item;
      } else {
        newWeeklyGoals = [item, ...newWeeklyGoals];
      }

      return {
        ...prev,
        weeklyGoals: newWeeklyGoals,
        ...pointsUpdate,
      };
    });
  }, []);

  const deleteFocusLog = useCallback((logId: string) => {
    setState((prev) => {
      const target = prev.focusLogs.find((f) => f.id === logId);
      let pointsUpdate = {};
      if (target && target.pointsAwarded > 0) {
        pointsUpdate = addPointsInternal(prev, -target.pointsAwarded, `Focus session deleted: ${target.taskName}`, 'focus');
      }
      return {
        ...prev,
        focusLogs: prev.focusLogs.filter((f) => f.id !== logId),
        ...pointsUpdate,
      };
    });
  }, []);

  const deleteDecisionLog = useCallback((logId: string) => {
    setState((prev) => {
      const target = prev.decisionLogs.find((d) => d.id === logId);
      let ptsToDeduct = 0;
      if (target) {
        ptsToDeduct = target.isReflected ? 30 : 15;
      }
      let pointsUpdate = {};
      if (ptsToDeduct > 0 && target) {
        pointsUpdate = addPointsInternal(prev, -ptsToDeduct, `Decision log deleted: ${target.title}`, 'decision_journal');
      }
      return {
        ...prev,
        decisionLogs: prev.decisionLogs.filter((d) => d.id !== logId),
        ...pointsUpdate,
      };
    });
  }, []);

  const deleteEmotionLog = useCallback((logId: string) => {
    setState((prev) => {
      const target = prev.emotionLogs.find((e) => e.id === logId);
      let pointsUpdate = {};
      if (target) {
        pointsUpdate = addPointsInternal(prev, -5, `Emotion label deleted: ${target.emotion}`, 'emotion_label');
      }
      return {
        ...prev,
        emotionLogs: prev.emotionLogs.filter((e) => e.id !== logId),
        ...pointsUpdate,
      };
    });
  }, []);

  const deleteWeeklyGoalDoc = useCallback((weekKey: string) => {
    setState((prev) => {
      const target = prev.weeklyGoals.find((w) => w.weekKey === weekKey);
      let pointsUpdate = {};
      if (target?.isReviewed) {
        pointsUpdate = addPointsInternal(prev, -20, `Weekly review deleted for ${weekKey}`, 'weekly_review');
      }
      return {
        ...prev,
        weeklyGoals: prev.weeklyGoals.filter((w) => w.weekKey !== weekKey),
        ...pointsUpdate,
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

        const reflectionNotes: VisionReflectionNote[] = typeParams?.initialReflectionNote
          ? [{ id: uid(), date: new Date().toISOString(), note: typeParams.initialReflectionNote.trim() }]
          : [];

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
      const currentStreak = target.streakCount || 0;
      const newStreak = currentStreak + 1;

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
      const currentStreak = target.streakCount || 0;
      const newStreak = currentStreak + 1;

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
        n.id === noteId || n.date === noteId ? { ...n, note: newNoteText.trim() } : n
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
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      const newNote: VisionReflectionNote = {
        id: generateUUID(),
        date: new Date().toISOString(),
        note: note.trim(),
      };

      const existingNotes = target.reflectionNotes || [];
      updatedPlan = {
        ...target,
        reflectionNotes: [newNote, ...existingNotes],
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

  const deleteVisionReflectionNote = useCallback((planId: string, noteId: string) => {
    let updatedPlan: ImprovementPlan | null = null;

    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];

      const notes = target.reflectionNotes || [];
      const updatedNotes = notes.filter((n) => n.id !== noteId && n.date !== noteId);

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
  }, [updatePlanCopyCount]);

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
      if (nextState && (nextState as AppState).currentUser?.id) {
        saveUserDataToSupabase((nextState as AppState).currentUser!.id, nextState as AppState);
      }
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

    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;

      const target = prev.followedPlans[idx];
      const newNote: VisionReflectionNote = {
        id: uid(),
        date: new Date().toISOString(),
        note: note.trim(),
      };

      const existingNotes = target.reflectionNotes || [];
      updatedFollow = {
        ...target,
        reflectionNotes: [newNote, ...existingNotes],
      };

      const updatedFollows = [...prev.followedPlans];
      updatedFollows[idx] = updatedFollow;
      return { ...prev, followedPlans: updatedFollows };
    });

    if (updatedFollow) {
      syncFollowedPlanToSupabase(updatedFollow);
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
        n.id === noteId || n.date === noteId ? { ...n, note: newNoteText.trim() } : n
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

    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];

      const notes = target.reflectionNotes || [];
      const updatedNotes = notes.filter((n) => n.id !== noteId && n.date !== noteId);

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

  const deleteFollowedPlan = useCallback((followedPlanId: string) => {
    deleteFollowedPlanFromSupabase(followedPlanId);
    setState((prev) => {
      const nextState = {
        ...prev,
        followedPlans: prev.followedPlans.filter((f) => f.id !== followedPlanId),
      };
      if (nextState.currentUser?.id) {
        saveUserDataToSupabase(nextState.currentUser.id, nextState);
      }
      return nextState;
    });
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
      if (nextState && (nextState as AppState).currentUser?.id) {
        saveUserDataToSupabase((nextState as AppState).currentUser!.id, nextState as AppState);
      }
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

      setState((prev) => {
        const nextState = {
          ...prev,
          improvementPlans: prev.improvementPlans.filter((p) => p.id !== planId),
          followedPlans: prev.followedPlans.filter((f) => f.originalPlanId !== planId),
        };
        if (session.user.id) {
          saveUserDataToSupabase(session.user.id, nextState);
        }
        return nextState;
      });
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

      const targetUserId = profileData.id;
      const targetUsername = profileData.username;
      const targetAvatar = profileData.avatar || '🧑';

      if (targetUserId === state.currentUser?.id) {
        throw new Error("You can't send an accountability invite to yourself.");
      }

      const targetPartnerships = await fetchPartnershipsSupabase(targetUserId);
      if (targetPartnerships.length >= 5) {
        throw new Error(`The user '${targetUsername}' has reached the maximum limit of 5 accountability partners.`);
      }

      const alreadyPending = state.partnerInvites.some(
        (i) => i.toUserId === targetUserId && i.status === 'pending'
      );
      if (alreadyPending) {
        throw new Error(`An invite to '${targetUsername}' (ID: ${trimmedUid}) is already pending.`);
      }

      const invite: PartnerInvite = {
        id: crypto.randomUUID(),
        fromUserId: state.currentUser?.id || 'user_from',
        fromUsername: state.username,
        fromAvatar: state.currentUser?.avatar || '🧑',
        toUserId: targetUserId,
        toUsername: targetUsername,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      await sendPartnerInviteSupabase(invite);

      const notifData = {
        recipientId: targetUserId,
        actorId: state.currentUser?.id,
        actorUsername: state.username,
        actorAvatar: state.currentUser?.avatar || '🧑',
        type: 'partner_invite' as const,
        title: 'New Partner Invite',
        message: `${state.username} sent you an accountability partner invite!`,
        payload: { inviteId: invite.id },
      };

      const createdNotif = await createNotificationSupabase(notifData);
      syncBroadcaster.broadcast('PARTNER_INVITE_SENT', { invite, notification: createdNotif || notifData });

      setState((prev) => ({
        ...prev,
        partnerInvites: [invite, ...prev.partnerInvites.filter((i) => i.id !== invite.id)],
      }));

      return invite;
    },
    [state.username, state.partnership, state.partnerInvites, state.currentUser]
  );

  const acceptPartnerInvite = useCallback(
    async (inviteId: string) => {
      if ((state.partnerships || []).length >= 5) {
        throw new Error("You've reached the maximum limit of 5 accountability partners. Remove one to accept another.");
      }
      const invite = state.partnerInvites.find((i) => i.id === inviteId);
      const fromId = invite?.fromUserId || crypto.randomUUID();
      const fromUsername = invite?.fromUsername || 'Partner';
      const toId = state.currentUser?.id || crypto.randomUUID();
      const toUsername = state.username;

      const inviterPartnerships = await fetchPartnershipsSupabase(fromId);
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
        payload: { partnershipId },
      });

      setState((prev) => {
        const updatedInvites = prev.partnerInvites.filter((i) => i.id !== inviteId);
        const updatedPartnerships = [partnership, ...(prev.partnerships || []).filter((p) => p.id !== partnership.id)];
        return {
          ...prev,
          partnerInvites: updatedInvites,
          partnerships: updatedPartnerships,
          partnership: updatedPartnerships[0] || null,
        };
      });
    },
    [state.partnerInvites, state.partnerships, state.currentUser, state.username]
  );

  const cancelPartnerInvite = useCallback(async (inviteId: string) => {
    await deletePartnerInviteSupabase(inviteId);
    syncBroadcaster.broadcast('PARTNER_INVITE_CANCELLED', { inviteId });
    setState((prev) => ({
      ...prev,
      partnerInvites: prev.partnerInvites.filter((i) => i.id !== inviteId),
    }));
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
        payload: { inviteId },
      });
    }

    await deletePartnerInviteSupabase(inviteId);
    setState((prev) => ({
      ...prev,
      partnerInvites: prev.partnerInvites.filter((i) => i.id !== inviteId),
    }));
  }, [state.partnerInvites, state.username, state.currentUser]);

  const endPartnership = useCallback(async (partnershipId?: string) => {
    const targetId = partnershipId || state.partnership?.id || state.partnerships[0]?.id;
    if (targetId) {
      await deletePartnershipSupabase(targetId);
    }
    syncBroadcaster.broadcast('PARTNER_ENDED', { partnershipId: targetId });
    setState((prev) => {
      const updatedPartnerships = (prev.partnerships || []).filter((p) => p.id !== targetId);
      return {
        ...prev,
        partnerships: updatedPartnerships,
        partnership: updatedPartnerships[0] || null,
        sharedChallenges: prev.sharedChallenges.filter((c) => c.partnershipId !== targetId),
      };
    });
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
    const streakDays = habitsCompletedCount === 0 ? 0 : (rawStats.streakDays || 0);

    return {
      totalPoints: profile.total_points || 0,
      stats: {
        ...rawStats,
        streakDays,
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
    (
      title: string,
      durationDays: number,
      user1Category: SharedChallengeCategory = 'habit',
      user1Target: string = '',
      user2Category: SharedChallengeCategory = 'habit',
      user2Target: string = '',
      targetPartnershipId?: string
    ) => {
      setState((prev) => {
        const pId = targetPartnershipId || prev.partnership?.id || prev.partnerships[0]?.id;
        if (!pId) return prev;

        const challenge: SharedChallenge = {
          id: crypto.randomUUID(),
          partnershipId: pId,
          title: title.trim(),
          targetHabitName: user1Target || title.trim(),
          durationDays,
          jointStreak: 0,
          user1Category,
          user1Target: user1Target.trim(),
          user2Category,
          user2Target: user2Target.trim(),
          status: 'active',
          createdAt: new Date().toISOString(),
        };

        saveSharedChallengeSupabase(challenge);
        syncBroadcaster.broadcast('CHALLENGE_UPDATED', challenge);

        return {
          ...prev,
          sharedChallenges: [challenge, ...prev.sharedChallenges],
        };
      });
    },
    []
  );

  const deleteSharedChallenge = useCallback(async (challengeId: string) => {
    await deleteSharedChallengeSupabase(challengeId);
    syncBroadcaster.broadcast('CHALLENGE_DELETED', { challengeId });
    setState((prev) => ({
      ...prev,
      sharedChallenges: prev.sharedChallenges.filter((c) => c.id !== challengeId),
    }));
  }, []);

  const logSharedChallengeHabit = useCallback((challengeId: string, forcedState?: boolean) => {
    const today = todayKey();
    setState((prev) => {
      const idx = prev.sharedChallenges.findIndex((c) => c.id === challengeId);
      if (idx === -1) return prev;
      const target = prev.sharedChallenges[idx];

      const challengePartnership =
        (prev.partnerships || []).find((p) => p.id === target.partnershipId) || prev.partnership;

      const isUser1 = challengePartnership
        ? (prev.currentUser?.id && challengePartnership.user1Id === prev.currentUser.id) ||
          challengePartnership.user1Username.toLowerCase() === prev.username.toLowerCase()
        : true;

      const currentDoneDate = isUser1 ? target.user1DoneDate : target.user2DoneDate;

      let isDoneToday: boolean;
      if (typeof forcedState === 'boolean') {
        isDoneToday = forcedState;
      } else {
        isDoneToday = currentDoneDate !== today;
      }

      const newCurrentDoneDate = isDoneToday ? today : undefined;
      const updatedUser1Date = isUser1 ? newCurrentDoneDate : target.user1DoneDate;
      const updatedUser2Date = !isUser1 ? newCurrentDoneDate : target.user2DoneDate;

      const wereBothDoneBefore = target.user1DoneDate === today && target.user2DoneDate === today;
      const areBothDoneNow = updatedUser1Date === today && updatedUser2Date === today;

      let newStreak = target.jointStreak || 0;
      if (areBothDoneNow && !wereBothDoneBefore) {
        newStreak += 1;
      } else if (!areBothDoneNow && wereBothDoneBefore && newStreak > 0) {
        newStreak = Math.max(0, newStreak - 1);
      }

      const isCompleted = newStreak >= target.durationDays;

      const updated: SharedChallenge = {
        ...target,
        user1DoneDate: updatedUser1Date,
        user2DoneDate: updatedUser2Date,
        jointStreak: newStreak,
        status: isCompleted ? 'completed' : 'active',
      };

      const updatedChallenges = [...prev.sharedChallenges];
      updatedChallenges[idx] = updated;

      saveSharedChallengeSupabase(updated);
      syncBroadcaster.broadcast('CHALLENGE_UPDATED', updated);

      if (challengePartnership) {
        const partnerUserId = isUser1 ? challengePartnership.user2Id : challengePartnership.user1Id;
        const partnerUsername = isUser1 ? challengePartnership.user2Username : challengePartnership.user1Username;

        if (isDoneToday && !wereBothDoneBefore) {
          createNotificationSupabase({
            recipientId: partnerUserId,
            actorId: prev.currentUser?.id,
            actorUsername: prev.username,
            actorAvatar: prev.currentUser?.avatar || '🧑',
            type: 'partner_nudge',
            title: 'Partner Completed Challenge Today',
            message: `${prev.username} completed today's target for "${target.title}"! Don't break your joint streak!`,
            payload: { challengeId: target.id },
          });
        }

        if (isCompleted) {
          createNotificationSupabase({
            recipientId: partnerUserId,
            actorId: prev.currentUser?.id,
            actorUsername: prev.username,
            actorAvatar: prev.currentUser?.avatar || '🧑',
            type: 'challenge_completed',
            title: 'Shared Challenge Completed! 🎉',
            message: `Congratulations! You and ${prev.username} completed the "${target.title}" challenge!`,
            payload: { challengeId: target.id },
          });
        }
      }

      return {
        ...prev,
        sharedChallenges: updatedChallenges,
      };
    });
  }, []);

  const dismissPartnerNotification = useCallback((notifId: string) => {
    setState((prev) => ({
      ...prev,
      partnerNotifications: prev.partnerNotifications.filter((n) => n.id !== notifId),
    }));
  }, []);

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
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).filter((n) => n.id !== notificationId),
    }));
  }, []);

  // Multi-user & Seed Competitor League Helper
  const getLeagueData = useCallback(
    (type: LeagueType) => {
      const start = getLeaguePeriodStart(type);
      const userPoints = calculatePeriodPoints(state.pointsHistory, start, new Date());

      const highestStreakInfo = getHighestUserStreak(state);
      const streakDays = highestStreakInfo.days;
      const streakSource = highestStreakInfo.source;

      const habitsCompletedCount = state.habits.reduce((acc, h) => acc + (h.completions?.length || 0), 0);
      const exerciseMinutes = state.workouts.reduce((sum, w) => sum + w.durationMinutes, 0);
      const booksRead = state.books.filter((b) => b.isFinished).length;
      const skillsPracticedCount = state.skillLogs.length;

      const userStats = {
        streakDays,
        streakSource: streakDays > 0 ? streakSource : undefined,
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
    [state.pointsHistory, state.currentUser, state.username, state.totalPoints, state.habits, state.journalEntries, state.workouts, state.books, state.skillLogs]
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
    getLeagueData,
    getPublicImprovementPlans,
    // New Module Actions
    logWorkout,
    deleteWorkout,
    addBook,
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
    deleteBadHabitLog,
    setAddictionTracker,
    deleteAddictionTracker,
    resetAddictionStreak,
    checkAddictionMilestones,
    logCraving,
    deleteCravingLog,
    logFocusSession,
    deleteFocusLog,
    addDecision,
    reflectDecision,
    deleteDecisionLog,
    logEmotion,
    deleteEmotionLog,
    saveWeeklyGoal,
    deleteWeeklyGoalDoc,
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
    dismissPartnerNotification,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotification,
  };
}

export type AppStore = ReturnType<typeof useAppState>;

function checkAndArchiveLeagues(state: AppState): AppState {
  const now = new Date();
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
