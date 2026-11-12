// habitsDueToday (lib/weeklyActivity.ts): the Dashboard's "today" (ring + "All done for today")
// counts every daily habit, and a weekly habit only once it is done this week or on Sunday.
import type { Habit } from '@/types';
const { habitsDueToday } = await import('../time/weeklyActivity');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const ids = (list: Habit[]) => list.map((h) => h.id).join(',');

const habit = (id: string, frequency: 'daily' | 'weekly'): Habit => ({
  id,
  name: id,
  frequency,
  points: 1,
  isPreset: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  createdAtPeriod: '2026-11-01',
  completions: {},
});

const daily = habit('daily', 'daily');
const weeklyOpen = habit('weeklyOpen', 'weekly');
const weeklyDone = habit('weeklyDone', 'weekly');
const done = new Set(['weeklyDone']);
const isDone = (h: Habit) => done.has(h.id);
const all = [daily, weeklyOpen, weeklyDone];

// 2026-11-11 is a Wednesday, 2026-11-15 a Sunday, 2026-11-16 a Monday.
assert(ids(habitsDueToday(all, isDone, '2026-11-11')) === 'daily,weeklyDone', 'midweek: open weekly habit waits');
assert(ids(habitsDueToday(all, isDone, '2026-11-16')) === 'daily,weeklyDone', 'Monday: open weekly habit waits');
assert(ids(habitsDueToday(all, isDone, '2026-11-15')) === 'daily,weeklyOpen,weeklyDone', 'Sunday: every weekly habit is due');
assert(habitsDueToday([weeklyOpen], isDone, '2026-11-11').length === 0, 'only an open weekly habit midweek: nothing due');
assert(habitsDueToday([], isDone, '2026-11-15').length === 0, 'no habits');
// Order is kept (the Today card order).
assert(ids(habitsDueToday([weeklyDone, daily], isDone, '2026-11-11')) === 'weeklyDone,daily', 'order kept');

console.log('habitsDueToday: all passed');
