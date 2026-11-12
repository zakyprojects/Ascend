// Hook test (real useAppState + in-process fake Supabase, see harness/): the reading actions of a
// signed-in account. Written for C2 (moving the reading actions out of useAppState).
//   T29  a custom book and a curated book reach reading_books (the same curated book twice is added
//        once); logging pages writes today's log, ticks the Reading habit and the running challenge
//        linked to it (saved to shared_challenges); taking the pages back removes the log
//        (tombstone) and unticks both; status and details changes are saved; finishing writes the
//        finish log, completes the book and ticks the Reading habit and its challenge again;
//        restarting reopens the book and keeps its takeaway; deleting the book removes it, its logs
//        and rows, and unticks the habit and its challenge.
import { bootHook, story, until, quiet, rows, eq, assert, pass, server, fake, UID, habit, seedServerHabits } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const PACT = '55555555-5555-4555-8555-555555555555';

await story('reading.hook (reading actions)', async () => {
  // eslint-disable-next-line no-restricted-syntax -- the pact starts now, so it is running today
  const startedAt = new Date().toISOString();
  const partnership = { id: 'p-hook', user1Id: UID, user1Username: 'hooktester', user2Id: PARTNER, user2Username: 'hookpartner', pairedAt: blobAt };
  const pact = {
    id: PACT, partnershipId: 'p-hook', title: 'Read daily', targetHabitName: 'Reading (Books)', durationDays: 7, jointStreak: 0,
    totalJointDaysCompleted: 0, user1Category: 'habit', user1Target: 'Reading (Books)', user2Category: 'habit', user2Target: 'Other',
    user1DoneDates: [], user2DoneDates: [], status: 'active', createdAt: startedAt,
  };
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100, partnerships: [partnership], partnership, sharedChallenges: [pact] }, updated_at: blobAt });
  seedServerHabits(habit('h-read', 'Reading (Books)', { points: 0, isPreset: true, isSystemLinked: true, linkedModule: 'reading', category: 'Learning & Growth' }));
  // The partners read fails, so the app keeps the partnership and pact it loaded from the account.
  fake.fail('partnerships', 500, ['GET']);
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await until(() => h.s().state.habits.some((x) => x.id === 'h-read'), 'T29: Reading habit loaded');
  await until(() => h.s().state.sharedChallenges.some((c) => c.id === PACT && c.status === 'active'), 'T29: running pact on screen');
  await quiet(1500);
  const today = (await import('../time/dates')).todayKey();
  const readingHabit = () => h.s().state.habits.find((x) => x.id === 'h-read')!;
  const habitDone = () => h.s().isHabitDone(readingHabit());
  const pactDone = () => (h.s().state.sharedChallenges.find((c) => c.id === PACT)?.user1DoneDates || []).includes(today);
  const pactRowDone = () =>
    server.g('shared_challenges').some((r: { id: string; user1_done_dates?: string[] }) => r.id === PACT && (r.user1_done_dates || []).includes(today));
  const book = (title: string) => h.s().state.libraryBooks.find((b) => b.title === title);

  h.s().addCustomBookToLibrary('HookBook', 'HookAuthor', undefined, undefined, 100, 'pages', 'reading');
  await until(() => book('HookBook'), 'T29: custom book in state');
  const bookId = book('HookBook')!.id;
  await until(() => rows('reading_books').some((r) => r.id === bookId), 'T29: custom book reached reading_books', 5000);

  const { CURATED_BOOKS } = await import('../books');
  const curated = CURATED_BOOKS[0];
  h.s().addCuratedBookToLibrary(curated);
  await until(() => h.s().state.libraryBooks.some((b) => b.curatedBookId === curated.id), 'T29: curated book in state');
  h.s().addCuratedBookToLibrary(curated);
  await quiet(1500);
  eq(h.s().state.libraryBooks.filter((b) => b.curatedBookId === curated.id).length, 1, 'T29: the same curated book is added once');
  const curatedId = h.s().state.libraryBooks.find((b) => b.curatedBookId === curated.id)!.id;

  const todayLogs = () => h.s().state.readingLogs.filter((l) => l.bookId === bookId && l.date === today);
  h.s().updateReadingProgress(bookId, 10, 10);
  await until(() => todayLogs().reduce((s, l) => s + (l.pagesRead || 0), 0) === 10, 'T29: today’s reading log in state');
  eq(book('HookBook')!.currentAmount, 10, 'T29: the book moves to page 10');
  const logId = todayLogs()[0].id;
  await until(() => rows('reading_logs').some((r) => r.id === logId), 'T29: reading log reached reading_logs', 5000);
  await until(habitDone, 'T29: logging pages ticks the Reading habit');
  await until(pactDone, 'T29: the linked pact is ticked in state');
  await until(pactRowDone, 'T29: the linked pact tick reached shared_challenges', 5000);

  h.s().updateReadingProgress(bookId, -10, 0);
  await until(() => todayLogs().length === 0, 'T29: taking the pages back removes today’s log');
  assert((h.s().state.deletedEntityIds || []).includes(logId), 'T29: the removed log has a tombstone');
  await until(() => !habitDone(), 'T29: taking the pages back unticks the Reading habit');
  await until(() => !pactRowDone(), 'T29: the untick reached shared_challenges', 5000);

  h.s().updateUserBookStatus(curatedId, 'reading', { targetFinishDate: '2026-12-31' });
  await until(() => h.s().state.libraryBooks.find((b) => b.id === curatedId)?.status === 'reading', 'T29: status change in state');
  eq(h.s().state.libraryBooks.find((b) => b.id === curatedId)!.targetFinishDate, '2026-12-31', 'T29: status change keeps the target date');
  await until(() => rows('reading_books').some((r) => r.id === curatedId && r.data?.status === 'reading'), 'T29: status change reached the row', 5000);

  h.s().updateBookDetails(bookId, { title: 'HookBook2', author: 'HookAuthor', totalAmount: 120, unit: 'pages' });
  await until(() => book('HookBook2')?.totalAmount === 120, 'T29: details change in state');
  await until(() => rows('reading_books').some((r) => r.id === bookId && r.data?.title === 'HookBook2'), 'T29: details change reached the row', 5000);

  h.s().finishBook(bookId, 'HookTakeaway');
  await until(() => book('HookBook2')?.status === 'completed', 'T29: finished book in state');
  eq([book('HookBook2')!.currentAmount, book('HookBook2')!.reflection], [120, 'HookTakeaway'], 'T29: finished book is read in full with its takeaway');
  assert(todayLogs().some((l) => l.finish === true && l.pagesRead === 120), 'T29: finishing writes the finish log for the unread pages');
  await until(habitDone, 'T29: finishing ticks the Reading habit');
  await until(pactRowDone, 'T29: the finish tick reached shared_challenges', 5000);

  h.s().restartBook(bookId);
  await until(() => book('HookBook2')?.status === 'reading', 'T29: restarted book in state');
  eq([book('HookBook2')!.currentAmount, book('HookBook2')!.reflection], [0, 'HookTakeaway'], 'T29: restarting reopens the book and keeps its takeaway');

  const finishLogIds = todayLogs().map((l) => l.id);
  h.s().deleteBook(bookId);
  await until(() => !book('HookBook2'), 'T29: deleted book gone from state');
  assert([bookId, ...finishLogIds].every((id) => (h.s().state.deletedEntityIds || []).includes(id)), 'T29: deleted book and its logs have tombstones');
  await until(() => !rows('reading_books').some((r) => r.id === bookId), 'T29: deleted book row removed', 5000);
  await until(() => !habitDone(), 'T29: deleting the only book read today unticks the Reading habit');
  await until(() => !pactRowDone(), 'T29: the delete untick reached shared_challenges', 5000);
  fake.unfail('partnerships');
  pass('T29 books added, pages logged and taken back (with the Reading habit and its pact), status, details, finish, restart and delete saved');
});
