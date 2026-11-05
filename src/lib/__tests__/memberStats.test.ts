// Member card stats (lib/memberStats.ts): the last-30-days figures each member's app writes into
// profiles.stats.card and the viewer's own card in Leagues. Exercise in its own unit (never 0 min for
// reps), numbers that stop growing with account age, habit rate with today counted only once done,
// hidden never-used modules, no private names or text in the payload, and the reader's clamping.
import type { AppState, Habit, JournalEntry, ReadingLog, SkillSessionLog, UserBook, WorkoutLog, FocusSessionLog, Skill } from '@/types';

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

const { buildMemberCard, buildMemberStats, toMemberCard, MEMBER_CARD_DAYS } = await import('../memberStats');
const { toCompetitorStats } = await import('../auth');
const { addDays } = await import('../dates');

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

// --- 1. Reps-only member: reps in their own unit, never 0 min (success criterion 1) ---
{
  const joined = { ...OLD_USER, createdAt: `${day(9)}T06:00:00` };
  const workouts = Array.from({ length: 10 }, (_, i) => workout(day(i), 'Push-ups', 'reps', 100));
  const card = buildMemberCard({ currentUser: joined, workouts }, clock);
  eq(card.exercise, [{ name: 'Push-ups', unit: 'reps', total: 1000, days: 10, best: 100 }], 'push-ups 10 days');
  eq(card.days, 10, 'young account: days since joining');
  eq(card.active, 10, 'active days');
  assert(card.skills === undefined && card.reading === undefined && card.focus === undefined && card.journal === undefined && card.habits === undefined, 'never-used modules left out');
}

// --- 2. Constant behaviour, constant numbers: day 30 equals day 60 (criterion 2) ---
{
  const workouts = Array.from({ length: 60 }, (_, i) => workout(day(i), 'Push-ups', 'reps', 100));
  const at60 = buildMemberCard(state({ workouts }), clock);
  const at30 = buildMemberCard(state({ workouts: workouts.slice(30) }), { ...clock, today: day(30) });
  eq(at60.exercise?.[0].total, 3000, 'day 60 total');
  eq(at30.exercise?.[0].total, 3000, 'day 30 total');
  eq(at60.days, MEMBER_CARD_DAYS, 'old account: full window');
}

// --- 3. Habit rate: today due only once done (criterion 4) ---
{
  // Two daily habits created 9 days ago (today = their 10th day), 15 ticks on the 9 past days.
  const pastDays = Array.from({ length: 9 }, (_, i) => day(i + 1));
  const a = habit('a', 'daily', day(9), pastDays);
  const b = habit('b', 'daily', day(9), pastDays.slice(0, 6));
  eq(buildMemberCard(state({ habits: [a, b] }), clock).habits, { done: 15, due: 18 }, '15 of 18, today not due');
  const aToday = habit('a', 'daily', day(9), [...pastDays, TODAY]);
  eq(buildMemberCard(state({ habits: [aToday, b] }), clock).habits, { done: 16, due: 19 }, '16 of 19 after a tick today');
  // A habit older than the window counts the 29 past days only.
  eq(buildMemberCard(state({ habits: [habit('c', 'daily', '2025-01-01', [])] }), clock).habits, { done: 0, due: 29 }, 'old habit: 29 due');
  // Legacy array completions.
  const legacy = { ...habit('d', 'daily', day(2), []), completions: [day(1), TODAY] as unknown as Habit['completions'] };
  eq(buildMemberCard(state({ habits: [legacy] }), clock).habits, { done: 2, due: 3 }, 'legacy array completions');
}

// --- 4. Weekly habit: ended weeks are due, this week only once done ---
{
  const { weekKey, parseDate } = await import('../dates');
  const wk = (n: number) => weekKey(parseDate(day(n))!);
  const weeks = [...new Set(Array.from({ length: 30 }, (_, i) => wk(i)))];
  const thisWeek = wk(0);
  const pastWeeks = weeks.filter((w) => w !== thisWeek);
  const h = habit('w', 'weekly', '2025-W01', [pastWeeks[0]]);
  eq(buildMemberCard(state({ habits: [h] }), clock).habits, { done: 1, due: pastWeeks.length }, 'weekly: this week not due');
  const h2 = habit('w', 'weekly', '2025-W01', [pastWeeks[0], thisWeek]);
  eq(buildMemberCard(state({ habits: [h2] }), clock).habits, { done: 2, due: pastWeeks.length + 1 }, 'weekly: this week due once done');
}

// --- 5. Exercise grouping: units apart, spellings together, ranked by days, top 3 ---
{
  const workouts = [
    workout(day(1), 'Running', 'km', 5),
    workout(day(2), 'Running', 'km', 3.5),
    workout(day(2), 'Running', 'km', 1.75), // same day: best day 5.25
    workout(day(3), 'Running', 'mins', 30, 30),
    workout(day(4), 'push ups', 'reps', 20),
    workout(day(3), 'Push-ups', 'reps', 30),
    workout(day(1), 'Push Ups', 'reps', 40), // newest spelling wins
    workout(day(5), 'Yoga', undefined, undefined, 45), // legacy: no unit → minutes from durationMinutes
    workout(day(6), 'Yoga', 'sessions', 0, 15), // 'sessions' → minutes
    workout(day(40), 'Swimming', 'mins', 60, 60), // outside the window
  ];
  const card = buildMemberCard(state({ workouts }), clock);
  eq(card.exercise, [
    { name: 'Push Ups', unit: 'reps', total: 90, days: 3, best: 40 },
    { name: 'Running', unit: 'km', total: 10.25, days: 2, best: 5.25 },
    { name: 'Yoga', unit: 'mins', total: 60, days: 2, best: 45 },
  ], 'top 3 by days, each in its own unit');
  // Tie on days: more sessions first.
  const tie = buildMemberCard(state({ workouts: [workout(day(1), 'A', 'reps', 1), workout(day(1), 'B', 'sets', 1), workout(day(1), 'B', 'sets', 2)] }), clock);
  eq(tie.exercise?.map((e) => e.name), ['B', 'A'], 'tie-break by sessions');
  // Used but nothing in 30 days: an empty list, not hidden.
  eq(buildMemberCard(state({ workouts: [workout(day(40), 'Run', 'km', 3)] }), clock).exercise, [], 'quiet exercise = empty list');
  const long = buildMemberCard(state({ workouts: [workout(day(1), 'x'.repeat(80), 'reps', 1)] }), clock);
  eq(long.exercise?.[0].name.length, 40, 'name capped at 40');
}

// --- 6. Skills, reading, focus, journal ---
{
  const skills: Skill[] = [{ id: 's1', name: 'Guitar', createdAt: '2026-01-01T00:00:00Z' }];
  const skillLogs: SkillSessionLog[] = [
    { id: 'k1', skillId: 's1', date: day(1), durationMinutes: 90, note: 'private note', pointsAwarded: 0, createdAt: '' },
    { id: 'k2', skillId: 's1', date: day(1), durationMinutes: 30, note: '', pointsAwarded: 0, createdAt: '' },
    { id: 'k3', skillId: 's1', date: day(3), durationMinutes: 15, note: '', pointsAwarded: 0, createdAt: '' },
    { id: 'k4', skillId: 's1', date: day(45), durationMinutes: 600, note: '', pointsAwarded: 0, createdAt: '' },
  ];
  const book = (id: string, unit: string, extra: Partial<UserBook> = {}): UserBook => ({ id, title: `Private title ${id}`, author: '', unit, status: 'reading', pointsAwarded: 0, addedAt: '', ...extra });
  const libraryBooks = [
    book('p1', 'pages', { status: 'completed', completedAt: '2026-11-15T10:00:00Z' }),
    book('p2', 'pages', { isFinished: true, dateCompleted: '2026-10-20T10:00:00Z' }), // finished last season
    book('c1', 'chapters'),
  ];
  const rlog = (id: string, bookId: string, date: string, pagesRead: number, finish = false): ReadingLog => ({ id, bookId, date, pagesRead, createdAt: '', ...(finish ? { finish } : {}) });
  const pagesOnly = [rlog('r1', 'p1', day(1), 40), rlog('r2', 'p1', day(2), 25), rlog('r3', 'p1', day(4), 200, true)];
  const focusLogs: FocusSessionLog[] = [
    { id: 'f1', date: day(1), taskName: 'Private task', durationMinutes: 50, pointsAwarded: 0, createdAt: '' },
    { id: 'f2', date: day(2), taskName: 'x', skillId: 's1', durationMinutes: 25, pointsAwarded: 0, createdAt: '' },
  ];
  const journalEntries: JournalEntry[] = [
    { id: 'j1', date: day(1), mood: 'great' as JournalEntry['mood'], content: 'Very private words', createdAt: '', pointsAwarded: true },
    { id: 'j2', date: day(50), mood: 'okay' as JournalEntry['mood'], content: 'old', createdAt: '', pointsAwarded: true },
  ];
  const card = buildMemberCard(state({ skills, skillLogs, libraryBooks, readingLogs: pagesOnly, focusLogs, journalEntries }), clock);
  eq(card.skills, { minutes: 135, days: 2 }, 'skills: minutes and days in the window');
  eq(card.reading, { days: 3, booksThisSeason: 1, pages: 65 }, 'reading: finish log is a day, not pages; one book this season');
  eq(card.focus, { minutes: 75, sessions: 2 }, 'focus with a skill counts under focus');
  eq(card.journal, { days: 1 }, 'journal days');
  eq(card.active, 4, 'active days across modules (days 1-4)');

  const mixed = buildMemberCard(state({ libraryBooks, readingLogs: [...pagesOnly, rlog('r4', 'c1', day(1), 2)] }), clock);
  eq(mixed.reading, { days: 3, booksThisSeason: 1 }, 'a chapter book in the window: no pages figure');
  eq(buildMemberCard(state({ libraryBooks: [book('c1', 'chapters')] }), clock).reading, { days: 0, booksThisSeason: 0 }, 'books but no logs: quiet reading');

  // Privacy: aggregates only (criterion 10).
  const stats = buildMemberStats(state({ skills, skillLogs, libraryBooks, readingLogs: pagesOnly, focusLogs, journalEntries, habits: [habit('a', 'daily', day(3), [day(1)])] }), clock);
  const json = JSON.stringify(stats);
  for (const secret of ['Guitar', 'Private title', 'Very private', 'great', 'Secret habit', 'Private task', 'private note']) {
    assert(!json.includes(secret), `no "${secret}" in profiles.stats`);
  }
  assert(!('badHabits' in stats.card) && !json.includes('resist'), 'no bad-habit figures');
}

// --- 7. Legacy keys unchanged for older app versions; streak kept ---
{
  const h = habit('a', 'daily', day(3), [day(2), day(1), TODAY]);
  const stats = buildMemberStats(state({ habits: [h], workouts: [workout(day(1), 'Run', 'mins', 30, 30), workout(day(1), 'Push-ups', 'reps', 50)], skillLogs: [], journalEntries: [] }), clock);
  eq([stats.habitsCompletedCount, stats.habitsCompletedTodayCount, stats.exerciseMinutes, stats.skillsPracticedCount, stats.journalEntriesCount], [3, 1, 30, 0, 0], 'lifetime keys as before');
  eq(stats.currentStreakDays, 3, 'streak from the shared streak logic');
}

// --- 8. Nothing ever logged: empty card ---
{
  const card = buildMemberCard(state({}), clock);
  eq(card, { v: 1, asOf: TODAY, days: 30, active: 0 }, 'empty card');
}

// --- 9. Payload stays small for a heavy history ---
{
  const workouts = Array.from({ length: 2000 }, (_, i) => workout(day(i % 400), `Exercise number ${i % 25} with a long name here`, ['reps', 'km', 'mins', 'sets'][i % 4], 10));
  const size = JSON.stringify(buildMemberStats(state({ workouts }), clock)).length;
  assert(size < 2048, `stats under 2 KB (got ${size})`);
}

// --- 10. Reading another member's card: known keys only, clamped; old shape has none ---
{
  assert(toMemberCard(undefined) === undefined && toMemberCard({ v: 2, asOf: TODAY }) === undefined && toMemberCard({ v: 1, asOf: 'nope' }) === undefined, 'no card / unknown version');
  const card = toMemberCard({
    v: 1,
    asOf: TODAY,
    days: 99,
    active: 45,
    extra: 'dropped',
    habits: { done: 50, due: 10 },
    exercise: [{ name: ' Run ', unit: 'km', total: -3, days: 40, best: 2.345 }, { name: 'Bad', unit: 'miles', total: 1 }, { name: 'y'.repeat(60), unit: 'reps', total: 5, days: 1, best: 5 }],
    skills: { minutes: 12.7, days: 3, name: 'Guitar' },
    reading: { days: 2, booksThisSeason: 1 },
    journal: { days: 'x' },
  })!;
  eq(card, {
    v: 1,
    asOf: TODAY,
    days: 30,
    active: 30,
    habits: { done: 10, due: 10 },
    exercise: [{ name: 'Run', unit: 'km', total: 0, days: 30, best: 2.35 }, { name: 'y'.repeat(40), unit: 'reps', total: 5, days: 1, best: 5 }],
    skills: { minutes: 12, days: 3 },
    reading: { days: 2, booksThisSeason: 1 },
    journal: { days: 0 },
  }, 'clamped and filtered');
  const legacy = toCompetitorStats({ currentStreakDays: 4, habitsCompletedCount: 9, exerciseMinutes: 0 })!;
  assert(legacy.card === undefined && legacy.currentStreakDays === 4, 'old stats shape: no card, streak kept');
  const fresh = toCompetitorStats(buildMemberStats(state({ workouts: [workout(day(1), 'Push-ups', 'reps', 100)] }), clock))!;
  eq(fresh.card?.exercise?.[0], { name: 'Push-ups', unit: 'reps', total: 100, days: 1, best: 100 }, 'round trip through the reader');
}

console.log('memberStats fixtures: all passed');
