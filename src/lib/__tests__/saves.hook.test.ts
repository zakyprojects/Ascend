// Hook test (real useAppState + in-process fake Supabase, see harness/): saves of a signed-in account.
// Story: the app reopens on a device that holds an unsaved habit created offline in an earlier
// session (device cache marked dirty). The account then saves a few quick edits and ticks a habit.
//   T3  hydration merges server data and the dirty device cache (never a wholesale replace): the
//       offline setting edit and the offline habit are kept and reach the server.
//   T4  one save at a time: while a blob write is on its way, later saves wait; the last edit wins.
//   T5  the app never writes points: a habit tick sends the habit row, no point_entries write, and
//       the blob carries no point totals.
import { bootHook, story, until, quiet, rows, eq, assert, pass, fake, server, habit, seedServerHabits, UID } from './harness/bootHook';

const blobAt = '2026-11-01T00:00:00.000Z';

await story('saves.hook (signed-in saves)', async () => {
  seedServerHabits(habit('srv-a', 'ServerHabit'));
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });

  const h = await bootHook({
    as: 'signedIn',
    storage: {
      [`ascend_user_cache_${UID}`]: {
        currentUser: { id: UID, uid: '424242', email: 'hook@test.local', username: 'hooktester', avatar: '🧑', createdAt: blobAt },
        username: 'hooktester',
        // An offline edit of a blob setting (the server blob still has 100) and an offline habit.
        lastSeenRelease: 150,
        habits: [habit('off-c', 'OfflineHabit')],
      },
      [`ascend_dirty_${UID}`]: 'earlier-session-1',
    },
  });
  await until(h.loaded, 'signed-in boot loaded');

  // T3
  eq(h.s().state.habits.map((x) => x.name).sort(), ['OfflineHabit', 'ServerHabit'], 'T3: state = server habit + offline habit from the dirty cache');
  eq(h.s().state.lastSeenRelease, 150, 'T3: offline setting edit from the dirty cache kept over the older server blob');
  await until(() => rows('habits').some((r) => r.id === 'off-c'), 'T3: offline habit uploaded', 5000);
  await until(() => server.blob.get(UID)?.state?.lastSeenRelease === 150, 'T3: offline setting edit saved to the blob', 5000);
  assert(rows('habits').some((r) => r.id === 'srv-a'), 'T3: server habit kept on the server');
  pass('T3 hydration merges server + dirty device cache; offline habit uploaded');

  // Let the post-boot saves settle before counting.
  await until(() => (fake.inFlight.get('user_data') ?? 0) === 0 && (fake.inFlight.get('habits') ?? 0) === 0, 'boot saves settled');
  await quiet(1500);

  // T4: hold the first blob write; two more immediate saves queue behind it.
  const blobWrite = fake.hold((r) => r.method === 'POST' && r.table === 'user_data');
  fake.resetCounts();
  for (const mark of [151, 152, 153]) {
    h.s().setLastSeenRelease(mark);
    await until(() => h.s().state.lastSeenRelease === mark, `edit ${mark} on screen`);
    if (mark === 151) await until(() => blobWrite.hits === 1, 'first blob write reached the server (held)');
  }
  await quiet(1500);
  eq(fake.maxInFlight('user_data'), 1, 'T4: at most one user_data request in flight while a save is held');
  blobWrite.release();
  await until(() => server.blob.get(UID)?.state?.lastSeenRelease === 153, 'T4: final blob holds the last edit', 5000);
  await until(() => (fake.inFlight.get('user_data') ?? 0) === 0, 'queued saves finished');
  await quiet(1500);
  eq(server.blob.get(UID)?.state?.lastSeenRelease, 153, 'T4: no older save lands after the last one');
  eq(fake.maxInFlight('user_data'), 1, 'T4: saves never overlapped');
  pass('T4 one save at a time; the last edit is what the server keeps');

  // T5: tick a habit; the habit row goes out, no point_entries write, no point totals in the blob.
  fake.resetCounts();
  const today = (await import('../time/dates')).todayKey();
  h.s().toggleHabit('srv-a');
  await until(() => rows('habits').find((r) => r.id === 'srv-a')?.data?.completions?.[today], 'T5: tick reached the habits table', 5000);
  await until(() => (h.s().state.pointsHistory || []).some((e) => JSON.stringify(e).includes('srv-a')), 'T5 precondition: the tick made a local points entry');
  await quiet(1500);
  eq(fake.requests({ table: 'point_entries' }).filter((r) => r.method !== 'GET').length, 0, 'T5: no app write to point_entries');
  const blob = server.blob.get(UID)?.state || {};
  eq(['totalPoints', 'seasonPoints', 'pointsHistory'].filter((k) => k in blob), [], 'T5: blob carries no point totals or ledger');
  pass('T5 the app never writes points (server-owned)');
});
