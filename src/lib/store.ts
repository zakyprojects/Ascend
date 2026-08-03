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
} from '@/types';
import { findCuratedBook } from './books';
import { uid, generateUUID, periodKey, todayKey } from './dates';
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
  fetchProfileByUidFromSupabase,
} from './auth';
import { hydrateUserSession } from './authSession';
import { processHabitPenalties, getMissPenaltyMultiplier } from './habitPenalties';
import {
  supabase,
  isSupabaseConfigured,
  syncBroadcaster,
  syncPlanToSupabase,
  sendPartnerInviteSupabase,
  fetchUserDataFromSupabase,
  saveUserDataToSupabase,
  fetchAllProfilesFromSupabase,
  fetchProfileByUsernameFromSupabase,
  fetchPublicPlansFromSupabase,
  fetchPartnerInvitesSupabase,
  savePartnershipSupabase,
  fetchPartnershipSupabase,
  deletePartnershipSupabase,
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
  return {
    ...DEFAULT_STATE,
    ...st,
    currentUser: profile,
    username: profile ? profile.username : (st.username ?? 'Guest User'),
    habits: st.habits ?? [],
    journalEntries: st.journalEntries ?? [],
    totalPoints: st.totalPoints ?? 0,
    pointsHistory: st.pointsHistory ?? [],
    leagueArchives: st.leagueArchives ?? [],
    readLessonIds: st.readLessonIds ?? [],
    workouts: st.workouts ?? [],
    books: st.books ?? [],
    readingLogs: st.readingLogs ?? [],
    skills: st.skills ?? [],
    skillLogs: st.skillLogs ?? [],
    badHabits: st.badHabits ?? [],
    badHabitLogs: st.badHabitLogs ?? [],
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

function addPointsInternal(prev: AppState, amount: number, reason: string, source: string): Pick<AppState, 'totalPoints' | 'pointsHistory'> {
  return {
    totalPoints: Math.max(0, prev.totalPoints + amount),
    pointsHistory: [
      {
        id: uid(),
        amount,
        reason,
        source,
        timestamp: new Date().toISOString(),
      },
      ...prev.pointsHistory,
    ].slice(0, 500),
  };
}

export function useAppState() {
  const [state, setState] = useState<AppState>(loadInitialState);
  const archiveTimer = useRef<number | null>(null);

  useEffect(() => {
    persistState(state);
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
          (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') &&
          session?.user
        ) {
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
              setState(sanitizeLoadedState(hydratedState, user));
            }
          } catch (e) {
            console.error('Error hydrating auth session:', e);
            // Don't leave user stuck — if hydration fails or times out,
            // build a minimal profile from what we have and let them in
            if (mounted) {
              const fallbackUser: import('@/types').UserProfile = {
                id: userId,
                email,
                username: session.user.user_metadata?.username || email.split('@')[0],
                avatar: session.user.user_metadata?.avatar || '🧑',
                createdAt: session.user.created_at || new Date().toISOString(),
                isProfilePublic: true,
              };
              setState((prev) => {
                if (prev.currentUser?.id === userId) return prev;
                return sanitizeLoadedState({ ...DEFAULT_STATE, currentUser: fallbackUser, username: fallbackUser.username }, fallbackUser);
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
          // If sent to current user
          if (payload.toUsername.toLowerCase() === prev.username.toLowerCase()) {
            const exists = prev.partnerInvites.some((i) => i.id === payload.id);
            if (!exists) {
              return { ...prev, partnerInvites: [payload, ...prev.partnerInvites] };
            }
          }
        }

        if (event === 'PARTNER_ACCEPTED') {
          if (payload.user1Username === prev.username || payload.user2Username === prev.username) {
            return { ...prev, partnership: payload };
          }
        }

        if (event === 'PARTNER_ENDED') {
          if (
            prev.partnership &&
            (prev.partnership.user1Username === prev.username || prev.partnership.user2Username === prev.username)
          ) {
            return { ...prev, partnership: null, sharedChallenges: [] };
          }
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

        return prev;
      });
    });

    return () => unsubscribe();
  }, []);

  // Check for league period rollovers and missed-habit penalties on mount and every minute
  useEffect(() => {
    const checkUpdates = () => {
      setState((prev) => {
        const archivedState = checkAndArchiveLeagues(prev);
        return processHabitPenalties(archivedState);
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
    (amount: number, reason: string, source: string) => {
      setState((prev) => ({
        ...prev,
        ...addPointsInternal(prev, amount, reason, source),
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
    setState((prev) => ({
      ...prev,
      habits: prev.habits.filter((h) => h.id !== habitId),
    }));
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
        if (!habit) return { ...prev, habits };

        let pointsUpdate: Pick<AppState, 'totalPoints' | 'pointsHistory'> = { totalPoints: prev.totalPoints, pointsHistory: prev.pointsHistory };

        if (completed && habit.isPreset && habit.points > 0) {
          pointsUpdate = addPointsInternal(prev, habit.points, `Habit completed: ${habit.name}`, 'habit');
        } else if (!completed && habit.isPreset && habit.points > 0) {
          pointsUpdate = addPointsInternal(prev, -habit.points, `Habit un-completed: ${habit.name}`, 'habit');
        }

        return { ...prev, habits, ...pointsUpdate };
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
    setState((prev) => ({
      ...prev,
      books: prev.books.filter((b) => b.id !== bookId),
      readingLogs: prev.readingLogs.filter((l) => l.bookId !== bookId),
    }));
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

  // --- MODULE 4: BAD HABIT REDUCTION TRACKER ACTIONS ---
  const addBadHabit = useCallback((name: string) => {
    const bh: BadHabit = {
      id: uid(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, badHabits: [...prev.badHabits, bh] }));
    return bh;
  }, []);

  const logBadHabitDay = useCallback((badHabitId: string, date: string, status: 'resisted' | 'occurred') => {
    setState((prev) => {
      const bh = prev.badHabits.find((b) => b.id === badHabitId);
      if (!bh) return prev;

      const existingLog = prev.badHabitLogs.find((l) => l.badHabitId === badHabitId && l.date === date);

      let currentTotalPoints = prev.totalPoints;
      let currentHistory = prev.pointsHistory;
      if (existingLog) {
        currentTotalPoints = Math.max(0, currentTotalPoints - existingLog.pointsAwardedOrDeducted);
      }

      let consecutiveOccurrences = 0;
      let pointsChange = 0;
      let reason = '';

      if (status === 'resisted') {
        pointsChange = 10;
        reason = `Bad habit resisted: ${bh.name}`;
      } else {
        const pastLogs = prev.badHabitLogs
          .filter((l) => l.badHabitId === badHabitId && l.date < date)
          .sort((a, b) => b.date.localeCompare(a.date));

        consecutiveOccurrences = 1;
        for (const log of pastLogs) {
          if (log.status === 'occurred') {
            consecutiveOccurrences++;
          } else {
            break;
          }
        }

        const multiplier = getMissPenaltyMultiplier(consecutiveOccurrences, currentTotalPoints);
        const penaltyAmount = Math.round(10 * multiplier);
        pointsChange = -penaltyAmount;
        reason = `Bad habit occurred (${multiplier}x penalty): ${bh.name}`;
      }

      const pointsUpdate = addPointsInternal(
        { ...prev, totalPoints: currentTotalPoints, pointsHistory: currentHistory },
        pointsChange,
        reason,
        status === 'resisted' ? 'bad_habit_resisted' : 'bad_habit_occurred'
      );

      const newLog: BadHabitLog = {
        id: existingLog ? existingLog.id : uid(),
        badHabitId,
        date,
        status,
        consecutiveOccurrences: status === 'occurred' ? consecutiveOccurrences : 0,
        pointsAwardedOrDeducted: pointsChange,
        createdAt: new Date().toISOString(),
      };

      const filteredLogs = prev.badHabitLogs.filter((l) => !(l.badHabitId === badHabitId && l.date === date));

      return {
        ...prev,
        badHabitLogs: [newLog, ...filteredLogs],
        ...pointsUpdate,
      };
    });
  }, []);

  const deleteBadHabit = useCallback((badHabitId: string) => {
    setState((prev) => ({
      ...prev,
      badHabits: prev.badHabits.filter((b) => b.id !== badHabitId),
      badHabitLogs: prev.badHabitLogs.filter((l) => l.badHabitId !== badHabitId),
    }));
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

  // --- SOCIAL FEATURE 1: PERSONAL IMPROVEMENT PLANS ACTIONS ---
  const createImprovementPlan = useCallback(
    (title: string, description: string, isPublic: boolean, stepTitles: string[], category?: string) => {
      const steps: PlanStep[] = stepTitles
        .filter((t) => t.trim().length > 0)
        .map((t, idx) => ({
          id: uid(),
          title: t.trim(),
          orderIndex: idx,
          completed: false,
        }));

      let newPlan: ImprovementPlan | null = null;
      setState((prev) => {
        newPlan = {
          id: generateUUID(),
          creatorId: prev.currentUser?.id || generateUUID(),
          creatorUsername: prev.username,
          creatorAvatar: prev.currentUser?.avatar || '🧑',
          title: title.trim(),
          description: description.trim(),
          category: category?.trim() || 'Personal Growth',
          isPublic,
          steps,
          copyCount: 0,
          createdAt: new Date().toISOString(),
        };

        syncBroadcaster.broadcast('PLAN_CREATED', newPlan);
        if (newPlan) syncPlanToSupabase(newPlan);

        return {
          ...prev,
          improvementPlans: [newPlan, ...prev.improvementPlans],
        };
      });
      return newPlan;
    },
    []
  );

  const togglePlanVisibility = useCallback((planId: string) => {
    setState((prev) => {
      const idx = prev.improvementPlans.findIndex((p) => p.id === planId);
      if (idx === -1) return prev;
      const target = prev.improvementPlans[idx];
      const updated = { ...target, isPublic: !target.isPublic };
      const updatedPlans = [...prev.improvementPlans];
      updatedPlans[idx] = updated;
      syncBroadcaster.broadcast('PLAN_UPDATED', updated);
      syncPlanToSupabase(updated);
      return { ...prev, improvementPlans: updatedPlans };
    });
  }, []);

  const copyPublicPlan = useCallback((originalPlan: ImprovementPlan) => {
    setState((prev) => {
      const updatedPlans = prev.improvementPlans.map((p) =>
        p.id === originalPlan.id ? { ...p, copyCount: p.copyCount + 1 } : p
      );

      const stepsCopy: PlanStep[] = originalPlan.steps.map((s) => ({
        ...s,
        id: uid(),
        completed: false,
      }));

      const followedPlan: UserPlanFollow = {
        id: uid(),
        userId: prev.currentUser?.id || 'guest_user',
        originalPlanId: originalPlan.id,
        title: originalPlan.title,
        description: originalPlan.description,
        steps: stepsCopy,
        isCompleted: false,
        pointsAwarded: 0,
        createdAt: new Date().toISOString(),
      };

      return {
        ...prev,
        improvementPlans: updatedPlans,
        followedPlans: [followedPlan, ...prev.followedPlans],
      };
    });
  }, []);

  const completePlanStep = useCallback((followedPlanId: string, stepId: string) => {
    setState((prev) => {
      const idx = prev.followedPlans.findIndex((f) => f.id === followedPlanId);
      if (idx === -1) return prev;
      const target = prev.followedPlans[idx];

      const stepIdx = target.steps.findIndex((s) => s.id === stepId);
      if (stepIdx === -1) return prev;
      const targetStep = target.steps[stepIdx];

      const isNowCompleted = !targetStep.completed;
      const updatedSteps = [...target.steps];
      updatedSteps[stepIdx] = { ...targetStep, completed: isNowCompleted };

      const allDone = updatedSteps.length > 0 && updatedSteps.every((s) => s.completed);

      let pointsUpdate = { totalPoints: prev.totalPoints, pointsHistory: prev.pointsHistory };
      if (isNowCompleted) {
        pointsUpdate = addPointsInternal(prev, 10, `Completed plan step: ${targetStep.title}`, 'plan_step');
      }

      const updatedFollowed: UserPlanFollow = {
        ...target,
        steps: updatedSteps,
        isCompleted: allDone,
      };

      const updatedList = [...prev.followedPlans];
      updatedList[idx] = updatedFollowed;

      return {
        ...prev,
        followedPlans: updatedList,
        ...pointsUpdate,
      };
    });
  }, []);

  const deletePlan = useCallback((planId: string) => {
    setState((prev) => ({
      ...prev,
      improvementPlans: prev.improvementPlans.filter((p) => p.id !== planId),
      followedPlans: prev.followedPlans.filter((f) => f.id !== planId && f.originalPlanId !== planId),
    }));
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

      if (state.partnership) {
        throw new Error('You already have an active accountability partner.');
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
      syncBroadcaster.broadcast('PARTNER_INVITE_SENT', invite);

      setState((prev) => ({
        ...prev,
        partnerInvites: [invite, ...prev.partnerInvites.filter((i) => i.id !== invite.id)],
      }));

      return invite;
    },
    [state.username, state.partnership, state.partnerInvites, state.currentUser]
  );

  const acceptPartnerInvite = useCallback(async (inviteId: string) => {
    const invite = state.partnerInvites.find((i) => i.id === inviteId);
    if (!invite) return;

    const partnership: Partnership = {
      id: crypto.randomUUID(),
      user1Id: invite.fromUserId,
      user1Username: invite.fromUsername,
      user2Id: state.currentUser?.id || 'user_current',
      user2Username: state.username,
      pairedAt: new Date().toISOString(),
    };

    await savePartnershipSupabase(partnership);
    syncBroadcaster.broadcast('PARTNER_ACCEPTED', partnership);

    setState((prev) => {
      const updatedInvites = prev.partnerInvites.map((i) =>
        i.id === inviteId ? ({ ...i, status: 'accepted' } as PartnerInvite) : i
      );
      return {
        ...prev,
        partnerInvites: updatedInvites,
        partnership,
      };
    });
  }, [state.partnerInvites, state.currentUser, state.username]);

  const declinePartnerInvite = useCallback((inviteId: string) => {
    setState((prev) => ({
      ...prev,
      partnerInvites: prev.partnerInvites.map((i) =>
        i.id === inviteId ? ({ ...i, status: 'declined' } as PartnerInvite) : i
      ),
    }));
  }, []);

  const endPartnership = useCallback(async () => {
    if (state.partnership) {
      await deletePartnershipSupabase(state.partnership.id);
    }
    syncBroadcaster.broadcast('PARTNER_ENDED', {});
    setState((prev) => ({
      ...prev,
      partnership: null,
      sharedChallenges: [],
    }));
  }, [state.partnership]);

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
    return {
      totalPoints: profile.total_points || 0,
      stats: profile.stats || { streakDays: 0, habitsCompletedCount: 0 },
      avatar: profile.avatar || '🧑',
    };
  }, []);

  const createSharedChallenge = useCallback((targetHabitName: string, durationDays: number) => {
    setState((prev) => {
      if (!prev.partnership) return prev;

      const challenge: SharedChallenge = {
        id: uid(),
        partnershipId: prev.partnership.id,
        title: `Joint ${durationDays}-Day Challenge: ${targetHabitName}`,
        targetHabitName: targetHabitName.trim(),
        durationDays,
        jointStreak: 0,
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      syncBroadcaster.broadcast('CHALLENGE_UPDATED', challenge);

      return {
        ...prev,
        sharedChallenges: [challenge, ...prev.sharedChallenges],
      };
    });
  }, []);

  const logSharedChallengeHabit = useCallback((challengeId: string) => {
    const date = todayKey();
    setState((prev) => {
      const idx = prev.sharedChallenges.findIndex((c) => c.id === challengeId);
      if (idx === -1) return prev;
      const target = prev.sharedChallenges[idx];
      if (target.status !== 'active') return prev;

      const isUser1 = prev.partnership?.user1Username === prev.username;
      const updatedUser1Date = isUser1 ? date : target.user1DoneDate;
      const updatedUser2Date = !isUser1 ? date : target.user2DoneDate;

      let streak = target.jointStreak;
      if (updatedUser1Date === date && updatedUser2Date === date) {
        streak += 1;
      }

      const isCompleted = streak >= target.durationDays;

      const updated: SharedChallenge = {
        ...target,
        user1DoneDate: updatedUser1Date,
        user2DoneDate: updatedUser2Date,
        jointStreak: streak,
        status: isCompleted ? 'completed' : 'active',
      };

      const updatedChallenges = [...prev.sharedChallenges];
      updatedChallenges[idx] = updated;

      syncBroadcaster.broadcast('CHALLENGE_UPDATED', updated);

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

  // Multi-user & Seed Competitor League Helper
  const getLeagueData = useCallback(
    (type: LeagueType) => {
      const start = getLeaguePeriodStart(type);
      const userPoints = calculatePeriodPoints(state.pointsHistory, start, new Date());

      const habitsCompletedCount = state.habits.reduce((acc, h) => acc + (h.completions?.length || 0), 0);
      const streakDays = Math.min(30, Math.floor(habitsCompletedCount / 2) + 1);

      const exerciseMinutes = state.workouts.reduce((sum, w) => sum + w.durationMinutes, 0);
      const booksRead = state.books.filter((b) => b.isFinished).length;
      const skillsPracticedCount = state.skillLogs.length;

      const userStats = {
        streakDays,
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
    addBadHabit,
    logBadHabitDay,
    deleteBadHabit,
    setAddictionTracker,
    resetAddictionStreak,
    checkAddictionMilestones,
    logCraving,
    logFocusSession,
    addDecision,
    reflectDecision,
    logEmotion,
    saveWeeklyGoal,
    // Self Improvement Books Library Actions
    addCuratedBookToLibrary,
    addCustomBookToLibrary,
    updateUserBookStatus,
    removeBookFromLibrary,
    getUserBookStatus,
    // Social Features Actions
    createImprovementPlan,
    togglePlanVisibility,
    copyPublicPlan,
    completePlanStep,
    deletePlan,
    sendPartnerInvite,
    acceptPartnerInvite,
    declinePartnerInvite,
    endPartnership,
    getPartnerProfileStats,
    createSharedChallenge,
    logSharedChallengeHabit,
    dismissPartnerNotification,
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
