// Hook test (real useAppState + in-process fake Supabase, see harness/): a synced table's read fails
// while the account loads on a new device (no device copy), so that module would show "No habits
// yet" although the server has habits.
//   TR1 the load succeeds without the habits table (isServerDataApplied false, no habits shown); the
//       store reads the tables again by itself a few seconds later (no pull, no tab switch), and
//       once the table answers the server habit shows and isServerDataApplied turns true.
//   TR2 after that nothing keeps re-reading (no re-read loop once every table was read).
import { bootHook, story, until, quiet, eq, assert, pass, fake, server, habit, seedServerHabits, UID } from './harness/bootHook';

await story('tableReread.hook (failed table read re-read)', async () => {
  seedServerHabits(habit('srv-a', 'Read 10 pages'));
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)' });

  // TR1: new device; the habits table read fails during the load and the read right after it.
  const h = await bootHook({ as: 'signedIn', beforeRender: () => fake.fail('habits', 500, ['GET']) });
  await until(() => h.s().state.currentUser?.id === UID && !h.s().isAuthChecking && !h.s().isSessionLoading, 'TR1: account loaded');
  await quiet(1000);
  assert(!h.s().isServerDataApplied, 'TR1: not every table was read');
  eq(h.s().state.habits.length, 0, 'TR1: the habits table is not in yet');
  fake.unfail('habits');
  const readsBefore = fake.requests({ table: 'habits', method: 'GET' }).length;
  await until(() => h.s().isServerDataApplied, 'TR1: tables read again by themselves', 10_000);
  assert(fake.requests({ table: 'habits', method: 'GET' }).length > readsBefore, 'TR1: the habits table was read again');
  eq(h.s().state.habits.map((x) => x.name), ['Read 10 pages'], 'TR1: the server habit shows');
  pass('TR1 a failed table read is retried on its own and the module fills in');

  // TR2: no more re-reads once every table was read.
  fake.resetCounts();
  await quiet(6000);
  eq(fake.requests({ table: 'habits', method: 'GET' }).length, 0, 'TR2: no re-read loop');
  pass('TR2 no re-reads after a full read');
}, 60_000);
