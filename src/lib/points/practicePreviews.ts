/**
 * Points previews of the logging dialogs (Exercise, Skills, Focus, Reading): one wording for the
 * line, and the two previews that need the whole day (a workout edit, a reading progress update).
 * Display only: every number comes from the same mirrors the store uses (computeWorkoutAwards,
 * computeReadingDayAward, takeBackTodaysReading), so the preview is the value the row shows after
 * saving. No points rule lives here.
 */
import type { ReadingLog, UserBook, WorkoutLog } from '@/types';
import { computeWorkoutAwards } from './workoutAwards';
import { computeReadingDayAward, isChapterBook } from './readingAwards';
import { takeBackTodaysReading } from '../bookUnits';
import { workoutFields } from '../itemEdits';

/** The preview line's label when the whole amount counts. */
export const PREVIEW_EARN_LABEL = 'You earn';
/** The label when the daily cap cuts the amount. */
export const PREVIEW_MAX_LABEL = "Today's max";
/** The line once today's cap is full (the log still saves). */
export const previewCapReachedText = (cap: number): string => `Today's ${cap} pts are reached. It still saves.`;

/**
 * The points the edited workout shows after saving: today's workouts with this one changed, the
 * cap shared in log order (computeWorkoutAwards = ascend_recompute_workout_awards). `raw` is what
 * it would earn without the cap. `dayBefore` / `dayAfter` are the day's totals (the cap can move
 * points between workouts, so a bigger row does not always mean a bigger day).
 */
export function workoutEditPreview(
  workouts: readonly WorkoutLog[],
  workoutId: string,
  edit: { type: string; durationMinutes: number; amount?: number; unit?: string },
  day: string,
  rawPoints: number
): { points: number; raw: number; dayBefore: number; dayAfter: number } {
  const fields = workoutFields(edit.type, edit.durationMinutes, edit.amount, edit.unit);
  const edited = workouts.map((w) => (w && w.id === workoutId ? { ...w, ...fields } : w));
  // Day start / now only stamp the row's time, never its amount.
  const before = computeWorkoutAwards(workouts as WorkoutLog[], day, 0, 0);
  const after = computeWorkoutAwards(edited, day, 0, 0);
  return {
    points: after.workoutPoints.get(workoutId) ?? 0,
    raw: rawPoints,
    dayBefore: before.entry?.amount ?? 0,
    dayAfter: after.entry?.amount ?? 0,
  };
}

/**
 * Today's reading points before and after setting this book to `newCurrent`, as
 * updateReadingProgress writes it: a new log of the added amount (in the book's unit), or today's
 * reading of the book taken back (takeBackTodaysReading). Points = computeReadingDayAward.
 */
export function readingProgressPreview(
  logs: readonly ReadingLog[],
  books: readonly UserBook[],
  bookId: string,
  newCurrent: number,
  today: string,
  nowIso: string
): { before: number; after: number } {
  const dayPoints = (list: ReadingLog[]) => computeReadingDayAward(list, books as UserBook[], today, 0, 0).entry?.amount ?? 0;
  const all = logs as ReadingLog[];
  const before = dayPoints(all);
  const book = books.find((b) => b && (b.id === bookId || b.linkedBookId === bookId));
  if (!book) return { before, after: before };
  const existing = book.currentAmount ?? book.currentPage ?? 0;
  const max = book.totalAmount ?? book.totalPages ?? 250;
  const delta = Math.min(max, Math.max(0, newCurrent)) - existing;
  let next = all;
  if (delta > 0) {
    next = [
      { id: 'preview', bookId: book.id, date: today, pagesRead: delta, unit: isChapterBook(book) ? 'chapters' : 'pages', pointsAwarded: 0, createdAt: nowIso },
      ...all,
    ];
  } else if (delta < 0) {
    next = takeBackTodaysReading(all, book, today, -delta, nowIso, () => 'preview').logs;
  }
  return { before, after: dayPoints(next) };
}
