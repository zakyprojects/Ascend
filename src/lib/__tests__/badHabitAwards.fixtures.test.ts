// Fixtures for server-owned bad-habit points: the app's copy of ascend_recompute_bad_habit_awards
// (20261019210100_bad_habit_resist_points.sql, 20261104*_bad_habit_penalties_all.sql). Change both together.
import type { BadHabit, BadHabitLog, PointsEntry } from '@/types';
import {
  badHabitOccurredId,
  badHabitPenalty,
  badHabitResistId,
  badHabitResistPoints,
  computeBadHabitAwards,
} from '../points/badHabitAwards';

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

const slipsOf = (entries: PointsEntry[]) =>
  Object.fromEntries(entries.filter((e) => e.source === 'bad_habit_occurred').map((e) => [e.metadata?.badHabitId, e.amount]));
const dayLog = (id: string, badHabitId: string, date: string, status: BadHabitLog['status']): BadHabitLog => ({
  ...log(id, badHabitId, 1, status),
  date,
});
const before = (days: number) => {
  const d = new Date(START - days * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 4. Every active bad habit can lose points (no 2-oldest slots): a first slip = its resist points at 1x.
{
  // Added today, so no bad days before: 1x.
  const habits = [bh('e1', 'Porn', 30, true), bh('e2', 'Junk food', 30, true), bh('e3', 'Staying up late', 30, true)];
  const logs = [log('o1', 'e1', 1, 'occurred'), log('o3', 'e3', 2, 'occurred')];
  const { entries, logPoints } = computeBadHabitAwards(habits, logs, [], DAY, START, NOW, 0);
  const s = slipsOf(entries);
  assert(s.e1 === -3 && s.e3 === -1 && !('e2' in s), 'third habit is charged too: Porn -3, Staying up late -1');
  assert(logPoints.get('o1') === -3 && logPoints.get('o3') === -1, 'logs carry their penalty');
}

// 5. A first slip costs exactly the resist points (no extra); custom bad habit (resist 1) is penalised: -1.
{
  assert(badHabitPenalty({ name: 'Porn', isPreset: true }, 1, 0) === 3, 'Porn first slip 3');
  assert(badHabitPenalty({ name: 'Doomscrolling', isPreset: true }, 1, 0) === 2, 'Doomscrolling first slip 2');
  assert(badHabitPenalty({ name: 'Junk food', isPreset: true }, 1, 0) === 1, 'Junk food first slip 1');
  assert(badHabitPenalty({ name: 'Nail biting' }, 1, 0) === 1, 'custom first slip 1');
  const { entries } = computeBadHabitAwards([bh('c', 'Nail biting', 30)], [log('oc', 'c', 1, 'occurred')], [], DAY, START, NOW, 0);
  assert(slipsOf(entries).c === -1, 'custom slip -1');
}

// 6. Miss multiplier: 1x, 1.5x (round half up); Performer+ 2x, 2.5x. Positive product rounded, then negated.
{
  const porn = { name: 'Porn', isPreset: true };
  const junk = { name: 'Junk food', isPreset: true };
  assert(badHabitPenalty(porn, 1, 0) === 3 && badHabitPenalty(porn, 2, 0) === 5 && badHabitPenalty(porn, 3, 0) === 5, 'Porn 3, 5 (4.5), 5');
  assert(badHabitPenalty(junk, 2, 0) === 2, 'Junk food 1 x 1.5 = 1.5 -> 2');
  assert(badHabitPenalty({ name: 'Doomscrolling', isPreset: true }, 2, 0) === 3, 'Doomscrolling 2 x 1.5 = 3');
  assert(badHabitPenalty(porn, 2, 2000) === 6 && badHabitPenalty(porn, 3, 2000) === 8, 'Performer Porn 6, 8 (7.5)');
  assert(badHabitPenalty(junk, 3, 2000) === 3, 'Performer Junk food 1 x 2.5 = 2.5 -> 3');
  // Added 29 days ago, never resisted: today is far past the 3rd bad day in a row.
  const habits = [bh('d', 'Doomscrolling', 1, true)];
  const logs = [dayLog('y2', 'd', before(2), 'occurred'), log('o', 'd', 3, 'occurred')];
  assert(slipsOf(computeBadHabitAwards(habits, logs, [], DAY, START, NOW, 0).entries).d === -3, 'bad days in a row, 1.5x: -3');
  assert(slipsOf(computeBadHabitAwards(habits, logs, [], DAY, START, NOW, 2500).entries).d === -5, 'bad days in a row, Performer 2.5x: -5');
}

// 7. Five slips in one day: only the 4 largest penalties count, whatever the log order; the rest 0.
{
  const habits = [
    bh('j', 'Junk food', 30, true),
    bh('s', 'Sugary drinks', 30, true),
    bh('p', 'Porn', 30, true),
    bh('k', 'Smoking / vaping', 30, true),
    bh('g', 'Gaming too long', 30, true),
  ];
  // Cheap slips logged first (j, s at 1), then the expensive ones.
  const logs = [log('oj', 'j', 1, 'occurred'), log('os', 's', 2, 'occurred'), log('op', 'p', 3, 'occurred'), log('ok', 'k', 4, 'occurred'), log('og', 'g', 5, 'occurred')];
  const { entries, logPoints } = computeBadHabitAwards(habits, logs, [], DAY, START, NOW, 0);
  const s = slipsOf(entries);
  assert(s.p === -3 && s.k === -3 && s.g === -2 && s.j === -1 && !('s' in s), 'top 4 by amount; tie -1/-1 goes to the earlier log');
  assert(logPoints.get('os') === 0, 'the 5th slip shows 0');
  // Undo the Porn slip: the Sugary drinks slip comes back.
  const undone = computeBadHabitAwards(habits, logs.filter((l) => l.id !== 'op'), entries, DAY, START, NOW, 0);
  const u = slipsOf(undone.entries);
  assert(u.s === -1 && u.j === -1 && u.k === -3 && u.g === -2 && !('p' in u), 'a freed slot goes to the next largest');
}

// 8. A penalty already written today keeps its amount and its rank uses it; other days' rows are never returned.
{
  const habits = [bh('a', 'Junk food', 1, true), bh('b', 'Porn', 2, true)];
  const kept: PointsEntry = {
    id: badHabitOccurredId('a', DAY), amount: -5, reason: '', source: 'bad_habit_occurred', timestamp: at(1), metadata: { badHabitId: 'a', date: DAY, status: 'occurred' },
  };
  const yesterday: PointsEntry = {
    id: badHabitOccurredId('b', before(1)), amount: -5, reason: '', source: 'bad_habit_occurred', timestamp: at(-5), metadata: { badHabitId: 'b', date: before(1), status: 'occurred' },
  };
  const logs = [log('oa', 'a', 1, 'occurred'), log('ob', 'b', 2, 'occurred'), dayLog('yb', 'b', before(1), 'occurred')];
  const { entries } = computeBadHabitAwards(habits, logs, [kept, yesterday], DAY, START, NOW, 0);
  const s = slipsOf(entries);
  assert(s.a === -5, 'old -5 row kept');
  assert(s.b === -5, 'new slip: Porn 3 x 1.5 = 4.5 -> -5');
  assert(entries.every((e) => e.metadata?.date === DAY), 'only today is recomputed; yesterday stays frozen');
}

console.log('badHabitAwards fixtures: all passed');
