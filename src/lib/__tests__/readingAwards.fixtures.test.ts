// Fixtures for the app's copy of the server's reading points rules
// (ascend_recompute_reading_awards + ascend_recompute_reading_bonus): 2 pages = 1 pt,
// 1 chapter = 10 pts, 10 pts a day shared by all books, Finish pages earn nothing,
// finish bonus gates (5 reading days over 7+ days) and the 13-day cooldown.
import type { PointsEntry, ReadingLog, UserBook } from '@/types';
import { READING_POINTS } from '../pointsConfig';
import {
  computeReadingDayAward,
  readingBonusCooldown,
  readingBonusProgress,
  readingBonusId,
  READING_BONUS_COOLDOWN_DAYS,
} from '../readingAwards';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const DAY = '2026-10-15';
const START = new Date(`${DAY}T00:00:00`).getTime();
const NOW = START + 20 * 3600_000;
const at = (h: number) => new Date(START + h * 3600_000).toISOString();

const book = (id: string, unit = 'pages') => ({ id, unit, status: 'reading' }) as unknown as UserBook;
const log = (id: string, bookId: string, pagesRead: number, hour: number, extra: Partial<ReadingLog> = {}): ReadingLog => ({
  id,
  bookId,
  date: DAY,
  pagesRead,
  createdAt: at(hour),
  ...extra,
});
const award = (logs: ReadingLog[], books: UserBook[]) => computeReadingDayAward(logs, books, DAY, START, NOW);

// The rules this file checks are the ones Zakria set; fail loudly if the config moves.
assert(READING_POINTS.pagesPerPoint === 2, 'config: 2 pages per point');
assert(READING_POINTS.pointsPerChapter === 10, 'config: 10 points per chapter');
assert(READING_POINTS.dailyCap === 10, 'config: daily cap 10');
assert(READING_BONUS_COOLDOWN_DAYS === 13, 'config: bonus cooldown 13 days');

// 1. Pages: floor(pages / 2), odd pages carry over inside the day.
{
  const r = award([log('a', 'b1', 3, 1), log('b', 'b1', 3, 2)], [book('b1')]);
  assert(r.entry?.amount === 3, '6 pages = 3 pts');
  assert(r.logPoints.get('a') === 1 && r.logPoints.get('b') === 2, 'odd page carries to the next log');
  assert(r.entry?.timestamp === at(1), 'row stamped at the first earning log');
}

// 2. Daily cap shared across books, in log order.
{
  const r = award([log('a', 'b1', 16, 1), log('b', 'b2', 10, 2)], [book('b1'), book('b2')]);
  assert(r.entry?.amount === 10, 'cap 10 across books');
  assert(r.logPoints.get('a') === 8 && r.logPoints.get('b') === 2, 'second book gets only what the cap leaves');
}

// 3. Chapters: 1 chapter = 10 pts, still capped at 10.
{
  assert(award([log('a', 'c1', 1, 1)], [book('c1', 'Chapters')]).entry?.amount === 10, '1 chapter = 10 pts (unit case-insensitive)');
  assert(award([log('a', 'c1', 3, 1)], [book('c1', 'chapters')]).entry?.amount === 10, '3 chapters still capped at 10');
}

// 4. What never counts: Finish pages, removed books, other days, non-numeric pages.
{
  assert(award([log('a', 'b1', 40, 1, { finish: true })], [book('b1')]).entry === null, 'Finish pages earn 0');
  assert(award([log('a', 'gone', 40, 1)], [book('b1')]).entry === null, 'book no longer in library earns 0');
  assert(award([log('a', 'b1', 40, 1, { date: '2026-10-14' })], [book('b1')]).entry === null, 'other day ignored');
  assert(award([log('a', 'b1', Number.NaN, 1)], [book('b1')]).entry === null, 'NaN pages earn 0');
  assert(award([log('a', 'b1', 1, 1)], [book('b1')]).entry === null, '1 page = 0 pts, no row');
}

// 5. An existing server row keeps its time; only the amount changes.
{
  const existing = { id: `reading_award_${DAY}`, amount: 2, reason: 'x', source: 'reading', timestamp: at(0.5) } as PointsEntry;
  const r = computeReadingDayAward([log('a', 'b1', 10, 3)], [book('b1')], DAY, START, NOW, existing);
  assert(r.entry?.amount === 5 && r.entry.timestamp === at(0.5), 'existing row keeps its timestamp');
}

// 6. Finish bonus gates: 5 distinct reading days and 7+ days since the first.
{
  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
  const logs = days.map((d, i) => ({ ...log(`g${i}`, 'b1', 4, 1), date: d }));
  const four = readingBonusProgress('b1', logs, '2026-10-15');
  assert(four.loggedDays === 4 && !four.meetsDays && four.meetsSpan, '4 days: span ok, days not');
  const withFinish = readingBonusProgress('b1', logs, '2026-10-15', true);
  assert(withFinish.loggedDays === 5 && withFinish.meetsDays, 'Finish today counts as the 5th day');
  const short = readingBonusProgress('b1', logs, '2026-10-07', true);
  assert(short.spanDays === 6 && !short.meetsSpan, '6 days span is not enough');
  const zero = readingBonusProgress('b1', [{ ...log('z', 'b1', 0, 1), date: '2026-09-01' }], '2026-10-15');
  assert(zero.loggedDays === 0, 'a 0-page log is not a reading day');
}

// 7. Cooldown: another book's bonus blocks new ones until 13 local days later.
{
  const bonus = (bookId: string, day: string, amount = 15): PointsEntry => ({
    id: readingBonusId(bookId),
    amount,
    reason: 'bonus',
    source: 'reading_bonus',
    timestamp: new Date(`${day}T12:00:00`).toISOString(),
  });
  const history = [bonus('old', '2026-10-01')];
  const day12 = readingBonusCooldown('new', history, '2026-10-13');
  assert(day12.active && day12.lastDay === '2026-10-01' && day12.nextDay === '2026-10-14', 'day 12: cooldown active');
  assert(!readingBonusCooldown('new', history, '2026-10-14').active, 'day 13: cooldown over');
  assert(!readingBonusCooldown('old', history, '2026-10-05').active, "a book's own bonus is not a cooldown");
  assert(!readingBonusCooldown('new', [bonus('old', '2026-10-10', 0)], '2026-10-12').active, 'a revoked (0) bonus does not count');
  assert(
    readingBonusCooldown('new', [...history, bonus('mid', '2026-10-08')], '2026-10-20').nextDay === '2026-10-21',
    'latest bonus decides',
  );
}

console.log('readingAwards fixtures: all passed');
