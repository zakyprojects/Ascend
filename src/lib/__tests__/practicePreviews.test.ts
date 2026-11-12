// Fixtures for the logging dialogs' points previews (audit 2026-11-10 EXE-L1, RDG-I1): the preview
// is the value the row / day shows after saving, from the same mirrors the store uses.
import type { ReadingLog, UserBook, WorkoutLog } from '@/types';
import { readingProgressPreview, workoutEditPreview } from '../points/practicePreviews';
import { computeWorkoutAwards } from '../points/workoutAwards';
import { calculateWorkoutPoints } from '../points/pointsConfig';
import { editWorkoutIn, workoutFields } from '../itemEdits';

function eq<T>(got: T, want: T, msg: string) {
  if (got !== want) throw new Error(`Assertion failed: ${msg} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);
}

const DAY = '2026-11-10';
const w = (id: string, mins: number, at: string): WorkoutLog =>
  ({ id, date: DAY, type: 'Run', durationMinutes: mins, amount: mins, unit: 'mins', pointsAwarded: 0, createdAt: `${DAY}T${at}:00.000Z` }) as WorkoutLog;

// --- EXE-L1: edit an earlier workout of today ---------------------------------------------------
{
  // A 36 min (6 pts) logged first, B 24 min (4 pts) second; edit A to 60 min.
  const list = [w('A', 36, '05:00'), w('B', 24, '06:00')];
  const stamped = computeWorkoutAwards(list, DAY, 0, 0).workoutPoints;
  const saved = list.map((x) => ({ ...x, pointsAwarded: stamped.get(x.id)! }));
  const raw = calculateWorkoutPoints('mins', 60, 60).rawPoints;
  const p = workoutEditPreview(saved, 'A', { type: 'Run', durationMinutes: 60, amount: 60, unit: 'mins' }, DAY, raw);
  // What the store saves: editWorkoutIn + computeWorkoutAwards (applyWorkoutAwardsInternal).
  const after = computeWorkoutAwards(editWorkoutIn(saved, 'A', workoutFields('Run', 60, 60, 'mins'), DAY), DAY, 0, 0);
  eq(p.points, after.workoutPoints.get('A'), 'EXE-L1: preview = the row A shows after saving');
  eq(p.points, 10, 'EXE-L1: A takes the whole cap (log order)');
  eq(after.workoutPoints.get('B'), 0, 'EXE-L1: B drops to 0');
  eq(p.dayBefore, 10, 'EXE-L1: day before');
  eq(p.dayAfter, 10, 'EXE-L1: day after (cap)');
  eq(p.raw, 10, 'EXE-L1: raw 60 min = 10');

  // Edit the later one: B 24 -> 60 gets only what A leaves (4).
  const pb = workoutEditPreview(saved, 'B', { type: 'Run', durationMinutes: 60, amount: 60, unit: 'mins' }, DAY, raw);
  eq(pb.points, 4, 'EXE-L1: later workout gets what is left');
  eq(pb.raw > pb.points, true, "EXE-L1: Today's max label case");

  // Lower A: 36 -> 6 (1 pt), B keeps 4.
  const pl = workoutEditPreview(saved, 'A', { type: 'Run', durationMinutes: 6, amount: 6, unit: 'mins' }, DAY, 1);
  eq(pl.points, 1, 'EXE-L1: lowered workout');
  eq(pl.dayAfter, 5, 'EXE-L1: day after lowering');

  // Same rule as a new log when only one workout exists.
  const one = [{ ...w('A', 30, '05:00'), pointsAwarded: 5 }];
  eq(workoutEditPreview(one, 'A', { type: 'Run', durationMinutes: 45, amount: 45, unit: 'mins' }, DAY, 7).points, 7, 'EXE-L1: single workout');
  // Reps measure.
  eq(workoutEditPreview(one, 'A', { type: 'Push-ups', durationMinutes: 0, amount: 35, unit: 'reps' }, DAY, 3).points, 3, 'EXE-L1: reps');
}

// --- RDG-I1: Log progress preview ---------------------------------------------------------------
{
  const NOW = `${DAY}T10:00:00.000Z`;
  const book = { id: 'b1', title: 'Atomic Habits', status: 'reading', currentAmount: 40, currentPage: 40, totalAmount: 300, totalPages: 300, unit: 'pages' } as unknown as UserBook;
  const chap = { id: 'b2', title: 'Deep Work', status: 'reading', currentAmount: 2, currentPage: 2, totalAmount: 12, totalPages: 12, unit: 'chapters' } as unknown as UserBook;
  const log = (id: string, bookId: string, pages: number, at: string, unit = 'pages'): ReadingLog =>
    ({ id, bookId, date: DAY, pagesRead: pages, unit, pointsAwarded: 0, createdAt: `${DAY}T${at}:00.000Z` }) as ReadingLog;

  // Nothing today: +10 pages = 5 pts.
  let r = readingProgressPreview([], [book, chap], 'b1', 50, DAY, NOW);
  eq(r.before, 0, 'RDG-I1: before');
  eq(r.after, 5, 'RDG-I1: 10 pages = 5 pts');
  // 1 page = 0 (floor).
  eq(readingProgressPreview([], [book], 'b1', 41, DAY, NOW).after, 0, 'RDG-I1: 1 page earns 0');
  // 16 pages today already (8 pts): +10 pages reaches the cap (10).
  const logs = [log('l1', 'b1', 16, '05:00')];
  r = readingProgressPreview(logs, [book, chap], 'b1', 50, DAY, NOW);
  eq(r.before, 8, 'RDG-I1: 16 pages = 8');
  eq(r.after, 10, 'RDG-I1: cap across the day');
  // Chapters: +1 chapter = 10 pts.
  eq(readingProgressPreview([], [book, chap], 'b2', 3, DAY, NOW).after, 10, 'RDG-I1: 1 chapter = 10 pts');
  // Set total lower: takes back today's pages of this book (16 -> 6 = 3 pts).
  const book56 = { ...book, currentAmount: 56, currentPage: 56 } as UserBook;
  r = readingProgressPreview(logs, [book56], 'b1', 46, DAY, NOW);
  eq(r.after, 3, 'RDG-I1: lowering takes back today only');
  // A finish log never counts; a removed book never counts.
  const fin = [{ ...log('f1', 'b1', 100, '04:00'), finish: true } as ReadingLog];
  eq(readingProgressPreview(fin, [book], 'b1', 44, DAY, NOW).after, 2, 'RDG-I1: finish log excluded');
  eq(readingProgressPreview(logs, [chap], 'b1', 50, DAY, NOW).after, 0, 'RDG-I1: unknown book changes nothing');
  // Past the book's length: clamped like the store.
  eq(readingProgressPreview([], [book], 'b1', 9999, DAY, NOW).after, 10, 'RDG-I1: clamped to the book length, capped');
}

console.log('practicePreviews: all assertions passed');
