// Chapters in tenths (Zakria 2026-11-12, idea I3): a chapter book is logged in steps of 0.1
// (1.1 … 1.9, then 2); 0.1 chapter = 2 pages = 1 pt; 10 pts a day. Every amount is snapped to
// tenths and point math runs in whole pages, so float noise (1.3 - 1.1 = 0.19999999999999996)
// never loses a point. Points mirror ascend_recompute_reading_awards
// (20261112200000_reading_chapter_tenths.sql: round(chapters * 10) * 2 pages).
import { DEFAULT_STATE, type AppState, type ReadingLog, type UserBook, type WeeklyGoalItem } from '@/types';
import {
  chapterTenths,
  computeReadingDayAward,
  logPageAmount,
  readingAmountPages,
  snapReadingAmount,
  PAGES_PER_CHAPTER_TENTH,
} from '../points/readingAwards';
import { switchBookUnit, takeBackTodaysReading, unitSwitchDefaults } from '../reading/bookUnits';
import { readingProgressPreview } from '../points/practicePreviews';
import { computeLinkedGoalProgress } from '../items/linkedGoalMetrics';
import { bookProgress, formatAmount } from '../../components/reading/bookMeta';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const DAY = '2026-11-12';
const START = new Date(`${DAY}T00:00:00`).getTime();
const NOW = START + 20 * 3600_000;
const at = (h: number) => new Date(START + h * 3600_000).toISOString();
const book = (o: Partial<UserBook> = {}): UserBook =>
  ({ id: 'b', title: 'T', author: 'A', status: 'reading', pointsAwarded: 0, addedAt: at(0), unit: 'chapters', totalAmount: 12, totalPages: 12, ...o }) as UserBook;
const log = (id: string, pagesRead: number, hour: number, o: Partial<ReadingLog> = {}): ReadingLog =>
  ({ id, bookId: 'b', date: DAY, pagesRead, unit: 'chapters', createdAt: at(hour), pointsAwarded: 0, ...o }) as ReadingLog;
const points = (logs: ReadingLog[], books: UserBook[] = [book()]) => computeReadingDayAward(logs, books, DAY, START, NOW).entry?.amount ?? 0;

assert(PAGES_PER_CHAPTER_TENTH === 2, 'config: 0.1 chapter = 2 pages');

// 1. Snapping: float noise never moves a tenth; the server's numeric rounding is matched.
{
  eq(1.3 - 1.1, 0.19999999999999996, 'the float bug this guards (JS)');
  eq(chapterTenths(1.3 - 1.1), 2, '1.3 - 1.1 = 2 tenths');
  eq(chapterTenths(2.3 - 2.0), 3, '2.3 - 2.0 = 3 tenths');
  eq(chapterTenths(0.1 + 0.2), 3, '0.1 + 0.2 = 3 tenths');
  eq(chapterTenths(0.7 + 0.1), 8, '0.7 + 0.1 = 0.7999999999999999 = 8 tenths');
  eq(chapterTenths(1.25), 13, 'a half tenth rounds up, like numeric round(12.5)');
  eq(chapterTenths(0.04), 0, '0.04 chapter is 0 tenths');
  eq(chapterTenths(3), 30, 'whole chapters');
  eq(readingAmountPages(1.3 - 1.1, 'chapters'), 4, '0.2 chapter = 4 pages, whole');
  eq(readingAmountPages(7, 'pages'), 7, 'pages unchanged');
  eq(snapReadingAmount(0.7 + 0.1, 'chapters'), 0.8, 'snap to the tenth (0.7999999999999999)');
  eq(logPageAmount(log('x', 1, 1), book()), 20, 'a whole chapter still counts 20 pages');
}

// 2. Points: 1.3 - 1.1 earns 2 (not 1); 0.1 = 1 pt; the cap stays 10 a day.
{
  eq(points([log('a', 1.3 - 1.1, 1)]), 2, '1.1 -> 1.3 (raw float delta) earns 2 pts');
  eq(points([log('a', 0.1, 1)]), 1, '0.1 chapter = 1 pt');
  eq(points(Array.from({ length: 10 }, (_, i) => log(`t${i}`, 0.1, 1 + i / 10))), 10, '10 x 0.1 chapter = 10 pts (cap reached exactly)');
  eq(points(Array.from({ length: 25 }, (_, i) => log(`t${i}`, 0.1, 1 + i / 100))), 10, '25 x 0.1 chapter = cap 10');
  eq(points([log('a', 0.5, 1), log('p', 3, 2, { unit: 'pages' })]), 6, '0.5 chapter (10 pages) + 3 pages = 13 pages = 6 pts');
  eq(points([log('a', 1, 1)]), 10, 'legacy whole chapter = 10 pts');
}

// 3. Unit switch keeps tenths: pages -> chapters floors to tenths (31 pages -> 1.5), chapters -> pages exact.
{
  const pagesBook = book({ unit: 'pages', currentAmount: 31, currentPage: 31, totalAmount: 300, totalPages: 300 });
  eq(unitSwitchDefaults(pagesBook, 'chapters'), { current: 1.5, total: 15 }, '31 pages -> 1.5 chapters of 15');
  eq(unitSwitchDefaults(book({ unit: 'pages', currentAmount: 10, totalAmount: 30, totalPages: 30 }), 'chapters'), { current: 0.5, total: 2 }, '10 pages -> 0.5 chapters');
  eq(unitSwitchDefaults(book({ unit: 'pages', currentAmount: 29, totalAmount: 29, totalPages: 29 }), 'chapters'), { current: 1.4, total: 2 }, 'the length is whole and at least the place');
  const chapterBook = book({ currentAmount: 1.5, currentPage: 1.5 });
  eq(unitSwitchDefaults(chapterBook, 'pages').current, 30, '1.5 chapters -> 30 pages');
  eq(unitSwitchDefaults(book({ currentAmount: 1.1, currentPage: 1.1 }), 'pages').current, 22, '1.1 chapters -> 22 pages exactly (not 22.000000000000004)');
  const sw = switchBookUnit(pagesBook, { unit: 'chapters', current: 1.5, total: 15 }, at(3), DAY);
  eq([sw.unit, sw.currentAmount, sw.totalAmount], ['chapters', 1.5, 15], 'switchBookUnit keeps 1.5');
  eq(sw.unitSwitches, [{ date: DAY, at: at(3), pagesBefore: 31, pagesAfter: 30 }], 'the switch records 31 -> 30 pages');
  const swNoise = switchBookUnit(pagesBook, { unit: 'chapters', current: 0.7 + 0.1, total: 15 }, at(3), DAY);
  eq(swNoise.currentAmount, 0.8, 'a noisy place is snapped');
  const back = switchBookUnit(sw, { unit: 'pages', current: 31, total: 300 }, at(4), DAY);
  eq(unitSwitchDefaults(sw, 'pages').current, 31, 'switching straight back restores 31 pages');
  eq(back.currentAmount, 31, 'and keeps them');
}

// 4. Lowering takes back today's reading in tenths: no float residue; an odd page comes back as a pages log.
{
  const b = book({ currentAmount: 1.5, currentPage: 1.5 });
  const logs = [log('old', 1, 1), log('new', 0.5, 2)];
  const r = takeBackTodaysReading(logs, b, DAY, 1.5 - 1.2, at(5), () => 'refund');
  eq(r.logs.map((l) => [l.id, l.pagesRead, l.unit]), [['old', 1, 'chapters'], ['new', 0.2, 'chapters']], '1.5 -> 1.2 leaves 0.2 on the newest log');
  eq(points(r.logs, [b]), 10, 'cap still reached by the whole chapter');
  const mixed = [log('ch', 0.5, 1), log('pg', 3, 2, { unit: 'pages' })];
  const m = takeBackTodaysReading(mixed, b, DAY, 0.3, at(5), () => 'refund');
  eq(
    m.logs.map((l) => [l.id, l.pagesRead, l.unit]),
    [['refund', 1, 'pages'], ['ch', 0.3, 'chapters']],
    '0.3 chapter (6 pages) back: the 3-page log goes, the chapter log loses 0.2 and 1 page comes back'
  );
  eq(points(m.logs, [b]), 3, 'the day keeps 13 - 6 = 7 pages = 3 pts');
  const all = takeBackTodaysReading([log('a', 0.1, 1), log('c', 0.2, 2)], b, DAY, 0.3 - 0.1 + 0.1, at(5), () => 'refund');
  eq(all.removedIds, ['c', 'a'], 'taking back exactly what was read removes every log (noisy 0.30000000000000004)');
}

// 5. The Log progress preview: 1.1 -> 1.3 earns 2 pts.
{
  const b = book({ currentAmount: 1.1, currentPage: 1.1 });
  eq(readingProgressPreview([], [b], 'b', 1.3, DAY, at(6)), { before: 0, after: 2 }, 'preview +2 for 1.1 -> 1.3');
  eq(readingProgressPreview([log('a', 0.5, 1)], [b], 'b', 1, DAY, at(6)), { before: 5, after: 4 }, 'preview lowering 1.1 -> 1.0 takes 0.1 back');
}

// 6. Weekly chapters goal counts 0.1 steps; pages logs add 0.1 per 2 pages; sums carry no noise.
{
  const goal = (o: Partial<WeeklyGoalItem>): WeeklyGoalItem =>
    ({ id: 'g', title: 'g', linkedModule: 'reading', linkedMetricKey: 'chapters_read', targetValue: 1, ...o }) as WeeklyGoalItem;
  const state = (logs: ReadingLog[], b: UserBook = book()): AppState => ({ ...DEFAULT_STATE, libraryBooks: [b], readingLogs: logs });
  const tens = Array.from({ length: 10 }, (_, i) => log(`t${i}`, 0.1, 1 + i / 10));
  const p = computeLinkedGoalProgress(goal({}), state(tens), [DAY]);
  eq([p.current, p.percent], [1, 100], 'any book: 10 x 0.1 chapter reaches 1 exactly');
  const one = computeLinkedGoalProgress(goal({ linkedItemId: 'b' }), state([log('a', 1.3 - 1.1, 1), log('p', 5, 2, { unit: 'pages' })]), [DAY]);
  eq(one.current, 0.4, 'one book: 0.2 chapter + 5 pages (0.2, an odd page left) = 0.4');
  const pagesGoal = computeLinkedGoalProgress(goal({ linkedItemId: 'b', linkedMetricKey: 'pages_read', targetValue: 10 }), state([log('a', 1.3 - 1.1, 1)]), [DAY]);
  eq(pagesGoal.current, 4, 'one book, pages goal: 0.2 chapter = 4 pages');
}

// 7. Display: tenths, never float noise; the length stays whole.
{
  eq(formatAmount(1.5, 'chapters'), '1.5 chapters', '1.5 chapters');
  eq(formatAmount(1, 'chapters'), '1 chapter', '1 chapter');
  eq(formatAmount(0.1 + 0.2, 'chapters'), '0.3 chapters', 'no float noise (0.30000000000000004)');
  const p = bookProgress(book({ currentAmount: 0.7 + 0.1, currentPage: 0.8 }));
  eq([p.current, p.left, p.total], [0.8, 11.2, 12], 'progress and what is left in tenths');
}

console.log('readingChapterTenths: all passed');
