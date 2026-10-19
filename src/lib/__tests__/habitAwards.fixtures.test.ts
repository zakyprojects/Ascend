// Fixtures for server-owned habit awards: the app's copy of the server's award rule
// (ascend_recompute_habit_awards), and the sync rules that keep those rows server-only.
import { DEFAULT_STATE, type AppState, type Habit } from '@/types';
import { computeHabitAwards, isRetiredAppHabitAward } from '../habitAwards';
import { diffSyncedCollections, hashRow } from '../sync/outbox';
import { applyRemoteChanges } from '../sync/pull';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const DAY = '2026-10-15';
const START = new Date(`${DAY}T00:00:00`).getTime();
const NOW = START + 12 * 3600_000;
const at = (h: number) => new Date(START + h * 3600_000).toISOString();

function habit(id: string, name: string, checkedHour: number | null, extra: Partial<Habit> = {}): Habit {
  return {
    id,
    name,
    frequency: 'daily',
    points: 99,
    isPreset: true,
    category: 'Physical Health',
    createdAt: at(-100),
    updatedAt: at(-1),
    completions: checkedHour === null ? {} : { [DAY]: { done: true, updatedAt: at(checkedHour) } },
    createdAtPeriod: DAY,
    missedPeriods: [],
    consecutiveMisses: 0,
    ...extra,
  } as Habit;
}

// 1. Catalogue points (stored points ignored), cap 10 in check order, duplicates and retired earn 0.
{
  const { allocation, entries } = computeHabitAwards(
    [
      habit('a', 'Learn something new', 1),
      habit('b', 'Pray / spiritual practice', 2),
      habit('c', 'Meditation', 3),
      habit('d', 'Cold shower', 4),
      habit('e', 'Wake up early', 5),
      habit('f', 'Sleep 7-8 hours', 6),
      habit('dup', 'Meditation', 7),
      habit('x', 'My custom', 8, { isPreset: false }),
      habit('r', 'No porn', 0),
      habit('u', 'Morning walk', null),
    ],
    DAY,
    START,
    NOW
  );
  assert(allocation.a === 3 && allocation.b === 2 && allocation.c === 2 && allocation.d === 2, 'catalogue amounts');
  assert(allocation.e === 1 && allocation.f === 0 && allocation.x === 0, 'last one partial, then cap reached');
  assert(!('dup' in allocation) && !('r' in allocation) && !('u' in allocation), 'not counted');
  assert(entries.length === 5 && entries.reduce((s, e) => s + e.amount, 0) === 10, 'five rows, 10 points');
  const a = entries.find((e) => e.metadata?.habitId === 'a')!;
  assert(a.id === `habit_award_a_${DAY}` && a.source === 'habit_completed', 'server id and source');
  assert(a.timestamp === at(1) && a.reason === 'Habit completed: Learn something new', 'timestamp and reason');
}

// 1b. Daily custom habits earn 1 inside the same cap and check order; weekly custom, the Reading
//     habit and every retired preset earn 0.
{
  const { allocation } = computeHabitAwards(
    [
      habit('c1', 'Call my mom', 1, { isPreset: false }),
      habit('w', 'Deep clean', 2, { isPreset: false, frequency: 'weekly' }),
      habit('rb', 'Reading (Books)', 3, { isSystemLinked: true, linkedModule: 'reading' }),
      habit('r7', 'Journaling', 4),
      habit('r3', 'Digital detox hour', 5),
      habit('n1', '10,000 steps', 6),
      habit('n2', 'Pray / spiritual practice', 7),
      habit('n3', 'Watch a lecture / tutorial', 8),
      habit('c2', 'Floss', 9, { isPreset: false }),
      habit('n4', 'Make your bed', 10),
      habit('c3', 'Stretch my back', 11, { isPreset: false }),
    ],
    DAY,
    START,
    NOW
  );
  assert(allocation.c1 === 1, 'custom 1');
  assert(!('w' in allocation) && !('rb' in allocation) && !('r7' in allocation) && !('r3' in allocation), 'weekly custom, Reading, retired 0');
  assert(allocation.n1 === 2 && allocation.n2 === 2 && allocation.n3 === 2 && allocation.c2 === 1 && allocation.n4 === 1, 'new presets');
  assert(allocation.c3 === 1, 'last point of the cap');
}

// 2. Timestamps clamp to the day: a spoofed earlier check time stays inside it.
{
  const { entries } = computeHabitAwards([habit('a', 'Meditation', -30)], DAY, START, NOW);
  assert(entries[0].timestamp === new Date(START).toISOString(), 'clamped to day start');
}

// 3. App-written awards for server days are retired; older ones and server rows stay.
{
  const legacy = { id: 'r1', amount: 2, reason: '', source: 'habit_completed', timestamp: at(1), metadata: { periodKey: DAY } };
  assert(isRetiredAppHabitAward(legacy), 'legacy today retired');
  assert(!isRetiredAppHabitAward({ ...legacy, metadata: { periodKey: '2026-10-14' } }), 'older kept');
  assert(!isRetiredAppHabitAward({ ...legacy, id: `habit_award_a_${DAY}` }), 'server row kept');
}

// 4. The outbox never uploads or deletes a points row (every one is the server's since
//    20261015250000), but still syncs the other collections.
{
  const server = { id: `habit_award_a_${DAY}`, amount: 3, reason: 'x', source: 'habit_completed', timestamp: at(1) };
  const preview = { id: 'w1', amount: 2, reason: 'w', source: 'workout', timestamp: at(1) };
  const skill = { id: 's1', name: 'Guitar', createdAt: at(1) } as unknown as AppState['skills'][number];
  const s1 = { ...DEFAULT_STATE, pointsHistory: [server, preview], skills: [skill] } as AppState;
  const r1 = diffSyncedCollections(s1, {}, {}, at(2));
  assert(!Object.keys(r1.outbox).some((k) => k.startsWith('point_entries:')), 'no points row uploaded');
  assert('skills:s1' in r1.outbox, 'other collection uploaded');

  const baseline = { pointsHistory: { [server.id]: 'serverhash' } };
  const s2 = { ...DEFAULT_STATE, pointsHistory: [preview] } as AppState;
  const r2 = diffSyncedCollections(s2, baseline, {}, at(3));
  assert(!Object.keys(r2.outbox).some((k) => k.startsWith('point_entries:')), 'local removal of a server row is not a delete');
  assert(r2.baseline.pointsHistory[server.id] === 'serverhash', 'server baseline kept');
}

// 5. A full pull drops local points rows the server does not hold (e.g. checked offline
//    before midnight, or an app preview row), and keeps the ones it does.
{
  const keep = { id: `habit_award_a_${DAY}`, amount: 3, reason: 'x', source: 'habit_completed', timestamp: at(1) };
  const stale = { id: 'habit_award_b_2026-10-14', amount: 2, reason: 'y', source: 'habit_completed', timestamp: at(-2) };
  const preview = { id: 'w1', amount: 2, reason: 'w', source: 'workout', timestamp: at(1) };
  const s = { ...DEFAULT_STATE, pointsHistory: [keep, stale, preview] } as AppState;
  const next = applyRemoteChanges(s, [{ key: 'pointsHistory', id: '', item: null, serverOwnedLive: [keep.id] }]);
  const ids = next.pointsHistory.map((e) => e.id);
  assert(ids.length === 1 && ids[0] === keep.id, 'snapshot purge');
  assert(hashRow({ a: 1 }) === hashRow({ a: 1 }), 'hash stable');
}

console.log('habitAwards fixtures: all passed');
