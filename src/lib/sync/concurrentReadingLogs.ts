import type { AppState, ReadingLog, UserBook } from '../../types';

/** Two progress writes this close together, on two devices, are treated as made at the same time. */
const CONCURRENT_MS = 10 * 60 * 1000;

const at = (iso: string | undefined): number => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : NaN;
};

/**
 * A book's progress is one number in its row (the newer write wins), while each progress step also
 * writes a log of the pages it added. When two devices raise the same book within moments, neither
 * having seen the other, both logs survive but only one number does, so progress ends lower than
 * the logs. This puts the other device's pages back, once, on the device whose write lost them.
 *
 * A pulled log (new to this state, not deleted here) is counted when it is concurrent with this
 * device's own last progress write of that book: the log was made within the last 10 minutes, the
 * book was last changed after the log was made and within 10 minutes of it, and that change made a
 * log of its own here (created at or after the book's change), so it could not have counted the
 * pulled one. The device that made the pulled log sees it created at or after its own book change
 * and does nothing, so only one device raises. Progress only goes up, never past the book's length;
 * status is unchanged (a book is finished only by Finish). Points do not read progress.
 * Returns `next` itself when nothing changes.
 */
export function raiseBooksForConcurrentLogs(prev: AppState, next: AppState, nowMs: number, nowIso: string): AppState {
  const nextLogs = next.readingLogs || [];
  if (nextLogs === prev.readingLogs || nextLogs.length === 0) return next;
  const known = new Set((prev.readingLogs || []).map((log) => log?.id));
  const tombstones = new Set(prev.deletedEntityIds || []);
  const pulled = nextLogs.filter((log): log is ReadingLog => {
    if (!log?.id || known.has(log.id) || tombstones.has(log.id) || !log.bookId || log.finish) return false;
    const made = at(log.createdAt);
    return (log.pagesRead || 0) > 0 && made <= nowMs + 60_000 && nowMs - made <= CONCURRENT_MS;
  });
  if (pulled.length === 0) return next;

  let changed = false;
  const books = (next.libraryBooks || []).map((book: UserBook) => {
    const changedAt = at(book.updatedAt);
    if (!Number.isFinite(changedAt)) return book;
    const ownWrite = nextLogs.some(
      (log) => log && known.has(log.id) && log.bookId === book.id && at(log.createdAt) >= changedAt
    );
    if (!ownWrite) return book;
    const missed = pulled
      .filter((log) => log.bookId === book.id && at(log.createdAt) < changedAt && changedAt - at(log.createdAt) <= CONCURRENT_MS)
      .reduce((sum, log) => sum + (log.pagesRead || 0), 0);
    if (missed <= 0) return book;
    const current = book.currentAmount ?? book.currentPage ?? 0;
    const total = book.totalAmount ?? book.totalPages ?? 250;
    const raised = Math.min(total, current + missed);
    if (raised <= current) return book;
    changed = true;
    return { ...book, currentAmount: raised, currentPage: raised, updatedAt: nowIso };
  });
  return changed ? { ...next, libraryBooks: books } : next;
}
