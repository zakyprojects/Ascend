// exerciseSummary (lib/exerciseSummary.ts): exercise amounts in their own unit with the member card's
// exact strings, and the card's ranking (days, then logs, then newest; one row per exercise and unit).
import type { WorkoutLog } from '@/types';
const { exerciseAmountText, minutesText, topWorkouts } = await import('../items/exerciseSummary');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (got: unknown, want: unknown, msg: string) =>
  assert(JSON.stringify(got) === JSON.stringify(want), `${msg}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

// The member card's strings (CompetitorProfileModal exerciseText/minutesText).
const amounts: Array<[number, 'mins' | 'reps' | 'sets' | 'km', string]> = [
  // One duration style everywhere (Zakria 2026-11-12): "1h 30m" (lib/time/duration.ts).
  [45, 'mins', '45m'],
  [1, 'mins', '1m'],
  [0, 'mins', '0m'],
  [44.6, 'mins', '45m'],
  [59.4, 'mins', '59m'],
  [60, 'mins', '1h'],
  [90, 'mins', '1h 30m'],
  [1250, 'mins', '20h 50m'],
  [5.75, 'km', '5.75 km'],
  [0.1, 'km', '0.1 km'],
  [1, 'km', '1 km'],
  [12500, 'km', '12.5k km'],
  [1, 'reps', '1 rep'],
  [50, 'reps', '50 reps'],
  [9999, 'reps', '9,999 reps'],
  [12500, 'reps', '12.5k reps'],
  [1, 'sets', '1 set'],
  [5, 'sets', '5 sets'],
];
for (const [n, unit, want] of amounts) eq(exerciseAmountText(n, unit), want, `${n} ${unit}`);
eq(minutesText(600000), '10k h', 'hours short from 10,000, minutes left out');
{
  const { durationText } = await import('../time/duration');
  const { formatDurationHuman } = await import('../timeTracker/timeTracker');
  eq(
    [durationText(0), durationText(-5), durationText(NaN), durationText(119.6), durationText(120), durationText(125), durationText(60 * 1234 + 5), durationText(599999)],
    ['0m', '0m', '0m', '2h', '2h', '2h 5m', '1,234h 5m', '9,999h 59m'],
    'durationText: whole minutes, never "1h 60m", grouping below 10,000 h'
  );
  eq([formatDurationHuman(90), minutesText(90)], ['1h 30m', '1h 30m'], 'Time Tracker and the member card share the style');
}

let seq = 0;
const w = (date: string, type: string, amount: number | undefined, unit?: string, durationMinutes = 0): WorkoutLog => ({
  id: `w${++seq}`,
  date,
  type,
  durationMinutes,
  pointsAwarded: 0,
  amount,
  unit,
  createdAt: `${date}T10:00:${String(seq).padStart(2, '0')}.000Z`,
});

// Browser checklist fixture: Running 2 logs on one day wins the tie on days by logs.
{
  const rows = topWorkouts(
    [w('2026-11-02', 'Push-ups', 50, 'reps'), w('2026-11-03', 'Running', 5, 'km'), w('2026-11-03', 'Running', 2.5, 'km'), w('2026-11-04', 'Yoga', 30, 'mins', 30)],
    '2026-11-02',
    '2026-11-08'
  );
  eq(rows.map((r) => r.name), ['Running', 'Yoga', 'Push-ups'], 'ranking: days tie, logs, then newest');
  eq(rows[0], { name: 'Running', unit: 'km', total: 7.5, days: 1, best: 7.5, sessions: 2 }, 'Running row');
  eq(exerciseAmountText(rows[0].total, rows[0].unit), '7.5 km', 'top line amount');
}

// More days beats more logs; same name in two units never adds; spelling variants are one exercise.
{
  const rows = topWorkouts(
    [
      w('2026-11-02', 'push ups', 20, 'reps'),
      w('2026-11-03', 'Push-ups', 30, 'reps'),
      w('2026-11-04', 'Running', 5, 'km'),
      w('2026-11-04', 'Running', 30, 'mins', 30),
      w('2026-11-04', 'Running', 20, 'mins', 20),
    ],
    '2026-11-02',
    '2026-11-08'
  );
  eq(rows.length, 3, 'three groups');
  eq(rows[0], { name: 'Push-ups', unit: 'reps', total: 50, days: 2, best: 30, sessions: 2 }, 'newest spelling, two days first');
  eq([rows[1].unit, rows[1].total, rows[1].sessions], ['mins', 50, 2], 'Running minutes apart from km');
  eq([rows[2].unit, rows[2].total], ['km', 5], 'Running km');
}

// Decimals, legacy rows and the range.
{
  const rows = topWorkouts(
    [
      w('2026-11-05', 'Running', 2.5, 'km'),
      w('2026-11-05', 'Running', 3.25, 'km'),
      w('2026-11-05', 'Walk', undefined, undefined, 45), // legacy: no unit, minutes in durationMinutes
      w('2026-11-05', 'Walk', 0, 'sessions', 15), // odd unit counts as minutes
      w('2026-11-01', 'Old', 10, 'reps'), // before the range
      w('2026-11-09', 'Future', 10, 'reps'), // after the range
      w('bad', 'Broken', 10, 'reps'),
    ],
    '2026-11-02',
    '2026-11-08'
  );
  eq(rows.map((r) => `${r.name}:${exerciseAmountText(r.total, r.unit)}`), ['Walk:1h', 'Running:5.75 km'], 'decimals, legacy minutes, range');
}

eq(topWorkouts([], '2026-11-02', '2026-11-08'), [], 'empty');
eq(topWorkouts([w('2026-11-02', '   ', 3, 'sets')], '2026-11-02', '2026-11-02')[0].name, 'Workout', 'blank name');
eq(topWorkouts([w('2026-11-02', 'x'.repeat(60), 3, 'sets')], '2026-11-02', '2026-11-02')[0].name.length, 40, 'name ≤ 40');

console.log('exerciseSummary fixtures: all passed');
