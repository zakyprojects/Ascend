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
  ImprovementPlan,
  UserPlanFollow,
  PartnerInvite,
  Partnership,
  SharedChallenge,
  AppNotification,
  DEFAULT_STATE,
} from '@/types';
import { mergeSharedChallenge } from './pactLifecycle';

function mergeEntityArrays<T extends { id?: string; createdAt?: string }>(
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
        const existingTime = existing.createdAt || '';
        const incomingTime = item.createdAt || '';
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
            refMap.set(r.id, { ...exR, ...r });
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
    const compositeKey = `${log.badHabitId}_${log.date}`;
    if (tombstoneSet.has(compositeKey)) return;

    const key = log.id || compositeKey;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, log);
    } else {
      const existingTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
      const incomingTime = log.createdAt ? new Date(log.createdAt).getTime() : 0;
      if (incomingTime >= existingTime) {
        map.set(key, log);
      }
    }
  };

  baseList.forEach(processLog);
  incomingList.forEach(processLog);

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

function mergeLeagueArchives(
  baseList: LeagueArchive[] = [],
  incomingList: LeagueArchive[] = []
): LeagueArchive[] {
  const map = new Map<string, LeagueArchive>();

  for (const item of baseList) {
    if (!item) continue;
    const key = `${item.type}_${item.periodLabel}_${item.archivedAt}`;
    map.set(key, item);
  }

  for (const item of incomingList) {
    if (!item) continue;
    const key = `${item.type}_${item.periodLabel}_${item.archivedAt}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.archivedAt || 0).getTime() - new Date(a.archivedAt || 0).getTime()
  );
}

export function mergeAppState(baseState: AppState, incomingState: AppState): AppState {
  if (!baseState) return incomingState || DEFAULT_STATE;
  if (!incomingState) return baseState || DEFAULT_STATE;

  // 1. Tombstones union and cap
  const tombstoneSet = new Set<string>([
    ...(baseState.deletedEntityIds || []),
    ...(incomingState.deletedEntityIds || []),
  ]);
  const mergedDeletedEntityIds = Array.from(tombstoneSet).slice(-500);

  // 2. Habits (merge completions, filter tombstones)
  const habits = mergeEntityArrays(
    baseState.habits || [],
    incomingState.habits || [],
    tombstoneSet,
    (baseH: Habit, incH: Habit) => {
      const allCompletions = Array.from(new Set([...(baseH.completions || []), ...(incH.completions || [])]));
      const baseTime = baseH.createdAt || '';
      const incTime = incH.createdAt || '';
      const primary = incTime >= baseTime ? incH : baseH;
      const secondary = incTime >= baseTime ? baseH : incH;
      return {
        ...secondary,
        ...primary,
        completions: allCompletions,
      };
    }
  );

  // 3. Journal entries
  const journalEntries = mergeEntityArrays(
    baseState.journalEntries || [],
    incomingState.journalEntries || [],
    tombstoneSet
  );

  // 4. Points history & Total points
  const pointsHistory = mergeEntityArrays(
    baseState.pointsHistory || [],
    incomingState.pointsHistory || [],
    tombstoneSet
  ).sort((a: PointsEntry, b: PointsEntry) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeB - timeA;
  });

  const sumPoints = pointsHistory.reduce((acc, p) => acc + (p.amount || 0), 0);
  const totalPoints = Math.max(0, baseState.totalPoints || 0, incomingState.totalPoints || 0, sumPoints);

  // 5. Workouts
  const workouts = mergeEntityArrays(
    baseState.workouts || [],
    incomingState.workouts || [],
    tombstoneSet
  );

  // 6. Books & Reading Logs
  const books = mergeEntityArrays(
    baseState.books || [],
    incomingState.books || [],
    tombstoneSet
  );

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
  const libraryBooks = mergeEntityArrays(
    baseState.libraryBooks || [],
    incomingState.libraryBooks || [],
    tombstoneSet
  );

  // 13. Social Plans & Follows
  const improvementPlans = mergeEntityArrays(
    baseState.improvementPlans || [],
    incomingState.improvementPlans || [],
    tombstoneSet,
    (baseP: ImprovementPlan, incP: ImprovementPlan) => {
      const baseTime = baseP.createdAt || '';
      const incTime = incP.createdAt || '';
      const primary = incTime >= baseTime ? incP : baseP;
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

  const currentUser = incomingState.currentUser || baseState.currentUser || null;
  const username = (currentUser && currentUser.username) || incomingState.username || baseState.username || 'Guest User';

  const addictionTracker = incomingState.addictionTracker !== undefined
    ? incomingState.addictionTracker
    : baseState.addictionTracker;

  return {
    ...DEFAULT_STATE,
    ...baseState,
    ...incomingState,
    currentUser,
    username,
    totalPoints,
    pointsHistory,
    habits,
    journalEntries,
    workouts,
    exerciseGoal: incomingState.exerciseGoal !== undefined ? incomingState.exerciseGoal : baseState.exerciseGoal,
    books,
    readingLogs,
    readingGoal: incomingState.readingGoal !== undefined ? incomingState.readingGoal : baseState.readingGoal,
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
    deletedEntityIds: mergedDeletedEntityIds,
  };
}
