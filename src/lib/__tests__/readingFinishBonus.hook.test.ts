// Hook test (real useAppState + in-process fake Supabase, see harness/): the book finish bonus is 20
// for a book finished now, and a bonus written before 2026-11-13 keeps its 15
// (ascend_recompute_reading_bonus, 20261113170000_reading_finish_bonus_20.sql).
//   T30  an account with an older finished book holding a server +15 bonus row and a book read on 5
//        days (the first 12 days ago): finishing that book shows the +20 preview row and
//        pointsAwarded 20, the old row still shows 15, and the app writes no point_entries row.
import { bootHook, story, until, quiet, eq, assert, pass, server, fake, UID } from './harness/bootHook';
import { readingBonusId } from '../points/readingAwards';
import { bookBonus } from '@/components/reading/bookMeta';

/** A row an earlier device (or the server) stored, put straight into the fake table. */
function seedRow(table: string, id: string, data: Record<string, unknown>, at: string) {
  server.t(table).set(`${UID}:${id}`, { user_id: UID, id, data, created_at: at, updated_at: at, deleted_at: null, server_updated_at: server.stamp() });
}

await story('readingFinishBonus.hook (finish bonus 20, older bonus keeps 15)', async () => {
  const { todayKey, addDays } = await import('../time/dates');
  const today = todayKey();
  const iso = (key: string) => `${key}T12:00:00.000Z`;
  const old = 'rb-old';
  const book = 'rb-new';
  seedRow('reading_books', old, { id: old, title: 'Old Book', author: 'A', status: 'completed', pointsAwarded: 0, unit: 'pages', totalAmount: 50, currentAmount: 50, addedAt: iso(addDays(today, -40)), completedAt: iso(addDays(today, -20)) }, iso(addDays(today, -40)));
  seedRow('reading_books', book, { id: book, title: 'New Book', author: 'A', status: 'reading', pointsAwarded: 0, unit: 'pages', totalAmount: 100, currentAmount: 50, addedAt: iso(addDays(today, -13)) }, iso(addDays(today, -13)));
  for (let d = 12; d >= 8; d--) {
    const id = `rb-log-${d}`;
    seedRow('reading_logs', id, { id, bookId: book, date: addDays(today, -d), pagesRead: 10, unit: 'pages', pointsAwarded: 0, createdAt: iso(addDays(today, -d)) }, iso(addDays(today, -d)));
  }
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: iso(addDays(today, -1)) });
  const oldId = readingBonusId(old);
  seedRow('point_entries', oldId, { id: oldId, amount: 15, reason: 'Book finished: Old Book', source: 'reading_bonus', timestamp: iso(addDays(today, -20)), metadata: { bookId: old } }, iso(addDays(today, -20)));

  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  const state = () => h.s().state;
  await until(() => state().libraryBooks.some((b) => b.id === book) && state().readingLogs.filter((l) => l.bookId === book).length === 5, 'T30: books and logs loaded');
  await until(() => state().pointsHistory.some((e) => e.id === oldId), 'T30: old bonus row loaded');
  await quiet(1000);
  const pointWrites = () => fake.requests({ table: 'point_entries' }).filter((r) => r.method !== 'GET' && r.method !== 'HEAD').length;
  const writesBefore = pointWrites();

  h.s().finishBook(book, 'Takeaway');
  await until(() => state().libraryBooks.find((b) => b.id === book)?.status === 'completed', 'T30: book finished');
  const newRow = state().pointsHistory.find((e) => e.id === readingBonusId(book));
  eq(newRow?.amount, 20, 'T30: the finish bonus preview row is +20');
  eq(newRow?.source, 'reading_bonus', 'T30: preview row source');
  eq(state().libraryBooks.find((b) => b.id === book)?.pointsAwarded, 20, 'T30: the finished book holds 20');
  eq(state().pointsHistory.find((e) => e.id === oldId)?.amount, 15, 'T30: the older bonus row keeps 15');
  const oldBook = state().libraryBooks.find((b) => b.id === old)!;
  eq(bookBonus(oldBook, state().pointsHistory), 15, 'T30: the older book shows +15');
  await quiet(1500);
  assert(pointWrites() === writesBefore, 'T30: the app writes no point_entries row');
  pass('T30 a book finished now gets +20, a bonus written before keeps +15, no app points write');
});
