// Fixtures for the app's copy of the server's miss penalties (ascend_miss_multiplier and the
// consecutive-miss walk in ascend_process_penalties): 1x for the first miss, then 1.5x below
// 2000 season points, or 2x / 2.5x from 2000 points (Performer) up.
import type { Habit } from '@/types';
import { getHabitConsecutiveMisses, getMissPenaltyMultiplier } from '../habitPenalties';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// 1. Multiplier table (same CASE as ascend_miss_multiplier).
{
  const cases: Array<[number, number, number]> = [
    [0, 0, 1.0],
    [1, 0, 1.0],
    [2, 0, 1.5],
    [9, 1999, 1.5],
    [1, 2000, 1.0],
    [2, 2000, 2.0],
    [3, 2000, 2.5],
    [30, 99999, 2.5],
  ];
  for (const [misses, points, expected] of cases) {
    assert(getMissPenaltyMultiplier(misses, points) === expected, `misses ${misses}, points ${points} -> ${expected}`);
  }
}

const NOW = new Date('2026-10-15T12:00:00');
const daily = (completed: string[], createdAtPeriod = '2026-10-01'): Habit =>
  ({
    id: 'h',
    name: 'h',
    frequency: 'daily',
    points: 1,
    createdAt: new Date(`${createdAtPeriod}T08:00:00`).toISOString(),
    createdAtPeriod,
    completions: Object.fromEntries(completed.map((d) => [d, { done: true, updatedAt: '' }])),
  }) as unknown as Habit;

// 2. Consecutive misses count finished days back to the last completion.
{
  assert(getHabitConsecutiveMisses(daily(['2026-10-14']), NOW) === 0, 'done yesterday: 0 misses');
  assert(getHabitConsecutiveMisses(daily(['2026-10-12']), NOW) === 2, 'last done 3 days ago: 2 misses');
  assert(getHabitConsecutiveMisses(daily(['2026-10-15']), NOW) === 0, 'done today: streak of misses broken');
}

// 3. Days before the habit existed are never misses.
{
  assert(getHabitConsecutiveMisses(daily([], '2026-10-13'), NOW) === 2, 'created 2 days ago: only 13th and 14th');
  assert(getHabitConsecutiveMisses(daily([], '2026-10-15'), NOW) === 0, 'created today: no misses');
}

console.log('habitPenalties fixtures: all passed');
