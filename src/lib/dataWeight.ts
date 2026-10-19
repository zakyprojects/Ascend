import type { AppState } from '@/types';

export interface UserDataWeight {
  /** The user's own items (arrayBreakdown + the recovery tracker): what the data-loss guard counts. */
  itemCount: number;
  arrayBreakdown: Record<string, number>;
  /** Tombstoned ids at that moment, so a later state's new tombstones read as deletes made on purpose. */
  tombstoneIds: string[];
}

/** The user's own items per state key. */
function ownCounts(state: Partial<AppState>): Record<string, number> {
  return {
    habits: state.habits?.length || 0,
    journalEntries: state.journalEntries?.length || 0,
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
  };
}

/**
 * Keys a save can never lose, which grow on their own: rows only the server writes (points, league
 * archives) and keys kept in their own tables with explicit deletes (plans, partners, notifications).
 * Counted in the guard they outnumbered the user's own items many times over and hid a real drop.
 */
function serverOwnedCount(state: Partial<AppState>): number {
  return (
    (state.pointsHistory?.length || 0) +
    (state.leagueArchives?.length || 0) +
    (state.improvementPlans?.length || 0) +
    (state.followedPlans?.length || 0) +
    (state.sharedChallenges?.length || 0) +
    (state.partnerInvites?.length || 0) +
    (state.partnerships?.length || 0) +
    (state.notifications?.length || 0)
  );
}

export function computeStateDataWeight(state: Partial<AppState> | null | undefined): UserDataWeight {
  if (!state) return { itemCount: 0, arrayBreakdown: {}, tombstoneIds: [] };

  const arrayBreakdown = ownCounts(state);
  const itemCount =
    Object.values(arrayBreakdown).reduce((sum, c) => sum + c, 0) +
    (state.addictionTracker ? 1 : 0);

  return { itemCount, arrayBreakdown, tombstoneIds: [...(state.deletedEntityIds || [])] };
}

/** The state holds any data at all, the server-owned keys included (unlike the guard's count). */
export function hasStateData(state: Partial<AppState>): boolean {
  return computeStateDataWeight(state).itemCount + serverOwnedCount(state) > 0;
}

/** True for a state key whose items the guard counts. */
export function isGuardedKey(key: string): boolean {
  return key in ownCounts({});
}

/**
 * The save guard's count for `next` against the last saved `baseline`: the user's own items plus the
 * ones deleted on purpose since then (every delete leaves a tombstone), so an explicit delete, even a
 * cascade (a goal with its projects and tasks), is never read as data loss.
 */
export function savedItemCount(next: UserDataWeight, baseline: UserDataWeight): number {
  const known = new Set(baseline.tombstoneIds);
  return next.itemCount + next.tombstoneIds.filter((id) => !known.has(id)).length;
}
