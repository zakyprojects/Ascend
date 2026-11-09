import type { ReadingLog, UserBook } from '@/types';
import { findCuratedBook } from './books';
import { addDays } from './dates';
import { PAGES_PER_CHAPTER, isChapterBook, logPageAmount, logUnit } from './readingAwards';

export type BookUnitName = 'pages' | 'chapters';

const unitOf = (book: Pick<UserBook, 'unit'>): BookUnitName => (isChapterBook(book) ? 'chapters' : 'pages');
const toPages = (amount: number, unit: BookUnitName): number => amount * (unit === 'chapters' ? PAGES_PER_CHAPTER : 1);
const positive = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.round(n) : undefined);

/** The ids a book's logs may carry (its own, or the catalogue/linked id it came from). */
export const bookLogIds = (book: Pick<UserBook, 'id' | 'linkedBookId' | 'curatedBookId'>): Set<string> =>
  new Set([book.id, book.linkedBookId, book.curatedBookId].filter((id): id is string => Boolean(id)));

/**
 * What a unit switch starts the form at (both editable):
 * - to pages: place = chapters × 20; length = the page count saved before, else the catalogue's,
 *   else chapters × 20.
 * - to chapters: place = whole chapters read (pages / 20 rounded down, never a chapter not finished);
 *   length = the chapter count saved before, else pages / 20 rounded up (at least 1).
 * - switching back while the place is still where the last switch put it: the place before that
 *   switch (so 10 pages -> 0 chapters -> back gives 10 pages, not 0).
 * The length is never below the place.
 */
export function unitSwitchDefaults(book: UserBook, next: BookUnitName): { current: number; total: number } {
  const from = unitOf(book);
  const current = Math.max(0, book.currentAmount ?? book.currentPage ?? 0);
  const total = Math.max(1, book.totalAmount ?? book.totalPages ?? 1);
  if (next === from) return { current, total };
  const last = Array.isArray(book.unitSwitches) ? book.unitSwitches[book.unitSwitches.length - 1] : undefined;
  const back =
    last && typeof last.pagesBefore === 'number' && last.pagesAfter === toPages(current, from) ? Math.max(0, last.pagesBefore) : null;
  if (next === 'pages') {
    const curated = findCuratedBook(book.curatedBookId || book.linkedBookId || '');
    const pages = positive(book.lengthByUnit?.pages) ?? positive(curated?.totalPages) ?? total * PAGES_PER_CHAPTER;
    const place = back ?? current * PAGES_PER_CHAPTER;
    return { current: place, total: Math.max(pages, place) };
  }
  const place = Math.floor((back ?? current) / PAGES_PER_CHAPTER);
  const chapters = positive(book.lengthByUnit?.chapters) ?? Math.max(1, Math.ceil(total / PAGES_PER_CHAPTER));
  return { current: place, total: Math.max(chapters, place) };
}

/** The book's saved length per unit with `total` saved for `unit`. */
export const rememberLength = (book: UserBook, unit: BookUnitName, total: number): NonNullable<UserBook['lengthByUnit']> => ({
  ...book.lengthByUnit,
  [unit]: total,
});

/**
 * Switches a book to the other unit at the place and length the user confirmed. Writes the book
 * only, never a log, so it earns and takes no points. A switch that moves the place (in pages) is
 * kept for today (unitSwitches): after a lowering one, reading those pages again today earns
 * nothing; a raising one gives back what an earlier one took (computeReadingDayAward). Entries
 * older than yesterday are dropped. A finished book never switches.
 */
export function switchBookUnit(
  book: UserBook,
  change: { unit: BookUnitName; current: number; total: number },
  nowIso: string,
  today: string
): UserBook {
  const from = unitOf(book);
  if (change.unit === from || book.status === 'completed') return book;
  const total = Math.max(1, Math.round(change.total));
  const current = Math.min(total, Math.max(0, Math.round(change.current)));
  const pagesBefore = toPages(Math.max(0, book.currentAmount ?? book.currentPage ?? 0), from);
  const pagesAfter = toPages(current, change.unit);
  const yesterday = addDays(today, -1);
  const kept = (Array.isArray(book.unitSwitches) ? book.unitSwitches : []).filter((s) => s && s.date >= yesterday);
  const unitSwitches = pagesAfter !== pagesBefore ? [...kept, { date: today, at: nowIso, pagesBefore, pagesAfter }] : kept;
  const lengthByUnit = { ...rememberLength(book, from, Math.max(1, book.totalAmount ?? book.totalPages ?? 1)), [change.unit]: total };
  const next: UserBook = {
    ...book,
    unit: change.unit,
    currentAmount: current,
    currentPage: current,
    totalAmount: total,
    totalPages: total,
    lengthByUnit,
    updatedAt: nowIso,
  };
  if (unitSwitches.length > 0) next.unitSwitches = unitSwitches;
  else delete next.unitSwitches;
  return next;
}

/**
 * Gives every log of the book that has no unit yet the unit it was written in (the book's unit
 * before a switch), so a switch never re-reads an older log in the new unit. Other logs untouched.
 */
export function stampLogUnits(logs: ReadingLog[], book: UserBook): ReadingLog[] {
  const ids = bookLogIds(book);
  let changed = false;
  const next = logs.map((l) => {
    if (!l || !l.bookId || !ids.has(l.bookId) || l.unit === 'pages' || l.unit === 'chapters') return l;
    changed = true;
    return { ...l, unit: logUnit(l, book) };
  });
  return changed ? next : logs;
}

/**
 * Lowering a book's progress takes back today's reading of that book, newest log first, counted in
 * pages (a chapter = 20 pages), whatever unit each log was written in; earlier days never change.
 * A chapter log that is only partly taken back loses whole chapters and the extra pages come back
 * as a pages log at the same time (refund), so the day keeps exactly the pages still read.
 */
export function takeBackTodaysReading(
  logs: ReadingLog[],
  book: UserBook,
  date: string,
  decrease: number,
  nowIso: string,
  newId: () => string
): { logs: ReadingLog[]; removedIds: string[] } {
  const ids = bookLogIds(book);
  let left = toPages(Math.max(0, decrease), unitOf(book));
  const removedIds: string[] = [];
  const changed = new Map<string, ReadingLog | null>();
  const added: ReadingLog[] = [];
  const todays = logs
    .filter((l) => l && l.date === date && l.bookId && ids.has(l.bookId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  for (const l of todays) {
    if (left <= 0) break;
    const unit = logUnit(l, book);
    const pages = logPageAmount(l, book);
    if (pages <= 0) continue;
    if (pages <= left) {
      left -= pages;
      removedIds.push(l.id);
      changed.set(l.id, null);
      continue;
    }
    if (unit === 'pages') {
      changed.set(l.id, { ...l, unit, pagesRead: pages - left, updatedAt: nowIso } as ReadingLog);
    } else {
      const chapters = Math.ceil(left / PAGES_PER_CHAPTER);
      const refund = chapters * PAGES_PER_CHAPTER - left;
      const rest = l.pagesRead - chapters;
      if (rest > 0) changed.set(l.id, { ...l, unit, pagesRead: rest, updatedAt: nowIso } as ReadingLog);
      else {
        removedIds.push(l.id);
        changed.set(l.id, null);
      }
      if (refund > 0) {
        added.push({ id: newId(), bookId: l.bookId, date, pagesRead: refund, unit: 'pages', pointsAwarded: 0, createdAt: l.createdAt });
      }
    }
    left = 0;
  }
  if (changed.size === 0) return { logs, removedIds };
  const kept = logs.flatMap((l) => (l && changed.has(l.id) ? (changed.get(l.id) ? [changed.get(l.id) as ReadingLog] : []) : [l]));
  return { logs: [...added, ...kept], removedIds };
}
