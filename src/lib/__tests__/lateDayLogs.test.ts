// Reading and skill logs made yesterday that first reach the server today (fix 8, Zakria 2026-11-05):
// the app's mirror of 20261105160000_reading_skill_late_day_logs.sql. Only yesterday is raised,
// only up, within the daily cap; a new row is stamped inside the day; today's rule is unchanged.
import type { PointsEntry, ReadingLog, Skill, SkillSessionLog, UserBook } from '@/types';
import { computeReadingDayAward, readingAwardId, readingLateDay } from '../readingAwards';
import { computeSkillAwards, skillAwardId, skillLateDay } from '../skillAwards';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(a === b, `${msg} (got ${String(a)}, want ${String(b)})`);

const TODAY = '2026-11-05';
const YDAY = '2026-11-04';
const yStart = new Date(`${YDAY}T00:00:00`).getTime();
const tStart = new Date(`${TODAY}T00:00:00`).getTime();
const NOW = tStart + 20 * 60_000; // 00:20 today
const atY = (h: number, m = 0) => new Date(yStart + (h * 60 + m) * 60_000).toISOString();

// --- late-day day helpers ---
eq(readingLateDay({ date: YDAY }, TODAY), YDAY, 'reading: a log of yesterday raises yesterday');
eq(readingLateDay({ date: TODAY }, TODAY), null, 'reading: today earns on today');
eq(readingLateDay({ date: '2026-11-03' }, TODAY), null, 'reading: two days ago never earns');
eq(readingLateDay({ date: '2026-11-06' }, TODAY), null, 'reading: future never earns');
eq(readingLateDay(null, TODAY), null, 'reading: no log');
eq(readingLateDay({ date: '2026-02-28' }, '2026-03-01'), '2026-02-28', 'reading: across a month end');
eq(skillLateDay({ date: YDAY }, TODAY), YDAY, 'skill: a session of yesterday raises yesterday');
eq(skillLateDay({ date: TODAY }, TODAY), null, 'skill: today earns on today');
eq(skillLateDay({ date: '2026-11-03' }, TODAY), null, 'skill: two days ago never earns');

// --- reading floor ---
const book = (id: string, unit = 'pages') => ({ id, unit, status: 'reading' }) as unknown as UserBook;
const rlog = (id: string, pages: number, at: string, bookId = 'b1'): ReadingLog => ({ id, bookId, date: YDAY, pagesRead: pages, createdAt: at });
const books = [book('b1')];
const existingR = (amount: number, ts = atY(10)): PointsEntry => ({
  id: readingAwardId(YDAY), amount, reason: 'Pages logged (1)', source: 'reading', timestamp: ts, metadata: { date: YDAY, logs: 1 },
});

{
  // No row yet: the late log creates yesterday's row, stamped at the log (23:50 yesterday).
  const { entry } = computeReadingDayAward([rlog('l1', 12, atY(23, 50))], books, YDAY, yStart, NOW, null, { floor: true });
  eq(entry?.amount, 6, 'reading floor: 12 pages = 6 on yesterday');
  eq(entry?.timestamp, atY(23, 50), 'reading floor: new row stamped at the late log');
}
{
  // Existing 4 (2 logs earlier yesterday), late log adds 12 pages -> 10 (cap), time kept.
  const logs = [rlog('a', 8, atY(9)), rlog('l1', 30, atY(23, 50))];
  const { entry } = computeReadingDayAward(logs, books, YDAY, yStart, NOW, existingR(4), { floor: true });
  eq(entry?.amount, 10, 'reading floor: raised within the daily cap');
  eq(entry?.timestamp, atY(10), 'reading floor: existing row keeps its time');
}
{
  // Existing 9 but the logs now add up to 2 (e.g. a book deleted later): never lowered.
  const kept = existingR(9);
  const { entry } = computeReadingDayAward([rlog('l1', 4, atY(23, 50))], books, YDAY, yStart, NOW, kept, { floor: true });
  assert(entry === kept, 'reading floor: a lower recompute keeps the existing row as it is');
}
{
  // Nothing earns and no row: nothing appears.
  const { entry } = computeReadingDayAward([rlog('l1', 1, atY(23, 50))], books, YDAY, yStart, NOW, null, { floor: true });
  eq(entry, null, 'reading floor: 1 page earns nothing');
}
{
  // A created time after the day (clock trouble) is stamped inside the day, never on today.
  const late = new Date(tStart + 5 * 60_000).toISOString();
  const { entry } = computeReadingDayAward([rlog('l1', 12, late)], books, YDAY, yStart, NOW, null, { floor: true });
  eq(entry?.timestamp, new Date(tStart - 1).toISOString(), 'reading: a new row never lands after the day');
}
{
  // Without floor the rule is as before (a recompute can lower or remove).
  const { entry } = computeReadingDayAward([rlog('l1', 4, atY(23, 50))], books, YDAY, yStart, NOW, existingR(9));
  eq(entry?.amount, 2, 'reading today-rule: recompute replaces the amount');
}

// --- skill floor ---
const skills = [{ id: 's1', name: 'S', createdAt: atY(1) } as Skill];
const slog = (id: string, mins: number, at: string): SkillSessionLog => ({ id, skillId: 's1', date: YDAY, durationMinutes: mins, note: '', pointsAwarded: 0, createdAt: at });
const existingS = (amount: number): PointsEntry => ({
  id: skillAwardId(YDAY), amount, reason: 'Skill practice (1)', source: 'skill', timestamp: atY(9), metadata: { date: YDAY, sessions: 1 },
});
{
  const { entry } = computeSkillAwards([slog('k1', 60, atY(23, 50))], skills, YDAY, yStart, NOW, null, { floor: true });
  eq(entry?.amount, 5, 'skill floor: 60 min = 5 on yesterday');
  eq(entry?.timestamp, atY(23, 50), 'skill floor: stamped at the late session');
}
{
  const logs = [slog('a', 36, atY(9)), slog('k1', 120, atY(23, 50))];
  const { entry } = computeSkillAwards(logs, skills, YDAY, yStart, NOW, existingS(3), { floor: true });
  eq(entry?.amount, 10, 'skill floor: raised to the cap 10');
  eq(entry?.timestamp, atY(9), 'skill floor: existing row keeps its time');
}
{
  const kept = existingS(10);
  const { entry } = computeSkillAwards([slog('k1', 24, atY(23, 50))], skills, YDAY, yStart, NOW, kept, { floor: true });
  assert(entry === kept, 'skill floor: never lowered');
}
{
  const { entry } = computeSkillAwards([slog('k1', 24, atY(23, 50))], skills, YDAY, yStart, NOW, existingS(10));
  eq(entry?.amount, 2, 'skill today-rule: recompute replaces the amount');
}

console.log('lateDayLogs: all assertions passed');
