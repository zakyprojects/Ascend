// I7 (2026-11-12): the Recovery page gets a nav status from today's check-in (its id is the local
// day key, todayKey). No tracker -> no status; checked in -> done; open -> pending, risk from 20:00.
// 2026-11-13: Exercise gets an open state. No workouts -> no status; one today -> done; any other
// workout in state -> pending 'no workout today', never risk (rest days are normal).
// 2026-11-13: all done shows the tick, not a count. Habits all done and Time tracker with every
// block done/skipped carry no meta (Nav/ZoneSheet render meta text instead of the tick); while
// open they keep "N left" / "done/total".
import type { AddictionTracker, AppState, Habit, RecoveryCheckin, TimeTrackerBlock, WorkoutLog } from '@/types';
import { DEFAULT_STATE, DEFAULT_TIME_TRACKER_STATE } from '@/types';
import { addDays, todayKey } from '../../time/dates';
import { getNavStatuses } from '../navStatus';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(Object.is(a, b), `${msg} (got ${String(a)}, want ${String(b)})`);

// Local-time dates, so the test means the same in every TZ the suite runs in.
const MORNING = new Date(2026, 10, 12, 9, 0, 0);
const BEFORE_RISK = new Date(2026, 10, 12, 19, 59, 59);
const AT_RISK = new Date(2026, 10, 12, 20, 0, 0);
const TODAY = todayKey(MORNING);
const YESTERDAY = addDays(TODAY, -1);

const tracker: AddictionTracker = {
  id: 'tracker-1',
  title: 'Recovery',
  startDate: '2026-10-01T00:00:00.000Z',
  milestonesUnlocked: [],
  createdAt: '2026-10-01T00:00:00.000Z',
};
const checkin = (id: string): RecoveryCheckin => ({ id, trackerId: tracker.id, createdAt: '2026-11-12T04:00:00.000Z' });
const stateWith = (patch: Partial<AppState>): AppState => ({ ...DEFAULT_STATE, ...patch });
const recovery = (state: AppState, now: Date) => getNavStatuses(state, () => false, now).recovery;

// 1. No tracker -> no status, even with an old check-in left in state.
eq(recovery(stateWith({ addictionTracker: null }), MORNING), undefined, 'no tracker: no status');
eq(recovery(stateWith({ addictionTracker: null, recoveryCheckins: [checkin(TODAY)] }), AT_RISK), undefined, 'no tracker, stray check-in: no status');

// 2. Checked in today -> done, before and after the risk hour.
{
  const s = stateWith({ addictionTracker: tracker, recoveryCheckins: [checkin(TODAY)] });
  const morning = recovery(s, MORNING);
  eq(morning?.tone, 'done', 'checked in: done');
  eq(morning?.label, 'checked in today', 'checked in: label');
  eq(morning?.meta, undefined, 'checked in: no meta');
  eq(recovery(s, AT_RISK)?.tone, 'done', 'checked in: still done after 20:00');
}

// 3. Not checked in -> pending before 20:00 (also with recoveryCheckins missing).
{
  const s = stateWith({ addictionTracker: tracker, recoveryCheckins: [] });
  const open = recovery(s, MORNING);
  eq(open?.tone, 'pending', 'not checked in: pending');
  eq(open?.label, 'not checked in today', 'not checked in: label');
  eq(open?.meta, undefined, 'not checked in: no meta');
  eq(recovery(s, BEFORE_RISK)?.tone, 'pending', '19:59:59: still pending');
  eq(recovery(stateWith({ addictionTracker: tracker, recoveryCheckins: undefined }), MORNING)?.tone, 'pending', 'missing array: pending');
}

// 4. From 20:00 an open day is risk.
eq(recovery(stateWith({ addictionTracker: tracker, recoveryCheckins: [] }), AT_RISK)?.tone, 'risk', '20:00: risk');

// 5. Yesterday's check-in does not count for today.
{
  const s = stateWith({ addictionTracker: tracker, recoveryCheckins: [checkin(YESTERDAY)] });
  eq(recovery(s, MORNING)?.tone, 'pending', "yesterday's check-in: pending");
  eq(recovery(s, AT_RISK)?.tone, 'risk', "yesterday's check-in: risk after 20:00");
}

// 6. The id format is the same key the Recovery page writes (todayKey / useLocalDayKey: YYYY-MM-DD local).
assert(/^\d{4}-\d{2}-\d{2}$/.test(TODAY), 'today key is YYYY-MM-DD');
eq(TODAY, '2026-11-12', 'today key is the local calendar day');

// --- Exercise ---
const workout = (id: string, date: string): WorkoutLog => ({
  id,
  date,
  type: 'Running',
  durationMinutes: 30,
  pointsAwarded: 0,
  createdAt: 'Thu 2026-11-12 9:00 AM PKT (UTC+05:00)',
});
const exercise = (state: AppState, now: Date) => getNavStatuses(state, () => false, now).exercise;

// 7. No workouts ever (empty or missing array) -> no status, morning and late.
eq(exercise(stateWith({ workouts: [] }), MORNING), undefined, 'no workouts: no status');
eq(exercise(stateWith({ workouts: [] }), AT_RISK), undefined, 'no workouts after 20:00: no status');
eq(exercise(stateWith({ workouts: undefined as unknown as WorkoutLog[] }), MORNING), undefined, 'missing workouts: no status');

// 8. A workout today -> done, before and after 20:00 (also beside older ones).
{
  const s = stateWith({ workouts: [workout('w-old', YESTERDAY), workout('w-today', TODAY)] });
  const done = exercise(s, MORNING);
  eq(done?.tone, 'done', 'workout today: done');
  eq(done?.label, 'workout logged today', 'workout today: label');
  eq(done?.meta, undefined, 'workout today: no meta');
  eq(exercise(s, AT_RISK)?.tone, 'done', 'workout today: still done after 20:00');
}

// 9. Only earlier workouts -> pending all day, never risk (no orange after 20:00).
{
  const s = stateWith({ workouts: [workout('w-old', YESTERDAY)] });
  const open = exercise(s, MORNING);
  eq(open?.tone, 'pending', 'earlier workout only: pending');
  eq(open?.label, 'no workout today', 'earlier workout only: label');
  eq(open?.meta, undefined, 'earlier workout only: no meta');
  eq(exercise(s, BEFORE_RISK)?.tone, 'pending', '19:59:59: pending');
  eq(exercise(s, AT_RISK)?.tone, 'pending', '20:00: still pending, not risk');
  eq(exercise(s, new Date(2026, 10, 12, 23, 59, 59))?.tone, 'pending', '23:59:59: still pending, not risk');
}

// 10. A workout dated tomorrow alone is not today's -> pending.
eq(exercise(stateWith({ workouts: [workout('w-next', addDays(TODAY, 1))] }), MORNING)?.tone, 'pending', "tomorrow's workout: pending");

// --- Habits ---
const habit = (id: string, frequency: Habit['frequency'] = 'daily'): Habit => ({
  id,
  name: id,
  frequency,
  points: 1,
  isPreset: false,
  createdAt: 'Thu 2026-11-12 9:00 AM PKT (UTC+05:00)',
  completions: {},
  createdAtPeriod: TODAY,
});
const habitsStatus = (habits: Habit[], doneIds: string[], now: Date) =>
  getNavStatuses(stateWith({ habits }), (h) => doneIds.includes(h.id), now).habits;

// 11. All habits done -> done with no meta (the tick), morning and late.
{
  const hs = [habit('h1'), habit('h2'), habit('h3', 'weekly')];
  const done = habitsStatus(hs, ['h1', 'h2', 'h3'], MORNING);
  eq(done?.tone, 'done', 'habits all done: done');
  eq(done?.meta, undefined, 'habits all done: no meta (tick, not 3/3)');
  eq(done?.label, 'all habits done', 'habits all done: label');
  eq(habitsStatus(hs, ['h1', 'h2', 'h3'], AT_RISK)?.meta, undefined, 'habits all done after 20:00: no meta');
}

// 12. Habits still open -> the count stays.
{
  const hs = [habit('h1'), habit('h2'), habit('h3')];
  const open = habitsStatus(hs, ['h1'], MORNING);
  eq(open?.tone, 'pending', 'habits open: pending');
  eq(open?.meta, '2 left', 'habits open: meta "2 left"');
  eq(open?.label, '2 habits left', 'habits open: label');
  eq(habitsStatus(hs, ['h1'], AT_RISK)?.tone, 'risk', 'daily habit open after 20:00: risk');
  eq(habitsStatus(hs, ['h1', 'h2'], MORNING)?.meta, '1 left', 'one habit open: meta "1 left"');
}
eq(habitsStatus([], [], MORNING), undefined, 'no habits: no status');

// --- Time tracker ---
const block = (id: string, patch: Partial<TimeTrackerBlock> = {}): TimeTrackerBlock => ({
  id,
  startTime: '09:00',
  endTime: '10:00',
  activityId: 'act-1',
  ...patch,
});
const tt = (blocks: TimeTrackerBlock[], now: Date = MORNING) =>
  getNavStatuses(
    stateWith({ timeTracker: { ...DEFAULT_TIME_TRACKER_STATE, dailyLogs: { [TODAY]: blocks } } }),
    () => false,
    now
  )['time-tracker'];

// 13. Every block done -> done with no meta (the tick).
{
  const s = tt([block('b1', { completed: true }), block('b2', { completed: true })]);
  eq(s?.tone, 'done', 'all blocks done: done');
  eq(s?.meta, undefined, 'all blocks done: no meta (tick, not 2/2)');
  eq(s?.label, '2 done of 2 blocks today', 'all blocks done: label');
}

// 14. Done + skipped, none open -> done, no meta; label keeps the skipped count.
{
  const s = tt([block('b1', { completed: true }), block('b2', { skipped: true }), block('b3', { completed: true })], AT_RISK);
  eq(s?.tone, 'done', 'done + skipped: done');
  eq(s?.meta, undefined, 'done + skipped: no meta');
  eq(s?.label, '2 done, 1 skipped of 3 blocks today', 'done + skipped: label');
  const allSkipped = tt([block('b1', { skipped: true })]);
  eq(allSkipped?.tone, 'done', 'all skipped: done');
  eq(allSkipped?.meta, undefined, 'all skipped: no meta');
}

// 15. A block still open -> pending with the done/total count.
{
  const s = tt([block('b1', { completed: true }), block('b2', { skipped: true }), block('b3'), block('b4'), block('b5', { completed: true })]);
  eq(s?.tone, 'pending', 'blocks open: pending');
  eq(s?.meta, '2/5', 'blocks open: meta "2/5"');
  eq(s?.label, '2 done, 1 skipped of 5 blocks today', 'blocks open: label');
  eq(tt([block('b1')])?.meta, '0/1', 'nothing done: meta "0/1"');
}
eq(tt([]), undefined, 'no blocks today: no status');

console.log('navStatus recovery + exercise + habits + time tracker: all assertions passed');
