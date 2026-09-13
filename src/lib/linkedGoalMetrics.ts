import { AppState, WeeklyGoalItem } from '@/types';

export type LinkedModule = 'habit' | 'exercise' | 'reading' | 'skill';

export type MetricKey =
  | 'days_completed'
  | 'workouts_logged'
  | 'minutes_exercised'
  | 'reps_logged'
  | 'sets_logged'
  | 'distance_km'
  | 'pages_read'
  | 'minutes_practiced'
  | 'sessions_logged';

export interface LinkedGoalMetricDefinition {
  key: MetricKey;
  label: string;
  aggregator: (state: AppState, item: WeeklyGoalItem, dateStrings: string[]) => number;
}

export const LINKED_GOAL_METRICS: Record<LinkedModule, LinkedGoalMetricDefinition[]> = {
  habit: [
    {
      key: 'days_completed',
      label: 'days',
      aggregator: (state, item, dateStrings) => {
        const habit = (state.habits || []).find((h) => h.id === item.linkedItemId);
        if (!habit || !habit.completions) return 0;
        if (Array.isArray(habit.completions)) {
          // Defensive only: state passed here has already gone through sanitizeState() 
          // in store.ts, which normalizes legacy string[] completions into the 
          // dictionary form. This branch should be unreachable in practice but is kept 
          // as a guard against future call sites that might pass unsanitized state.
          return (habit.completions as string[]).filter((c) => dateStrings.includes(c)).length;
        }
        return Object.entries(habit.completions).filter(
          ([date, c]) => c && c.done && dateStrings.includes(date)
        ).length;
      },
    },
  ],
  exercise: [
    {
      key: 'workouts_logged',
      label: 'workouts',
      aggregator: (state, item, dateStrings) => {
        let weekWorkouts = (state.workouts || []).filter((w) => dateStrings.includes(w.date));
        const targetWorkoutName = (item.linkedItemId || '').trim().toLowerCase();
        if (targetWorkoutName) {
          weekWorkouts = weekWorkouts.filter(
            (w) => (w.type || '').trim().toLowerCase() === targetWorkoutName
          );
        }
        return weekWorkouts.length;
      },
    },
    {
      key: 'minutes_exercised',
      label: 'minutes',
      aggregator: (state, item, dateStrings) => {
        let weekWorkouts = (state.workouts || []).filter((w) => dateStrings.includes(w.date));
        const targetWorkoutName = (item.linkedItemId || '').trim().toLowerCase();
        if (targetWorkoutName) {
          weekWorkouts = weekWorkouts.filter(
            (w) => (w.type || '').trim().toLowerCase() === targetWorkoutName
          );
        }
        return weekWorkouts.reduce((acc, w) => acc + (w.durationMinutes || 0), 0);
      },
    },
    {
      key: 'reps_logged',
      label: 'reps',
      aggregator: (state, item, dateStrings) => {
        let weekWorkouts = (state.workouts || []).filter((w) => dateStrings.includes(w.date));
        const targetWorkoutName = (item.linkedItemId || '').trim().toLowerCase();
        if (targetWorkoutName) {
          weekWorkouts = weekWorkouts.filter(
            (w) => (w.type || '').trim().toLowerCase() === targetWorkoutName
          );
        }
        return weekWorkouts
          .filter((w) => (w.unit || '').trim().toLowerCase() === 'reps')
          .reduce((acc, w) => acc + (typeof w.amount === 'number' && !isNaN(w.amount) ? w.amount : 0), 0);
      },
    },
    {
      key: 'sets_logged',
      label: 'sets',
      aggregator: (state, item, dateStrings) => {
        let weekWorkouts = (state.workouts || []).filter((w) => dateStrings.includes(w.date));
        const targetWorkoutName = (item.linkedItemId || '').trim().toLowerCase();
        if (targetWorkoutName) {
          weekWorkouts = weekWorkouts.filter(
            (w) => (w.type || '').trim().toLowerCase() === targetWorkoutName
          );
        }
        return weekWorkouts
          .filter((w) => (w.unit || '').trim().toLowerCase() === 'sets')
          .reduce((acc, w) => acc + (typeof w.amount === 'number' && !isNaN(w.amount) ? w.amount : 0), 0);
      },
    },
    {
      key: 'distance_km',
      label: 'km',
      aggregator: (state, item, dateStrings) => {
        let weekWorkouts = (state.workouts || []).filter((w) => dateStrings.includes(w.date));
        const targetWorkoutName = (item.linkedItemId || '').trim().toLowerCase();
        if (targetWorkoutName) {
          weekWorkouts = weekWorkouts.filter(
            (w) => (w.type || '').trim().toLowerCase() === targetWorkoutName
          );
        }
        return weekWorkouts
          .filter((w) => (w.unit || '').trim().toLowerCase() === 'km')
          .reduce((acc, w) => acc + (typeof w.amount === 'number' && !isNaN(w.amount) ? w.amount : 0), 0);
      },
    },
  ],
  reading: [
    {
      key: 'pages_read',
      label: 'pages',
      aggregator: (state, item, dateStrings) => {
        const logs = (state.readingLogs || []).filter((l) => dateStrings.includes(l.date));
        const matchingBook = (state.libraryBooks || []).find(
          (lb) => lb.id === item.linkedItemId || lb.linkedBookId === item.linkedItemId
        );
        const matchingIds = new Set<string>();
        if (item.linkedItemId) matchingIds.add(item.linkedItemId);
        if (matchingBook?.id) matchingIds.add(matchingBook.id);
        if (matchingBook?.linkedBookId) matchingIds.add(matchingBook.linkedBookId);

        const filtered = matchingIds.size > 0
          ? logs.filter((l) => Boolean(l.bookId && matchingIds.has(l.bookId)))
          : logs;
        return filtered.reduce((acc, l) => acc + (l.pagesRead || 0), 0);
      },
    },
  ],
  skill: [
    {
      key: 'minutes_practiced',
      label: 'minutes',
      aggregator: (state, item, dateStrings) => {
        const logs = (state.skillLogs || []).filter((l) => dateStrings.includes(l.date));
        const filtered = item.linkedItemId ? logs.filter((l) => l.skillId === item.linkedItemId) : logs;
        return filtered.reduce((acc, l) => acc + (l.durationMinutes || 0), 0);
      },
    },
    {
      key: 'sessions_logged',
      label: 'sessions',
      aggregator: (state, item, dateStrings) => {
        const logs = (state.skillLogs || []).filter((l) => dateStrings.includes(l.date));
        const filtered = item.linkedItemId ? logs.filter((l) => l.skillId === item.linkedItemId) : logs;
        return filtered.length;
      },
    },
  ],
};

export type GoalProgressResult =
  | {
      needsMetricSelection: true;
      current: 0;
      target: number;
      unit: null;
      percent: 0;
    }
  | {
      needsMetricSelection?: false;
      current: number;
      target: number;
      unit: string;
      percent: number;
    };

export function computeLinkedGoalProgress(
  item: WeeklyGoalItem,
  state: AppState,
  dateStrings: string[]
): GoalProgressResult {
  const target = item.targetValue && item.targetValue > 0 ? item.targetValue : 1;

  // Manual / unlinked goals
  if (!item.linkedModule || item.linkedModule === 'none') {
    const manual = item.manualProgress !== undefined ? item.manualProgress : (item.completed ? target : 0);
    return {
      needsMetricSelection: false,
      current: manual,
      target,
      unit: item.unit || 'times',
      percent: Math.min(100, Math.round((manual / target) * 100)),
    };
  }

  // If linkedModule is not a recognized registry key
  const moduleMetrics = LINKED_GOAL_METRICS[item.linkedModule as LinkedModule];
  if (!moduleMetrics) {
    return {
      needsMetricSelection: true,
      current: 0,
      target,
      unit: null,
      percent: 0,
    };
  }

  // Look up metric definition by linkedMetricKey
  if (!item.linkedMetricKey) {
    return {
      needsMetricSelection: true,
      current: 0,
      target,
      unit: null,
      percent: 0,
    };
  }

  const metricDef = moduleMetrics.find((m) => m.key === item.linkedMetricKey);
  if (!metricDef) {
    return {
      needsMetricSelection: true,
      current: 0,
      target,
      unit: null,
      percent: 0,
    };
  }

  const current = metricDef.aggregator(state, item, dateStrings);
  return {
    needsMetricSelection: false,
    current,
    target,
    unit: metricDef.label,
    percent: Math.min(100, Math.round((current / target) * 100)),
  };
}
