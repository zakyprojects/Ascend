// Member stats (lib/memberStats.ts): the legacy profiles.stats keys production app versions read (no
// card any more: the server builds it, ascend_member_card), and the reader of the server's season card
// (v2): known keys only, numeric strings parsed, numbers clamped, names capped, null = not shared.
import type { AppState, Habit, WorkoutLog } from '@/types';

// Node has no localStorage: a small in-memory one.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
} as Storage;

const { buildMemberStats, toSeasonCard } = await import('../leagues/memberStats');
const { toCompetitorStats } = await import('../auth/auth');
const { addDays } = await import('../time/dates');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const TODAY = '2026-12-20';
const SEASON_START = Date.UTC(2026, 10, 1); // Season 1: 2026-11-01 00:00 UTC
const clock = { today: TODAY, seasonStartMs: SEASON_START };
const day = (n: number) => addDays(TODAY, -n); // n days ago
const OLD_USER = { id: 'u', uid: '123456', email: '', username: 'ali', avatar: '🧑', createdAt: '2026-01-01T10:00:00Z' };

let seq = 0;
const workout = (date: string, type: string, unit: string | undefined, amount: number | undefined, durationMinutes = 0): WorkoutLog => ({
  id: `w${++seq}`,
  date,
  type,
  unit,
  amount,
  durationMinutes,
  pointsAwarded: 0,
  createdAt: `${date}T08:00:${String(seq % 60).padStart(2, '0')}Z`,
});
const habit = (id: string, frequency: 'daily' | 'weekly', createdAtPeriod: string, doneKeys: string[]): Habit => ({
  id,
  name: `Secret habit ${id}`,
  frequency,
  points: 1,
  isPreset: false,
  createdAt: '2026-01-01T00:00:00Z',
  createdAtPeriod,
  completions: Object.fromEntries(doneKeys.map((k) => [k, { done: true, updatedAt: `${TODAY}T09:00:00Z` }])),
});
const state = (s: Partial<AppState>): Partial<AppState> => ({ currentUser: OLD_USER, ...s });

// --- 1. Legacy keys unchanged for production app versions; streak kept; no card written ---
{
  const h = habit('a', 'daily', day(3), [day(2), day(1), TODAY]);
  const stats = buildMemberStats(state({ habits: [h], workouts: [workout(day(1), 'Run', 'mins', 30, 30), workout(day(1), 'Push-ups', 'reps', 50)], skillLogs: [], journalEntries: [] }), clock);
  eq([stats.habitsCompletedCount, stats.habitsCompletedTodayCount, stats.exerciseMinutes, stats.skillsPracticedCount, stats.journalEntriesCount], [3, 1, 30, 0, 0], 'lifetime keys as before');
  eq(stats.currentStreakDays, 3, 'streak from the shared streak logic');
  assert(!('card' in stats), 'the writer no longer sends a card');
  const legacy = toCompetitorStats({ currentStreakDays: 4, habitsCompletedCount: 9, exerciseMinutes: 0, card: { v: 1 } })!;
  assert(!('card' in legacy) && legacy.currentStreakDays === 4, 'reader ignores an old stats.card, streak kept');
}

// --- 2. Payload stays small for a heavy history ---
{
  const workouts = Array.from({ length: 2000 }, (_, i) => workout(day(i % 400), `Exercise number ${i % 25} with a long name here`, ['reps', 'km', 'mins', 'sets'][i % 4], 10));
  const size = JSON.stringify(buildMemberStats(state({ workouts }), clock)).length;
  assert(size < 1024, `stats under 1 KB (got ${size})`);
}

// --- 3. The server card (live sample shape, 2026-11-07): numerics as strings or decimals ---
const sample = {
  v: 2,
  asOf: '2026-11-07',
  days: 7,
  from: '2026-11-01',
  focus: { minutes: 465, sessions: 9 },
  today: { habitsDone: 10 },
  active: 7,
  habits: { due: 82, done: 76 },
  season: 1,
  skills: { days: 6, minutes: 455 },
  streak: { days: 7, category: 'Physical Health' },
  journal: { days: 6 },
  reading: { days: 6, pages: 90, booksThisSeason: 0 },
  exercise: [{ best: '205.00', days: 5, name: 'Push-ups', unit: 'reps', total: '625.00' }],
  seasonEnd: '2027-01-30T00:00:00Z',
  seasonStart: '2026-11-01T00:00:00Z',
};
{
  const card = toSeasonCard(sample)!;
  eq(card, {
    v: 2,
    season: 1,
    asOf: '2026-11-07',
    from: '2026-11-01',
    days: 7,
    active: 7,
    streak: { days: 7, category: 'Physical Health' },
    today: { habitsDone: 10 },
    seasonStart: '2026-11-01T00:00:00Z',
    seasonEnd: '2027-01-30T00:00:00Z',
    habits: { done: 76, due: 82 },
    exercise: [{ name: 'Push-ups', unit: 'reps', total: 625, days: 5, best: 205 }],
    skills: { minutes: 455, days: 6 },
    reading: { days: 6, booksThisSeason: 0, pages: 90 },
    focus: { minutes: 465, sessions: 9 },
    journal: { days: 6 },
  }, 'live sample parsed');
}

// --- 4. Quiet member: unused modules absent, nothing invented ---
{
  const quiet = toSeasonCard({ v: 2, asOf: '2026-11-07', days: 2, from: '2026-11-06', today: { habitsDone: 0 }, active: 0, season: 1, streak: { days: 0, category: '' }, seasonEnd: '2027-01-30T00:00:00Z', seasonStart: '2026-11-01T00:00:00Z' })!;
  assert(quiet.habits === undefined && quiet.exercise === undefined && quiet.skills === undefined && quiet.reading === undefined, 'never-used modules stay absent');
  eq([quiet.days, quiet.active, quiet.streak.days], [2, 0, 0], 'zeros where the server sent zeros');
}

// --- 5. Untrusted input: null / unknown version / bad keys; clamping ---
{
  assert(toSeasonCard(null) === undefined && toSeasonCard(undefined) === undefined, 'null = not shared');
  assert(toSeasonCard({ ...sample, v: 1 }) === undefined && toSeasonCard({ ...sample, asOf: 'nope' }) === undefined, 'unknown version / bad day');
  assert(toSeasonCard({ ...sample, seasonStart: 'x' }) === undefined, 'bad season start');
  const card = toSeasonCard({
    ...sample,
    days: 5,
    active: 45,
    extra: 'dropped',
    habits: { done: 50, due: 10 },
    exercise: [{ name: ' Run ', unit: 'km', total: -3, days: 40, best: 2.345 }, { name: 'Bad', unit: 'miles', total: 1 }, { name: 'y'.repeat(60), unit: 'reps', total: '5', days: 1, best: 5 }],
    skills: { minutes: 12.7, days: 3, name: 'Guitar' },
    journal: { days: 'x' },
  })!;
  eq([card.days, card.active], [5, 5], 'active never above days');
  eq(card.habits, { done: 10, due: 10 }, 'done never above due');
  eq(card.exercise, [{ name: 'Run', unit: 'km', total: 0, days: 5, best: 2.35 }, { name: 'y'.repeat(40), unit: 'reps', total: 5, days: 1, best: 5 }], 'filtered and capped');
  eq(card.skills, { minutes: 12, days: 3 }, 'no skill name');
  eq(card.journal, { days: 0 }, 'bad number = 0');
  assert(!JSON.stringify(card).includes('extra'), 'unknown keys dropped');
}

console.log('memberStats fixtures: all passed');
