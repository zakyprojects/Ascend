import type { AppState } from '@/types';

export interface UserDataWeight {
  itemCount: number;
  arrayBreakdown: Record<string, number>;
}

export function computeStateDataWeight(state: Partial<AppState> | null | undefined): UserDataWeight {
  if (!state) return { itemCount: 0, arrayBreakdown: {} };

  const arrayBreakdown: Record<string, number> = {
    habits: state.habits?.length || 0,
    journalEntries: state.journalEntries?.length || 0,
    pointsHistory: state.pointsHistory?.length || 0,
    leagueArchives: state.leagueArchives?.length || 0,
    readLessonIds: state.readLessonIds?.length || 0,
    workouts: state.workouts?.length || 0,
    books: 0,
    readingLogs: state.readingLogs?.length || 0,
    skills: state.skills?.length || 0,
    skillLogs: state.skillLogs?.length || 0,
    badHabits: state.badHabits?.length || 0,
    badHabitLogs: state.badHabitLogs?.length || 0,
    cravingLogs: state.cravingLogs?.length || 0,
    focusLogs: state.focusLogs?.length || 0,
    decisionLogs: state.decisionLogs?.length || 0,
    emotionLogs: state.emotionLogs?.length || 0,
    weeklyGoals: state.weeklyGoals?.length || 0,
    goals: state.goals?.length || 0,
    projects: state.projects?.length || 0,
    tasks: state.tasks?.length || 0,
    libraryBooks: state.libraryBooks?.length || 0,
    improvementPlans: state.improvementPlans?.length || 0,
    followedPlans: state.followedPlans?.length || 0,
    sharedChallenges: state.sharedChallenges?.length || 0,
    partnerInvites: state.partnerInvites?.length || 0,
    partnerships: state.partnerships?.length || 0,
    notifications: state.notifications?.length || 0,
  };

  const itemCount =
    Object.values(arrayBreakdown).reduce((sum, c) => sum + c, 0) +
    (state.addictionTracker ? 1 : 0) +
    (state.exerciseGoal ? 1 : 0);

  return { itemCount, arrayBreakdown };
}
