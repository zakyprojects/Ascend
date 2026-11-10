// Hook test (real useAppState + in-process fake Supabase, see harness/): table sync.
// Story: the device goes offline and the user adds a habit; the connection comes back. Later
// another device adds a habit; the session is ended from outside the tab, the user signs in
// again and logs out.
//   T14 offline: the edit waits on the device (cache + dirty flag; the outbox is only filled once a
//       save is accepted) and nothing reaches the server; online: the row is sent exactly once,
//       the dirty flag clears and the outbox is empty.
//   T15 a row written by another device arrives through realtime; after a sign-out from outside
//       this tab, and after a log-out, this tab has left both account channels (synced tables + social).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { bootHook, story, until, quiet, rows, eq, assert, pass, fake, server, habit, seedServerHabits, joinedTopics, setOnline, UID } from './harness/bootHook';

await story('sync.hook (outbox + realtime)', async () => {
  seedServerHabits(habit('srv-a', 'ServerHabit'));
  server.blob.set(UID, { state: { username: 'hooktester' }, updated_at: '2026-11-01T00:00:00.000Z' });

  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await until(() => (fake.inFlight.get('user_data') ?? 0) === 0, 'boot saves settled');
  await quiet(1500);
  const outbox = () => h.storage.getItem(`ascend_outbox_${UID}`) || '';
  const dirty = () => h.storage.getItem(`ascend_dirty_${UID}`);

  // T14
  fake.offline = true;
  setOnline(false);
  const added = h.s().addCustomHabit('OfflineEdit', 'daily');
  await until(() => (h.storage.getItem(`ascend_user_cache_${UID}`) || '').includes(added.id), 'T14: offline edit in the device cache');
  await until(() => fake.offlineAttempts > 0, 'T14: the app tried to save while offline');
  await quiet(1500);
  assert(!rows('habits').some((r) => r.id === added.id), 'T14: offline row not on the server');
  assert(dirty(), 'T14: dirty flag set while offline');

  fake.offline = false;
  fake.resetCounts();
  setOnline(true);
  await until(() => rows('habits').some((r) => r.id === added.id), 'T14: row sent after reconnect', 5000);
  await until(() => !dirty(), 'T14: dirty flag cleared after the reconnect save', 5000);
  await quiet(1500);
  const sends = fake.requests({ table: 'habits' }).filter((r) => r.method !== 'GET' && JSON.stringify(r.body).includes(added.id));
  eq(sends.length, 1, 'T14: the offline row is sent exactly once');
  assert(!outbox().includes(added.id), 'T14: outbox empty for that row');
  pass('T14 offline edit kept on the device, sent once on reconnect, dirty cleared');

  // T15
  const topics = () => joinedTopics().filter((t) => /synced_tables_|social_realtime_/.test(t));
  await until(() => topics().length === 2, `T15: both account channels joined (topics: ${JSON.stringify(joinedTopics())})`);
  const other = habit('other-dev', 'FromOtherDevice');
  server.upsert('habits', [{ id: other.id, user_id: UID, data: other, updated_at: other.updatedAt }], 'other-device');
  await until(() => h.s().state.habits.some((x) => x.id === 'other-dev'), 'T15: other device row arrived via realtime', 5000);
  // Signed out from outside this tab's log-out (another tab, or the session ended): only the
  // hook's own effect cleanups can leave the channels (log-out also closes them in auth.ts).
  await h.supabase.auth.signOut({ scope: 'local' });
  await until(() => h.s().state.currentUser === null, 'signed out from outside');
  await quiet(1000);
  eq(topics(), [], 'T15: no account channel left joined after an outside sign-out');
  await h.signIn();
  await until(h.loaded, 'signed in again');
  await until(() => topics().length === 2, 'T15: channels joined again');
  await h.s().logout();
  await until(() => h.s().state.currentUser === null, 'logged out');
  await quiet(1000);
  eq(topics(), [], 'T15: no account channel left joined after log-out');
  pass('T15 realtime row arrives; both account channels left after an outside sign-out and after log-out');
});
