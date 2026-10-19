import type { BookCategory, PointsEntry, UserBook } from '@/types';
import { formatDateLong, todayKey } from '@/lib/dates';
import { isChapterBook, readingBonusId } from '@/lib/readingAwards';
import { trustedNow } from '@/lib/clock';
import { sameName } from '@/lib/uniqueNames';

export type BookUnit = 'pages' | 'chapters';

/** The same book: title and author both match under the app's name rule (lib/uniqueNames). */
export const sameBook = (a: Pick<UserBook, 'title' | 'author'>, b: Pick<UserBook, 'title' | 'author'>): boolean =>
  sameName(a.title, b.title) && sameName(a.author || 'Unknown Author', b.author || 'Unknown Author');

export const DEFAULT_BOOK_LENGTH = 250;

/** The book's unit as the forms use it (older rows may carry other spellings); the same rule points use. */
export const bookUnit = (book: Pick<UserBook, 'unit'>): BookUnit => (isChapterBook(book) ? 'chapters' : 'pages');

/** Under the disabled "Count in" select of a book that has logs (isBookUnitLocked). */
export const UNIT_LOCKED_HINT = 'Locked once you log reading.';

/** "1 page", "12 pages", "3 chapters". */
export const formatAmount = (n: number, unit: BookUnit): string =>
  `${n} ${unit === 'chapters' ? (n === 1 ? 'chapter' : 'chapters') : n === 1 ? 'page' : 'pages'}`;

export interface BookProgress {
  current: number;
  total: number;
  unit: BookUnit;
  percent: number;
  left: number;
}

/** Progress as shown: the current amount never reads above the length. */
export function bookProgress(book: UserBook): BookProgress {
  const total = Math.max(1, book.totalAmount ?? book.totalPages ?? DEFAULT_BOOK_LENGTH);
  const current = Math.min(total, Math.max(0, book.currentAmount ?? book.currentPage ?? 0));
  return {
    current,
    total,
    unit: bookUnit(book),
    percent: Math.min(100, Math.round((current / total) * 100)),
    left: total - current,
  };
}

const dayNumber = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1) / 86400000;
};

export type TargetTone = 'muted' | 'warning' | 'danger' | 'success';

/**
 * The line under a book in progress: ready to finish, overdue, or days left to the target with
 * the daily amount that gets there (today and the target day both count as reading days).
 */
export function targetLine(book: UserBook): { text: string; tone: TargetTone } | null {
  const p = bookProgress(book);
  if (p.left <= 0) return { text: 'Ready to finish', tone: 'success' };
  const target = book.targetFinishDate?.slice(0, 10);
  if (!target || !/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
  const daysLeft = dayNumber(target) - dayNumber(todayKey(trustedNow()));
  if (daysLeft < 0) return { text: `Target was ${formatDateLong(target)}`, tone: 'danger' };
  const perDay = Math.ceil(p.left / (daysLeft + 1));
  if (daysLeft === 0) return { text: `Target is today, ${formatAmount(p.left, p.unit)} to go`, tone: 'warning' };
  return {
    text: `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to ${formatDateLong(target)}, about ${formatAmount(perDay, p.unit)} a day`,
    tone: 'muted',
  };
}

/** The finish bonus this book holds: the server's row, else one the app gave before server bonuses. */
export function bookBonus(book: UserBook, pointsHistory: PointsEntry[]): number {
  const row = pointsHistory.find((e) => e.id === readingBonusId(book.id));
  if (row) return Math.max(0, Number(row.amount) || 0);
  return Math.max(0, book.pointsAwarded || 0);
}

export function matchesBookFilter(
  book: { title: string; author: string; description?: string; reflection?: string; category?: BookCategory | string },
  query: string,
  category: BookCategory | 'all'
): boolean {
  if (category !== 'all' && book.category !== category) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [book.title, book.author, book.description, book.reflection].some((v) => (v || '').toLowerCase().includes(q));
}

const timeOf = (iso?: string): number => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
};

/** Newest first by the given timestamps (first one present wins). */
export const byNewest =
  (...fields: (keyof UserBook)[]) =>
  (a: UserBook, b: UserBook): number => {
    const pick = (book: UserBook) => timeOf(fields.map((f) => book[f] as string | undefined).find(Boolean));
    return pick(b) - pick(a);
  };
