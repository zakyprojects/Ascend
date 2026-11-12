// U14 (2026-11-12): the award mirrors share localDayOf / timeMsOr from dates.ts. Each mirror keeps
// its own fallback for a time that does not parse: habit, reading, skill and workout sort it last
// (Infinity), bad habits sort it first (0). Award results must stay exactly as before.
import type { BadHabit, BadHabitLog, Habit, ReadingLog, Skill, SkillSessionLog, UserBook, WorkoutLog } from '@/types';
import { localDayOf, timeMsOr, todayKey } from '../dates';
import { computeHabitAwards } from '../habitAwards';
import { computeReadingDayAward } from '../readingAwards';
import { computeSkillAwards } from '../skillAwards';
import { computeWorkoutAwards } from '../workoutAwards';
import { badHabitResistId, computeBadHabitAwards } from '../badHabitAwards';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(Object.is(a, b), `${msg} (got ${String(a)}, want ${String(b)})`);

const DAY = '2026-10-20';
const START = new Date(`${DAY}T00:00:00`).getTime();
const NOW = START + 20 * 3600_000;
const at = (h: number) => new Date(START + h * 3600_000).toISOString();
const BAD = 'not a time';

// 1. The shared helpers give the same value as the old per-file copies, for every kind of input.
{
  const oldInfinity = (value: string) => {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? Infinity : ms;
  };
  const oldZero = (value?: string) => {
    const ms = new Date(value || 0).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  };
  const oldLocalDayOf = (timestamp: string) => {
    const d = new Date(timestamp);
    return Number.isNaN(d.getTime()) ? null : todayKey(d);
  };
  const inputs = [at(9), '2026-10-20', BAD, '', undefined, null, 0] as unknown as string[];
  for (const v of inputs) {
    eq(timeMsOr(v, Infinity), oldInfinity(v), `Infinity fallback for ${JSON.stringify(v)}`);
    eq(timeMsOr(v, 0), oldZero(v), `0 fallback for ${JSON.stringify(v)}`);
  }
  for (const v of [at(9), at(23.99), BAD, ''])
    eq(localDayOf(v), oldLocalDayOf(v), `localDayOf ${JSON.stringify(v)}`);
}

// 2. Habit: of two checks of the same habit, a check time that does not parse counts as latest.
{
  const habit = (id: string, checkedAt: string): Habit =>
    ({
      id,
      name: 'Cold shower',
      frequency: 'daily',
      points: 2,
      isPreset: true,
      category: 'Physical Health',
      createdAt: at(-100),
      updatedAt: at(-1),
      completions: { [DAY]: { done: true, updatedAt: checkedAt } },
      createdAtPeriod: DAY,
      missedPeriods: [],
      consecutiveMisses: 0,
    }) as unknown as Habit;
  const { allocation, entries } = computeHabitAwards([habit('a', BAD), habit('z', at(9))], DAY, START, NOW);
  eq(allocation.z, 2, 'habit: the parsed check earns');
  eq(allocation.a ?? 0, 0, 'habit: the unparsed check is a duplicate');
  eq(entries.length, 1, 'habit: one row');
  eq(entries[0]?.timestamp, at(9), 'habit: row at the parsed check');
}

// 3. Reading: an unparsed log time goes after the parsed one in the cap order.
{
  const books = [{ id: 'b1', unit: 'pages', status: 'reading' } as unknown as UserBook];
  const rlog = (id: string, createdAt: string): ReadingLog => ({ id, bookId: 'b1', date: DAY, pagesRead: 40, createdAt });
  const { entry, logPoints } = computeReadingDayAward([rlog('a', BAD), rlog('z', at(9))], books, DAY, START, NOW);
  eq(logPoints.get('z'), 10, 'reading: parsed log fills the cap');
  eq(logPoints.get('a'), 0, 'reading: unparsed log comes after');
  eq(entry?.timestamp, at(9), 'reading: row at the parsed log');
}

// 4. Skill: same order rule.
{
  const skills = [{ id: 's1' } as unknown as Skill];
  const slog = (id: string, createdAt: string): SkillSessionLog =>
    ({ id, skillId: 's1', date: DAY, durationMinutes: 600, createdAt }) as unknown as SkillSessionLog;
  const { entry, sessionPoints } = computeSkillAwards([slog('a', BAD), slog('z', at(9))], skills, DAY, START, NOW);
  eq(sessionPoints.get('z'), 10, 'skill: parsed session fills the cap');
  eq(sessionPoints.get('a'), 0, 'skill: unparsed session comes after');
  eq(entry?.timestamp, at(9), 'skill: row at the parsed session');
}

// 5. Workout: same order rule.
{
  const wlog = (id: string, createdAt: string): WorkoutLog =>
    ({ id, date: DAY, type: 'Running', unit: 'mins', durationMinutes: 600, amount: 600, createdAt }) as unknown as WorkoutLog;
  const { entry, workoutPoints } = computeWorkoutAwards([wlog('a', BAD), wlog('z', at(9))], DAY, START, NOW);
  eq(workoutPoints.get('z'), 10, 'workout: parsed workout fills the cap');
  eq(workoutPoints.get('a'), 0, 'workout: unparsed workout comes after');
  eq(entry?.timestamp, at(9), 'workout: row at the parsed workout');
}

// 6. Bad habit: an unparsed log time counts as earliest (0), so that log is the day's resist,
// and its row is stamped at the start of the day.
{
  const habits: BadHabit[] = [{ id: 'p', name: 'Porn', isPreset: true, createdAt: new Date(START - 30 * 86400_000).toISOString() }];
  const blog = (id: string, createdAt: string): BadHabitLog => ({
    id,
    badHabitId: 'p',
    date: DAY,
    status: 'resisted',
    pointsAwardedOrDeducted: 0,
    createdAt,
  });
  const { entries, logPoints } = computeBadHabitAwards(habits, [blog('z', at(9)), blog('a', BAD)], [], DAY, START, NOW, 0);
  eq(logPoints.get('a'), 3, 'bad habit: unparsed log is first and earns');
  eq(logPoints.get('z'), 0, 'bad habit: the later log earns nothing');
  const row = entries.find((e) => e.id === badHabitResistId('p', DAY));
  eq(row?.timestamp, new Date(START).toISOString(), 'bad habit: row at the start of the day');
}

console.log('awardTimeFallbacks: all passed');
