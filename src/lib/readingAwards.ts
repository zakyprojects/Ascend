import type { PointsEntry, ReadingLog, UserBook } from '@/types';
import { READING_POINTS } from './pointsConfig';
import { todayKey } from './dates';

/**
 * Reading points are written by the server (supabase/migrations/20261015160000_server_reading_awards.sql):
 * one row per local day for the day's pages (up to the daily cap) and one finish bonus per book.
 * The app computes the same rows only to show them before the server's copies arrive; it never
 * uploads them, and the server skips any app write to them. Change both sides together.
 */

/** First local day whose reading points come from the server; older app-written rows stay. */
export const READING_AWARDS_SERVER_SINCE = '2026-10-15';

/** Finish bonus gates: distinct days with logged pages, and days since the first logged page. */
export const READING_BONUS_MIN_LOG_DAYS = 5;
export const READING_BONUS_MIN_SPAN_DAYS = 7;
/** Finish bonuses are at least this many local days apart (one per book still, decided on the finishing day). */
export const READING_BONUS_COOLDOWN_DAYS = 13;

export const readingAwardId = (day: string) => `reading_award_${day}`;
export const readingBonusId = (bookId: string) => `reading_bonus_${bookId}`;

/** Point entry ids only the server writes: daily page awards and finish bonuses. */
export const isServerOwnedReadingPointId = (id: string): boolean =>
  id.startsWith('reading_award_') || id.startsWith('reading_bonus_');

const localDayOf = (timestamp: string): string | null => {
  const at = new Date(timestamp);
  return Number.isNaN(at.getTime()) ? null : todayKey(at);
};

/** A page award the app wrote itself ("Read N pages of …"), on the local day it was logged. */
const appWrittenAwardDay = (entry: PointsEntry): string | null =>
  !isServerOwnedReadingPointId(entry.id || '') && entry.source === 'reading' && entry.amount > 0
    ? localDayOf(entry.timestamp)
    : null;

/** The day's page award row: the server's own, or one the app wrote for a day the server owns. */
export const isReadingDayEntry = (entry: PointsEntry, day: string): boolean =>
  entry.id === readingAwardId(day) || (day >= READING_AWARDS_SERVER_SINCE && appWrittenAwardDay(entry) === day);

/** An app-written page award or finish bonus for a day the server owns: the server retired them. */
export const isRetiredAppReadingAward = (entry: PointsEntry): boolean => {
  if (isServerOwnedReadingPointId(entry.id || '')) return false;
  const day =
    entry.source === 'reading_bonus' && entry.amount > 0 ? localDayOf(entry.timestamp) : appWrittenAwardDay(entry);
  return day !== null && day >= READING_AWARDS_SERVER_SINCE;
};

const timeOf = (value: string): number => {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Infinity : ms;
};

/** Mirror of ascend_reading_log_pages: only a positive numeric page count counts. */
const logPages = (log: ReadingLog): number =>
  typeof log.pagesRead === 'number' && Number.isFinite(log.pagesRead) ? Math.max(0, log.pagesRead) : 0;

/** The book counts in chapters (unit "chapters" in any case; anything else is pages), as the server reads it. */
export const isChapterBook = (book: Pick<UserBook, 'unit'>): boolean => String(book.unit || '').toLowerCase() === 'chapters';

/**
 * A book's unit is fixed once it has any reading log (finish logs included), so logged pages never
 * turn into chapters or back. Mirror of the reading_books_keep_unit trigger
 * (supabase/migrations/20261019170000_reading_book_unit_lock.sql).
 */
export const isBookUnitLocked = (book: Pick<UserBook, 'id' | 'linkedBookId'>, logs: ReadingLog[]): boolean =>
  logs.some((l) => Boolean(l && l.bookId && (l.bookId === book.id || l.bookId === book.linkedBookId)));

/** Pages one chapter counts as for points: 1 chapter = pointsPerChapter points. */
const PAGES_PER_CHAPTER = READING_POINTS.pointsPerChapter * READING_POINTS.pagesPerPoint;

/**
 * Mirror of ascend_recompute_reading_awards: the page award entry of one local day (null when the
 * day earns nothing), and each counted log's share in log order (shown on the log). Only logs of
 * books still in the library count, and not the pages Finish adds (finish: true); a chapter
 * book's log counts each chapter as PAGES_PER_CHAPTER pages; points = floor(day pages / pagesPerPoint),
 * capped across all books.
 */
export function computeReadingDayAward(
  logs: ReadingLog[],
  books: UserBook[],
  day: string,
  dayStartMs: number,
  nowMs: number
): { entry: PointsEntry | null; logPoints: Map<string, number> } {
  const chapterBookIds = new Set(books.filter((b) => b && isChapterBook(b)).map((b) => b.id));
  const bookIds = new Set(books.filter(Boolean).map((b) => b.id));
  const dayLogs = logs
    .filter((l) => l && l.date === day && l.finish !== true && Boolean(l.bookId && bookIds.has(l.bookId)))
    .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const logPoints = new Map<string, number>();
  let pages = 0;
  let used = 0;
  for (const l of dayLogs) {
    pages += logPages(l) * (chapterBookIds.has(l.bookId ?? '') ? PAGES_PER_CHAPTER : 1);
    const earned = Math.min(Math.floor(pages / READING_POINTS.pagesPerPoint), READING_POINTS.dailyCap);
    logPoints.set(l.id, earned - used);
    used = earned;
  }
  if (used <= 0) return { entry: null, logPoints };

  const lastMs = timeOf(dayLogs[dayLogs.length - 1].createdAt);
  const at = Math.min(Math.max(Number.isFinite(lastMs) ? lastMs : nowMs, dayStartMs), nowMs);
  const id = readingAwardId(day);
  return {
    entry: {
      id,
      amount: used,
      reason: `Pages logged (${dayLogs.length})`,
      source: 'reading',
      timestamp: new Date(at).toISOString(),
      metadata: { date: day, logs: dayLogs.length },
    },
    logPoints,
  };
}

/** Whole days from one day key to a later one. */
const daysBetween = (from: string, to: string): number => {
  const [fY, fM, fD] = from.split('-').map(Number);
  const [tY, tM, tD] = to.split('-').map(Number);
  return Math.round((Date.UTC(tY, tM - 1, tD) - Date.UTC(fY, fM - 1, fD)) / 86400000);
};

/**
 * The finish bonus gates of one book, as ascend_recompute_reading_bonus counts them: distinct days
 * with logged pages (loggedDays, at least READING_BONUS_MIN_LOG_DAYS) and days from the first of
 * them to today (spanDays, at least READING_BONUS_MIN_SPAN_DAYS). finishAddsToday counts today as
 * a reading day for a Finish that will add the unread pages (its log is not written yet).
 */
export function readingBonusProgress(
  bookId: string,
  logs: ReadingLog[],
  today: string,
  finishAddsToday = false
): { loggedDays: number; spanDays: number; meetsDays: boolean; meetsSpan: boolean } {
  const days = new Set(logs.filter((l) => l && l.bookId === bookId && logPages(l) > 0).map((l) => l.date));
  if (finishAddsToday) days.add(today);
  const first = [...days].sort()[0];
  const spanDays = first ? daysBetween(first, today) : 0;
  return {
    loggedDays: days.size,
    spanDays,
    meetsDays: days.size >= READING_BONUS_MIN_LOG_DAYS,
    meetsSpan: spanDays >= READING_BONUS_MIN_SPAN_DAYS,
  };
}

const addDays = (day: string, days: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/**
 * Mirror of ascend_recompute_reading_bonus's cooldown: the latest live finish bonus of another book
 * (lastDay) and the first day the next one can be given (nextDay = lastDay + 13). active while
 * today is before nextDay; a book finished then never gets its bonus.
 */
export function readingBonusCooldown(
  bookId: string,
  pointsHistory: PointsEntry[],
  today: string
): { active: boolean; lastDay: string | null; nextDay: string | null } {
  let lastDay: string | null = null;
  for (const e of pointsHistory) {
    if (!e || e.id === readingBonusId(bookId) || !(e.id || '').startsWith('reading_bonus_') || !(e.amount > 0)) continue;
    const day = localDayOf(e.timestamp);
    if (day && (!lastDay || day > lastDay)) lastDay = day;
  }
  const nextDay = lastDay ? addDays(lastDay, READING_BONUS_COOLDOWN_DAYS) : null;
  return { active: Boolean(nextDay && today < nextDay), lastDay, nextDay };
}

/** The book already holds its finish bonus: a server row with its id, or one the app gave before. */
export const readingBonusAlreadyGiven = (book: UserBook, pointsHistory: PointsEntry[]): boolean =>
  (book.pointsAwarded ?? 0) > 0 || pointsHistory.some((e) => e && e.id === readingBonusId(book.id));

/**
 * Mirror of ascend_recompute_reading_bonus's gates: the book is completed and readingBonusProgress
 * meets both gates. Whether a bonus was already given is the caller's check (readingBonusAlreadyGiven).
 */
export function meetsReadingBonusGates(book: UserBook, logs: ReadingLog[], today: string): boolean {
  if (book.status !== 'completed') return false;
  const { meetsDays, meetsSpan } = readingBonusProgress(book.id, logs, today);
  return meetsDays && meetsSpan;
}

/**
 * Points removing a library book takes back, as deleteBook and the server do
 * (ascend_recompute_reading_bonus + ascend_recompute_reading_awards for today):
 * - bonus: its live finish bonus row (reading_bonus_<id>), or, with no live row, the bonus the app
 *   gave before server bonuses (book.pointsAwarded), which the server takes back as a minus row
 *   (its deleted legacy marker's legacyAmount, the same number for every such book).
 * - today: today's page award now minus today's award without this book's logs (the daily cap is
 *   shared, so this can be less than the book's own pages). Earlier days' page points stay.
 */
export function bookRemovalPoints(
  book: UserBook,
  libraryBooks: UserBook[],
  readingLogs: ReadingLog[],
  pointsHistory: PointsEntry[],
  today: string
): { bonus: number; today: number; total: number } {
  const ids = new Set<string>([book.id, book.linkedBookId].filter((id): id is string => Boolean(id)));

  let bonus = 0;
  for (const id of ids) {
    const row = pointsHistory.find((e) => e && e.id === readingBonusId(id));
    if (row) {
      bonus += Math.max(0, Number(row.amount) || 0);
      continue;
    }
    const lb = libraryBooks.find((b) => b && b.id === id);
    bonus += Math.max(0, lb?.pointsAwarded ?? 0);
  }

  const todayNow = pointsHistory
    .filter((e) => e && isReadingDayEntry(e, today))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const remainingLogs = readingLogs.filter((l) => l && !(l.bookId && ids.has(l.bookId)));
  const remainingBooks = libraryBooks.filter((b) => b && !ids.has(b.id));
  const dayStartMs = new Date(`${today}T00:00:00`).getTime();
  const todayAfter = computeReadingDayAward(remainingLogs, remainingBooks, today, dayStartMs, dayStartMs).entry?.amount ?? 0;
  const todayLoss = Math.max(0, todayNow - todayAfter);

  return { bonus, today: todayLoss, total: bonus + todayLoss };
}
