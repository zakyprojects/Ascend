// Switching a book between pages and chapters mid-book (Zakria 2026-11-09): the form's defaults,
// the book-only write, today's points rule (net progress in pages, a switch never earns or takes
// points, re-reading after a switch earns nothing), lowering progress across units, and weekly goals.
// Points rules mirror ascend_recompute_reading_awards (20261109190000_reading_book_unit_switch.sql).
import { DEFAULT_STATE, type AppState, type ReadingLog, type UserBook, type WeeklyGoalItem } from '@/types';
import { stampLogUnits, switchBookUnit, takeBackTodaysReading, unitSwitchDefaults } from '../bookUnits';
import { computeReadingDayAward, logUnit, PAGES_PER_CHAPTER } from '../readingAwards';
import { computeLinkedGoalProgress, linkedGoalUnit } from '../linkedGoalMetrics';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const DAY = '2026-11-09';
const START = new Date(`${DAY}T00:00:00`).getTime();
const NOW = START + 20 * 3600_000;
const at = (h: number) => new Date(START + h * 3600_000).toISOString();

const book = (o: Partial<UserBook>): UserBook =>
  ({ id: 'b', title: 'T', author: 'A', status: 'reading', pointsAwarded: 0, addedAt: at(0), unit: 'pages', ...o }) as UserBook;
const log = (id: string, pagesRead: number, hour: number, o: Partial<ReadingLog> = {}): ReadingLog =>
  ({ id, bookId: 'b', date: DAY, pagesRead, createdAt: at(hour), ...o }) as ReadingLog;
const points = (logs: ReadingLog[], books: UserBook[]) => computeReadingDayAward(logs, books, DAY, START, NOW).entry?.amount ?? 0;
const switched = (b: UserBook, unit: 'pages' | 'chapters', current: number, total: number, hour: number) =>
  switchBookUnit(b, { unit, current, total }, at(hour), DAY);

assert(PAGES_PER_CHAPTER === 20, 'config: 1 chapter = 20 pages');

// 1. Defaults: chapters -> pages (×20; total from the saved page count, the catalogue, else ×20).
{
  const ch = book({ unit: 'chapters', currentAmount: 4, totalAmount: 10 });
  const d = unitSwitchDefaults(ch, 'pages');
  assert(d.current === 80 && d.total === 200, `4/10 chapters -> 80/200 pages (${JSON.stringify(d)})`);
  const curated = unitSwitchDefaults({ ...ch, curatedBookId: 'curated-power-of-now' }, 'pages');
  assert(curated.total === 236, 'catalogue page count (Power of Now = 236)');
  const saved = unitSwitchDefaults({ ...ch, curatedBookId: 'curated-power-of-now', lengthByUnit: { pages: 250 } }, 'pages');
  assert(saved.total === 250, 'saved page count wins over the catalogue');
  const short = unitSwitchDefaults({ ...ch, currentAmount: 9, lengthByUnit: { pages: 150 } }, 'pages');
  assert(short.current === 180 && short.total === 180, 'length never below the place');
}

// 2. Defaults: pages -> chapters (place rounds down, total rounds up, at least 1).
{
  const d = unitSwitchDefaults(book({ currentAmount: 150, totalAmount: 300 }), 'chapters');
  assert(d.current === 7 && d.total === 15, `150/300 pages -> 7/15 chapters (${JSON.stringify(d)})`);
  assert(unitSwitchDefaults(book({ currentAmount: 5, totalAmount: 10 }), 'chapters').total === 1, 'at least 1 chapter');
  assert(unitSwitchDefaults(book({ currentAmount: 150, totalAmount: 300, lengthByUnit: { chapters: 12 } }), 'chapters').total === 12, 'saved chapter count');
}

// 3. switchBookUnit writes the book only; a lowering switch is kept for the points rule.
{
  const b = book({ currentAmount: 150, totalAmount: 300, updatedAt: at(1) });
  const s = switched(b, 'chapters', 7, 15, 2);
  assert(s.unit === 'chapters' && s.currentAmount === 7 && s.currentPage === 7 && s.totalAmount === 15 && s.totalPages === 15, 'unit, place, length');
  assert(s.lengthByUnit?.pages === 300 && s.lengthByUnit?.chapters === 15, 'both lengths remembered');
  assert(s.unitSwitches?.length === 1 && s.unitSwitches[0].pagesBefore === 150 && s.unitSwitches[0].pagesAfter === 140, 'lowered place kept (150 -> 140 pages)');
  assert(s.updatedAt === at(2), 'updatedAt moves');
  const back = switched(s, 'pages', 140, 300, 3);
  assert(back.currentAmount === 140 && back.unitSwitches?.length === 1, 'a switch that keeps the place adds nothing');
  const up = switched(book({ currentAmount: 4, totalAmount: 10, unit: 'chapters' }), 'pages', 90, 200, 2);
  assert(up.unitSwitches?.length === 1 && up.unitSwitches[0].pagesBefore === 80 && up.unitSwitches[0].pagesAfter === 90, 'a raising switch is kept too');
  const old = switched(book({ currentAmount: 40, totalAmount: 300, unitSwitches: [{ date: '2026-11-01', at: at(0), pagesBefore: 9, pagesAfter: 0 }] }), 'chapters', 2, 15, 2);
  assert(!old.unitSwitches, 'entries older than yesterday are dropped');
  const done = book({ status: 'completed', currentAmount: 300, totalAmount: 300 });
  assert(switched(done, 'chapters', 15, 15, 2) === done, 'a finished book never switches');
  const clamped = switched(book({ currentAmount: 40, totalAmount: 300 }), 'chapters', 99, 15, 2);
  assert(clamped.currentAmount === 15, 'place clamped to the length');
}

// 4. Zakria's example: 10 pages today = 5; switch to chapters; +1 chapter -> 10 (cap), only +5.
{
  const b0 = book({ currentAmount: 0, totalAmount: 200 });
  const logs = [log('p1', 10, 1, { unit: 'pages' })];
  assert(points(logs, [b0]) === 5, '10 pages = 5 pts');
  const b1 = switched({ ...b0, currentAmount: 10 }, 'chapters', 0, 10, 2);
  assert(points(logs, [b1]) === 5, 'switch keeps 5 pts');
  const after = [...logs, log('c1', 1, 3, { unit: 'chapters' })];
  assert(points(after, [b1]) === 10, '+1 chapter -> 10 (cap)');
  assert(computeReadingDayAward(after, [b1], DAY, START, NOW).logPoints.get('c1') === 5, 'the chapter log shows +5');
}

// 5. No double count: at 100 pages, +10 today (5); switch to chapters set to 4 (110 -> 80 pages);
//    +1 chapter brings it back to 100 pages: nothing; +1 more chapter passes the old place: 10.
{
  const b0 = book({ currentAmount: 110, totalAmount: 300 });
  const b1 = switched(b0, 'chapters', 4, 15, 2);
  const logs = [log('p1', 10, 1, { unit: 'pages' })];
  assert(points(logs, [b1]) === 5, 'lowered switch keeps 5');
  assert(points([...logs, log('c1', 1, 3, { unit: 'chapters' })], [b1]) === 5, 're-reading the lowered pages earns nothing');
  assert(points([...logs, log('c1', 1, 3, { unit: 'chapters' }), log('c2', 1, 4, { unit: 'chapters' })], [b1]) === 10, 'past the old place earns again');
  // Log, switch back and forth (rounding drops 6 pages), re-log the same 6 pages: no extra point.
  const r0 = book({ currentAmount: 46, totalAmount: 300 });
  const r1 = switched(r0, 'chapters', 2, 15, 2);
  const r2 = switched(r1, 'pages', 40, 300, 3);
  const rl = [log('p1', 6, 1, { unit: 'pages' })];
  assert(points([...rl, log('p2', 6, 4, { unit: 'pages' })], [r2]) === 3, 'round trip + re-log = still 3');
  // Other books are untouched by a book's switch; the cap is shared as before.
  const other = { ...book({ id: 'o', currentAmount: 0, totalAmount: 100 }) };
  assert(points([...logs, log('o1', 4, 3, { bookId: 'o', unit: 'pages' })], [b1, other]) === 7, 'other book still earns');
}

// 6. A log keeps its own unit; old logs (no unit) read in the book's unit.
{
  const ch = book({ unit: 'chapters' });
  assert(logUnit({ unit: 'pages' }, ch) === 'pages' && logUnit({}, ch) === 'chapters' && logUnit({ unit: 'mins' as never }, ch) === 'chapters', 'logUnit');
  assert(points([log('p', 6, 1, { unit: 'pages' })], [ch]) === 3, '6 pages on a chapter book = 3');
  const stamped = stampLogUnits([log('a', 2, 1), log('x', 2, 1, { bookId: 'other' }), log('c', 1, 1, { unit: 'pages' })], ch);
  assert(stamped[0].unit === 'chapters' && stamped[1].unit === undefined && stamped[2].unit === 'pages', 'stampLogUnits fills only this book\'s unit-less logs');
}

// 7. Lowering progress takes back today's reading of the book only, in pages, across units.
{
  const id = (() => { let n = 0; return () => `r${++n}`; })();
  const b = book({ unit: 'pages', currentAmount: 130 });
  const logs = [
    log('y', 20, -20, { date: '2026-11-08', unit: 'pages' }),
    log('c', 1, 1, { unit: 'chapters' }),
    log('p', 6, 3, { unit: 'pages' }),
  ];
  const a = takeBackTodaysReading(logs, b, DAY, 4, at(5), id);
  assert(a.logs.find((l) => l.id === 'p')?.pagesRead === 2 && a.removedIds.length === 0, 'shrinks the newest log first');
  const c = takeBackTodaysReading(logs, b, DAY, 16, at(5), id);
  const refund = c.logs.find((l) => l.id === 'r1');
  assert(c.removedIds.join() === 'p,c' && refund?.unit === 'pages' && refund.pagesRead === 10 && refund.createdAt === at(1), 'a chapter log partly taken back: the rest comes back as pages');
  assert(c.logs.some((l) => l.id === 'y'), 'earlier days never change');
  assert(points(c.logs, [b]) === 5, 'today keeps exactly the 10 pages still read');
  const all = takeBackTodaysReading(logs, b, DAY, 999, at(5), id);
  assert(all.removedIds.length === 2 && points(all.logs, [b]) === 0, 'lowering below today takes today to 0');
  const chb = book({ unit: 'chapters', currentAmount: 6 });
  const d = takeBackTodaysReading([log('p', 30, 1, { unit: 'pages' })], chb, DAY, 1, at(5), id);
  assert(d.logs.find((l) => l.id === 'p')?.pagesRead === 10, '1 chapter less = 20 pages less');
}

// 8. Weekly goals keep their unit after a switch; a book goal converts the other unit's logs.
{
  const week = [DAY];
  const b = book({ unit: 'chapters', currentAmount: 5 });
  const state = (logs: ReadingLog[]) => ({ ...DEFAULT_STATE, libraryBooks: [b], readingLogs: logs }) as AppState;
  const goal = (key: string, linkedItemId = 'b') =>
    ({ id: 'g', title: 'g', linkedModule: 'reading', linkedItemId, linkedMetricKey: key, targetValue: 100 }) as unknown as WeeklyGoalItem;
  const logs = [log('p', 60, 1, { unit: 'pages' }), log('c', 2, 3, { unit: 'chapters' })];
  const pagesGoal = computeLinkedGoalProgress(goal('pages_read'), state(logs), week);
  assert(pagesGoal.current === 100 && pagesGoal.unit === 'pages', `pages goal: 60 + 2×20 = 100 pages (${pagesGoal.current} ${pagesGoal.unit})`);
  assert(linkedGoalUnit(goal('pages_read'), state(logs)) === 'pages', 'label from the goal, not the book');
  const chapterGoal = computeLinkedGoalProgress(goal('chapters_read'), state([log('p1', 15, 1, { unit: 'pages' }), log('p2', 10, 2, { unit: 'pages' }), log('c', 2, 3, { unit: 'chapters' })]), week);
  assert(chapterGoal.current === 3, `chapters goal: 25 pages = 1 whole chapter + 2 chapters (${chapterGoal.current})`);
  const anyPages = computeLinkedGoalProgress(goal('pages_read', ''), state(logs), week);
  assert(anyPages.current === 60, 'any-book pages goal counts only logs written in pages');
}

// 9. Bug round 1 (Zakria 2026-11-09): switch back right away. 10 pages -> 0 chapters -> back to pages
//    starts at 10 pages again (not 0), new reading after that earns, and a raising switch earns nothing.
{
  const b0 = book({ currentAmount: 10, totalAmount: 256, curatedBookId: 'curated-psychology-of-money' });
  const logs = [log('p1', 10, 1, { unit: 'pages' })];
  const d1 = unitSwitchDefaults(b0, 'chapters');
  assert(d1.current === 0 && d1.total === 13, `10/256 pages -> 0/13 chapters (${JSON.stringify(d1)})`);
  const b1 = switched(b0, 'chapters', d1.current, d1.total, 2);
  const d2 = unitSwitchDefaults(b1, 'pages');
  assert(d2.current === 10 && d2.total === 256, `back to pages restores 10/256 (${JSON.stringify(d2)})`);
  const b2 = switched(b1, 'pages', d2.current, d2.total, 3);
  assert(b2.currentAmount === 10 && b2.totalAmount === 256 && b2.unitSwitches?.length === 2, 'round trip: 10/256 pages, both switches kept');
  assert(points(logs, [b2]) === 5, 'round trip keeps 5');
  assert(points([...logs, log('p2', 6, 4, { unit: 'pages' })], [b2]) === 8, 'new pages after switching back earn (10 + 6 = 8)');
  // Again to chapters and back: still exact.
  const b3 = switched(b2, 'chapters', unitSwitchDefaults(b2, 'chapters').current, 13, 5);
  assert(unitSwitchDefaults(b3, 'pages').current === 10, 'second round trip restores 10 again');
  // The place moved after the switch (a chapter logged): plain conversion, no restore.
  assert(unitSwitchDefaults({ ...b1, currentAmount: 1 }, 'pages').current === 20, 'moved since the switch -> chapters × 20');
  // A raise beyond what earlier switches took earns nothing.
  const big = switched(b1, 'pages', 200, 256, 3);
  assert(points([...logs, log('p2', 6, 4, { unit: 'pages' })], [big]) === 8, 'raising by a switch earns nothing extra');
  const upOnly = switched(book({ currentAmount: 10, totalAmount: 256 }), 'chapters', 5, 13, 2);
  assert(points([...logs, log('c1', 1, 3, { unit: 'chapters' })], [upOnly]) === 10, 'a raise with nothing owed adds nothing; real reading still earns');
}

console.log('All book unit switch tests passed.');
