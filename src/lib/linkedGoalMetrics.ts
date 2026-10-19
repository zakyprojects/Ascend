import { AppState, UserBook, WeeklyGoalItem, WorkoutLog } from '@/types';
import { parseDate, weekKey } from './dates';
import { isChapterBook } from './readingAwards';
import { workoutMeasureOf, workoutTypeKey, type WorkoutMeasure } from './workoutTypes';

export type LinkedModule = 'habit' | 'exercise' | 'reading' | 'skill';

export type MetricKey =
  | 'days_completed'
  | 'workouts_logged'
  | 'minutes_exercised'
  | 'reps_logged'
  | 'sets_logged'
  | 'distance_km'
  | 'pages_read'
  | 'chapters_read'
  | 'minutes_practiced'
  | 'sessions_logged';

/** One log's part in a goal: the log (habit: the ticked day or week key), when it was made, how much it adds. */
export interface MetricEntry {
  id: string;
  at: string;
  value: number;
}

export interface LinkedGoalMetricDefinition {
  key: MetricKey;
  label: string;
  /** The week's logs that count toward the goal. Progress is their sum; completion is where the sum reaches the target. */
  entries: (state: AppState, item: WeeklyGoalItem, dateStrings: string[]) => MetricEntry[];
}

/** A log with no createdAt counts at the start of its day. */
const dayInstant = (date: string): string => parseDate(date)?.toISOString() || `${date}T12:00:00.000Z`;

const weekWorkouts = (state: AppState, item: WeeklyGoalItem, dateStrings: string[]): WorkoutLog[] => {
  const typeKey = workoutTypeKey(item.linkedItemId);
  return (state.workouts || []).filter(
    (w) => dateStrings.includes(w.date) && (!typeKey || workoutTypeKey(w.type) === typeKey)
  );
};

const workoutEntries = (value: (w: WorkoutLog) => number) => (state: AppState, item: WeeklyGoalItem, dateStrings: string[]): MetricEntry[] =>
  weekWorkouts(state, item, dateStrings).map((w) => ({ id: w.id, at: w.createdAt || dayInstant(w.date), value: value(w) }));

const loggedAmount = (measure: WorkoutMeasure) => (w: WorkoutLog): number =>
  workoutMeasureOf(w) === measure && typeof w.amount === 'number' && !isNaN(w.amount) ? w.amount : 0;

/** The library book a goal follows (by its id or the catalogue id it was added from). */
export const linkedBook = (state: Pick<AppState, 'libraryBooks'>, bookId: string | undefined): UserBook | undefined =>
  bookId ? (state.libraryBooks || []).find((b) => b.id === bookId || b.linkedBookId === bookId) : undefined;

/**
 * Reading logs of the week for a goal. A goal on one book counts all of its logs, in the book's
 * own unit (pages_read and chapters_read alike). A goal on any book counts the logs of the books
 * kept in its metric's unit (a log whose book is gone counts as pages). Finish logs count (Zakria 2026-10-19).
 */
const readingEntries = (chapters: boolean) => (state: AppState, item: WeeklyGoalItem, dateStrings: string[]): MetricEntry[] => {
  const logs = (state.readingLogs || []).filter((l) => dateStrings.includes(l.date));
  let filtered;
  if (item.linkedItemId) {
    const book = linkedBook(state, item.linkedItemId);
    const ids = new Set([item.linkedItemId, book?.id, book?.linkedBookId].filter(Boolean));
    filtered = logs.filter((l) => Boolean(l.bookId && ids.has(l.bookId)));
  } else {
    const chapterBookIds = new Set((state.libraryBooks || []).filter((b) => b && isChapterBook(b)).map((b) => b.id));
    filtered = logs.filter((l) => chapterBookIds.has(l.bookId ?? '') === chapters);
  }
  return filtered.map((l) => ({ id: l.id, at: l.createdAt || dayInstant(l.date), value: l.pagesRead || 0 }));
};

const skillEntries = (value: (minutes: number) => number) => (state: AppState, item: WeeklyGoalItem, dateStrings: string[]): MetricEntry[] =>
  (state.skillLogs || [])
    .filter((l) => dateStrings.includes(l.date) && (!item.linkedItemId || l.skillId === item.linkedItemId))
    .map((l) => ({ id: l.id, at: l.createdAt || dayInstant(l.date), value: value(l.durationMinutes || 0) }));

export const LINKED_GOAL_METRICS: Record<LinkedModule, LinkedGoalMetricDefinition[]> = {
  habit: [
    {
      key: 'days_completed',
      label: 'days',
      entries: (state, item, dateStrings) => {
        const habit = (state.habits || []).find((h) => h.id === item.linkedItemId);
        if (!habit || !habit.completions) return [];
        if (Array.isArray(habit.completions)) {
          // Defensive only: sanitizeState() turns legacy string[] completions into the map form.
          return (habit.completions as string[])
            .filter((d) => dateStrings.includes(d))
            .map((d) => ({ id: d, at: dayInstant(d), value: 1 }));
        }
        // A weekly habit's ticks are keyed by week (periodKey), not by day: it counts once a week.
        if (habit.frequency === 'weekly') {
          const start = parseDate(dateStrings[0]);
          const key = start ? weekKey(start) : '';
          const tick = key ? habit.completions[key] : undefined;
          return tick?.done ? [{ id: key, at: tick.updatedAt || dayInstant(dateStrings[0]), value: 1 }] : [];
        }
        return Object.entries(habit.completions)
          .filter(([date, c]) => c && c.done && dateStrings.includes(date))
          .map(([date, c]) => ({ id: date, at: c.updatedAt || dayInstant(date), value: 1 }));
      },
    },
  ],
  exercise: [
    { key: 'workouts_logged', label: 'workouts', entries: workoutEntries(() => 1) },
    { key: 'minutes_exercised', label: 'minutes', entries: workoutEntries((w) => w.durationMinutes || 0) },
    { key: 'reps_logged', label: 'reps', entries: workoutEntries(loggedAmount('reps')) },
    { key: 'sets_logged', label: 'sets', entries: workoutEntries(loggedAmount('sets')) },
    { key: 'distance_km', label: 'km', entries: workoutEntries(loggedAmount('km')) },
  ],
  reading: [
    { key: 'pages_read', label: 'pages', entries: readingEntries(false) },
    { key: 'chapters_read', label: 'chapters', entries: readingEntries(true) },
  ],
  skill: [
    { key: 'minutes_practiced', label: 'minutes', entries: skillEntries((minutes) => minutes) },
    { key: 'sessions_logged', label: 'sessions', entries: skillEntries(() => 1) },
  ],
};

/** The exercise metric that counts a workout measure. */
export const EXERCISE_METRIC_BY_MEASURE: Record<WorkoutMeasure, MetricKey> = {
  mins: 'minutes_exercised',
  reps: 'reps_logged',
  sets: 'sets_logged',
  km: 'distance_km',
};

/** The reading metric of a book: its own unit. */
export const readingMetricFor = (book: Pick<UserBook, 'unit'>): MetricKey => (isChapterBook(book) ? 'chapters_read' : 'pages_read');

function metricOf(item: WeeklyGoalItem): LinkedGoalMetricDefinition | undefined {
  if (!item.linkedModule || item.linkedModule === 'none' || !item.linkedMetricKey) return undefined;
  return LINKED_GOAL_METRICS[item.linkedModule as LinkedModule]?.find((m) => m.key === item.linkedMetricKey);
}

/** What a linked goal counts, as shown next to its numbers. A goal on one book counts in the book's unit. */
export function linkedGoalUnit(item: WeeklyGoalItem, state: Pick<AppState, 'libraryBooks'>): string | null {
  const metric = metricOf(item);
  if (!metric) return null;
  if (item.linkedModule === 'reading' && item.linkedItemId) {
    const book = linkedBook(state, item.linkedItemId);
    if (book) return isChapterBook(book) ? 'chapters' : 'pages';
  }
  return metric.label;
}

/**
 * Whether the habit, book or skill a goal is linked to still exists. Exercise goals follow a
 * workout name, and a goal on "any" item follows them all, so those are always live.
 */
export function linkedItemExists(item: WeeklyGoalItem, state: Pick<AppState, 'habits' | 'libraryBooks' | 'skills'>): boolean {
  const id = item.linkedItemId;
  if (!id) return true;
  switch (item.linkedModule) {
    case 'habit':
      return (state.habits || []).some((h) => h.id === id);
    case 'reading':
      return Boolean(linkedBook(state, id));
    case 'skill':
      return (state.skills || []).some((s) => s.id === id);
    default:
      return true;
  }
}

const sortedEntries = (entries: MetricEntry[]): MetricEntry[] =>
  [...entries].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

/**
 * The log whose running total (in time order) first reached the goal's target this week, or
 * undefined while the target is not reached. Its `at` is when the goal was achieved by its logs.
 */
export function linkedGoalCrossing(item: WeeklyGoalItem, state: AppState, dateStrings: string[]): MetricEntry | undefined {
  const metric = metricOf(item);
  if (!metric) return undefined;
  const target = item.targetValue && item.targetValue > 0 ? item.targetValue : 1;
  let sum = 0;
  for (const entry of sortedEntries(metric.entries(state, item, dateStrings))) {
    sum += entry.value;
    if (sum >= target) return entry;
  }
  return undefined;
}

/** Whether a log a goal counts (or counted) is on this device: a log id, or a habit's day or week key. */
export function linkedEntryPresent(item: WeeklyGoalItem, state: AppState, entryId: string): boolean {
  switch (item.linkedModule) {
    case 'habit': {
      const habit = (state.habits || []).find((h) => h.id === item.linkedItemId);
      const completions = habit?.completions;
      if (!completions) return false;
      return Array.isArray(completions) ? (completions as string[]).includes(entryId) : entryId in completions;
    }
    case 'exercise':
      return (state.workouts || []).some((w) => w.id === entryId);
    case 'reading':
      return (state.readingLogs || []).some((l) => l.id === entryId);
    case 'skill':
      return (state.skillLogs || []).some((l) => l.id === entryId);
    default:
      return false;
  }
}

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

/** Percent of the target, 100 only once it is reached (99.6% of 550 reps is not done). */
const percentOf = (current: number, target: number): number =>
  current >= target ? 100 : Math.min(99, Math.max(0, Math.round((current / target) * 100)));

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
      percent: percentOf(manual, target),
    };
  }

  // No metric chosen yet, or one this build does not know.
  const metric = metricOf(item);
  if (!metric) {
    return {
      needsMetricSelection: true,
      current: 0,
      target,
      unit: null,
      percent: 0,
    };
  }

  const current = metric.entries(state, item, dateStrings).reduce((sum, e) => sum + e.value, 0);
  return {
    needsMetricSelection: false,
    current,
    target,
    unit: linkedGoalUnit(item, state) ?? metric.label,
    percent: percentOf(current, target),
  };
}
