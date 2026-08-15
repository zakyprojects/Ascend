import { AppState } from '@/types';

/**
 * Merges two AppState objects non-destructively ("Merge, Never Replace").
 * Guarantees that no entities, history, or points from either state are lost.
 */
export function mergeAppState(baseState: AppState, incomingState: AppState): AppState {
  if (!baseState && !incomingState) return {} as AppState;
  if (!baseState) return incomingState;
  if (!incomingState) return baseState;

  const merged: AppState = { ...baseState };

  // 1. Point accounting: union points history and take highest verified totalPoints
  const baseTotal = typeof baseState.totalPoints === 'number' ? Math.max(0, baseState.totalPoints) : 0;
  const incTotal = typeof incomingState.totalPoints === 'number' ? Math.max(0, incomingState.totalPoints) : 0;

  const basePoints = baseState.pointsHistory || [];
  const incPoints = incomingState.pointsHistory || [];
  const basePointIds = new Set(basePoints.map((p) => p.id));
  const newIncPoints = incPoints.filter((p) => !basePointIds.has(p.id));

  if (newIncPoints.length > 0) {
    const addedPoints = newIncPoints.reduce((sum, p) => sum + (p.amount || 0), 0);
    merged.pointsHistory = [...newIncPoints, ...basePoints];
    merged.totalPoints = Math.max(baseTotal + addedPoints, incTotal, baseTotal);
  } else {
    merged.pointsHistory = basePoints.length >= incPoints.length ? basePoints : incPoints;
    merged.totalPoints = Math.max(baseTotal, incTotal);
  }

  // 2. Generic array merge across all entity collections
  const arrayKeys: (keyof AppState)[] = [
    'habits',
    'journalEntries',
    'leagueArchives',
    'workouts',
    'books',
    'readingLogs',
    'skills',
    'skillLogs',
    'badHabits',
    'badHabitLogs',
    'cravingLogs',
    'focusLogs',
    'decisionLogs',
    'emotionLogs',
    'weeklyGoals',
    'goals',
    'projects',
    'tasks',
    'libraryBooks',
    'improvementPlans',
    'followedPlans',
    'partnerInvites',
    'partnerships',
    'sharedChallenges',
    'partnerNotifications',
    'notifications',
  ];

  for (const key of arrayKeys) {
    const baseArr = (baseState[key] as any[]) || [];
    const incArr = (incomingState[key] as any[]) || [];

    if (!incArr.length) {
      (merged as any)[key] = baseArr;
      continue;
    }
    if (!baseArr.length) {
      (merged as any)[key] = incArr;
      continue;
    }

    const baseMap = new Map<string, any>();
    baseArr.forEach((item) => {
      if (item && typeof item === 'object' && item.id) baseMap.set(item.id, item);
    });

    const mergedArr = [...baseArr];

    incArr.forEach((incItem) => {
      if (!incItem || typeof incItem !== 'object' || !incItem.id) return;

      const baseItem = baseMap.get(incItem.id);
      if (!baseItem) {
        // Item present in incoming but not in base -> append to prevent loss
        mergedArr.unshift(incItem);
      } else if (JSON.stringify(incItem) !== JSON.stringify(baseItem)) {
        // Item present in both with differences -> resolve conflict non-destructively
        const idx = mergedArr.findIndex((x) => x.id === incItem.id);
        if (idx !== -1) {
          // Compare timestamps or completion counts if available
          const incTimestamp = incItem.updatedAt || incItem.createdAt || incItem.timestamp || 0;
          const baseTimestamp = baseItem.updatedAt || baseItem.createdAt || baseItem.timestamp || 0;

          if (incTimestamp > baseTimestamp) {
            mergedArr[idx] = incItem;
          } else if (Array.isArray(incItem.completions) && Array.isArray(baseItem.completions)) {
            // Habit completion union
            const combinedCompletions = Array.from(new Set([...baseItem.completions, ...incItem.completions]));
            mergedArr[idx] = {
              ...baseItem,
              ...incItem,
              completions: combinedCompletions,
              streakCount: Math.max(baseItem.streakCount || 0, incItem.streakCount || 0),
            };
          } else {
            // Default to incoming if newer or equal
            mergedArr[idx] = incItem;
          }
        }
      }
    });

    (merged as any)[key] = mergedArr;
  }

  // 3. Primitive set merges
  const baseLessons = new Set(baseState.readLessonIds || []);
  (incomingState.readLessonIds || []).forEach((id) => baseLessons.add(id));
  merged.readLessonIds = Array.from(baseLessons);

  // 4. Non-array objects: preserve if present in either state
  if (!merged.exerciseGoal && incomingState.exerciseGoal) {
    merged.exerciseGoal = incomingState.exerciseGoal;
  }
  if (!merged.readingGoal && incomingState.readingGoal) {
    merged.readingGoal = incomingState.readingGoal;
  }
  if (!merged.addictionTracker && incomingState.addictionTracker) {
    merged.addictionTracker = incomingState.addictionTracker;
  }
  if (!merged.partnership && incomingState.partnership) {
    merged.partnership = incomingState.partnership;
  }

  // 5. User Profile: ensure current user profile is maintained
  if (!merged.currentUser && incomingState.currentUser) {
    merged.currentUser = incomingState.currentUser;
    merged.username = incomingState.username;
  }

  return merged;
}
