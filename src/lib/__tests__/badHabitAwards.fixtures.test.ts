// Fixtures for server-owned bad-habit points: the app's copy of ascend_recompute_bad_habit_awards
// (20261019210100_bad_habit_resist_points.sql). Change both together.
import type { BadHabit, BadHabitLog, PointsEntry } from '@/types';
import { badHabitResistId, badHabitResistPoints, computeBadHabitAwards } from '../badHabitAwards';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const DAY = '2026-10-19';
const START = new Date(`${DAY}T00:00:00`).getTime();
const NOW = START + 20 * 3600_000;
const at = (h: number) => new Date(START + h * 3600_000).toISOString();

const bh = (id: string, name: string, createdDay: number, isPreset?: boolean): BadHabit => ({
  id,
  name,
  createdAt: new Date(START - (30 - createdDay) * 86400_000).toISOString(),
  ...(isPreset ? { isPreset } : {}),
});
const log = (id: string, badHabitId: string, hour: number, status: BadHabitLog['status'] = 'resisted'): BadHabitLog => ({
  id,
  badHabitId,
  date: DAY,
  status,
  pointsAwardedOrDeducted: 0,
  createdAt: at(hour),
});
const resists = (entries: PointsEntry[]) =>
  Object.fromEntries(entries.filter((e) => e.source === 'bad_habit_resisted').map((e) => [e.metadata?.badHabitId, e.amount]));

// 1. Points per bad habit: library points only when chosen from the library.
{
  assert(badHabitResistPoints({ name: 'Porn', isPreset: true }) === 3, 'Porn 3');
  assert(badHabitResistPoints({ name: 'Doomscrolling', isPreset: true }) === 2, 'Doomscrolling 2');
  assert(badHabitResistPoints({ name: 'Junk food', isPreset: true }) === 1, 'Junk food 1');
  assert(badHabitResistPoints({ name: 'Porn' }) === 1, 'custom named Porn 1');
  assert(badHabitResistPoints({ name: 'Nail biting' }) === 1, 'custom 1');
}

// 2. Every active bad habit earns in log order until the 6 cap; the last gets what is left.
{
  const habits = [bh('p', 'Porn', 1, true), bh('d', 'Doomscrolling', 2, true), bh('x', 'Porn', 3), bh('s', 'Sugary drinks', 4, true), bh('k', 'Smoking / vaping', 5, true)];
  const r = resists(
    computeBadHabitAwards(habits, [log('l1', 'x', 1), log('l2', 'd', 2), log('l3', 'p', 3), log('l4', 's', 4)], [], DAY, START, NOW, 0).entries
  );
  assert(r.x === 1 && r.d === 2 && r.p === 3 && !('s' in r), 'log order, cap 6');
  const r2 = resists(
    computeBadHabitAwards(habits, [log('l1', 'x', 1), log('l4', 's', 4), log('l5', 'k', 5)], [], DAY, START, NOW, 0).entries
  );
  assert(r2.x === 1 && r2.s === 1 && r2.k === 3, 'room for all');
  const r3 = resists(
    computeBadHabitAwards(habits, [log('l3', 'p', 1), log('l2', 'd', 2), log('l5', 'k', 3)], [], DAY, START, NOW, 0).entries
  );
  assert(r3.p === 3 && r3.d === 2 && r3.k === 1, 'partial last');
}

// 3. A resist that already earned goes first and keeps at least its amount (the switch day: +3 rows).
{
  const habits = [bh('a', 'doomscrolling', 1), bh('b', 'gaming', 2), bh('c', 'time waste', 3)];
  const earned = (id: string): PointsEntry => ({
    id: badHabitResistId(id, DAY), amount: 3, reason: '', source: 'bad_habit_resisted', timestamp: at(5), metadata: { badHabitId: id, date: DAY },
  });
  const r = resists(
    computeBadHabitAwards(habits, [log('lc', 'c', 1), log('la', 'a', 2), log('lb', 'b', 3)], [earned('a'), earned('b')], DAY, START, NOW, 0).entries
  );
  assert(r.a === 3 && r.b === 3 && !('c' in r), 'earned rows kept first');
}

// 4. Slip penalties unchanged: only the 2 oldest active bad habits.
{
  const habits = [bh('e1', 'Porn', 1, true), bh('e2', 'Junk food', 2, true), bh('e3', 'Staying up late', 3, true)];
  const logs = [log('o1', 'e1', 1, 'occurred'), log('o3', 'e3', 2, 'occurred')];
  const { entries } = computeBadHabitAwards(habits, logs, [], DAY, START, NOW, 0);
  const occ = entries.filter((e) => e.source === 'bad_habit_occurred').map((e) => e.metadata?.badHabitId);
  assert(occ.length === 1 && occ[0] === 'e1', 'slot-3 habit has no slip penalty');
}

console.log('badHabitAwards fixtures: all passed');
