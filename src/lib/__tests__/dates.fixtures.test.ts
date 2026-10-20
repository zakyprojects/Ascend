// Fixtures for the shared local-midnight-safe date utilities: day keys, Monday weeks,
// week stepping across year ends, and streaks. CI runs them in more than one time zone.
import { addDays, addWeeks, calculateBestStreak, calculateStreak, todayKey, weekKey } from '../dates';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const local = (key: string, hour = 0, minute = 0) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute);
};

// 1. Day keys follow the local calendar, edge to edge.
{
  assert(todayKey(local('2026-10-15', 0, 0)) === '2026-10-15', 'local midnight is the new day');
  assert(todayKey(local('2026-10-15', 23, 59)) === '2026-10-15', '23:59 is still the same day');
  assert(addDays('2026-12-31', 1) === '2027-01-01', 'year end');
  assert(addDays('2028-02-28', 1) === '2028-02-29', 'leap day');
  assert(addDays('2026-03-01', -1) === '2026-02-28', 'no leap day in 2026');
}

// 2. Every day for four years: addDays steps one calendar day, the week starts on Monday,
//    and stepping a week key lands on the key of the date 7 days later (also across year ends
//    and daylight-saving changes in the zone the test runs in).
{
  let key = '2026-01-01';
  for (let i = 0; i < 4 * 366; i++) {
    const next = addDays(key, 1);
    assert(addDays(next, -1) === key, `addDays round trip at ${key}`);
    assert(local(next).getTime() > local(key).getTime(), `addDays moves forward at ${key}`);
    const week = weekKey(local(key, 12));
    const nextWeek = weekKey(local(addDays(key, 7), 12));
    assert(addWeeks(week, 1) === nextWeek, `addWeeks +1 at ${key}: ${addWeeks(week, 1)} vs ${nextWeek}`);
    assert(addWeeks(nextWeek, -1) === week, `addWeeks -1 at ${key}`);
    if (local(key).getDay() !== 1) {
      assert(weekKey(local(key, 12)) === weekKey(local(addDays(key, -1), 12)), `week only changes on Monday (${key})`);
    }
    key = next;
  }
}

// 3. Streaks: today not done yet still keeps yesterday's streak; a gap ends it.
{
  const now = local('2026-10-15', 9);
  const done = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, { done: true, updatedAt: '' }]));
  assert(calculateStreak(done(['2026-10-13', '2026-10-14']), 'daily', now) === 2, 'open today keeps streak');
  assert(calculateStreak(done(['2026-10-13', '2026-10-14', '2026-10-15']), 'daily', now) === 3, 'done today counts');
  assert(calculateStreak(done(['2026-10-12', '2026-10-13']), 'daily', now) === 0, 'missed yesterday: 0');
  assert(calculateStreak({ '2026-10-14': { done: false, updatedAt: '' } }, 'daily', now) === 0, 'unchecked is not done');
  assert(calculateBestStreak(done(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-05']), 'daily') === 3, 'best across year end');
  const w = (k: string) => weekKey(local(k, 12));
  assert(calculateStreak([w('2026-12-21'), w('2026-12-28'), w('2027-01-04')], 'weekly', local('2027-01-06', 9)) === 3, 'weekly streak across year end');
}

console.log('dates fixtures: all passed');
