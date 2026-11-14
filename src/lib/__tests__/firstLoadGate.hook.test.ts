// Hook test (real useAppState + in-process fake Supabase, see harness/): the account's first load
// fails on a device with no copy of the account (new device, cleared site data).
// Story, one device: the first load errors, comes back online, is retried; a later sign-in after a
// "clear site data" times out (15 s), its late answer is dropped, the user signs out and in again
// and retries; finally a sign-in with a device copy fails its load and opens from that copy.
//   T21 failed first load, no copy: the account is never shown (no empty account), firstLoadFailed
//       is set, nothing is written to the account or its profile.
//   T22 back online: the same first load runs again by itself (and fails again here: gate stays).
//   T23 Retry with the server back: the account opens from the server with its one habit.
//   T24 timeout (15 s), no copy: gate; the late answer of the timed-out load changes nothing; sign
//       out is reachable from the gate and leaves nothing behind; the next sign-in's Retry loads.
//   T25 a timed-out load WITH a device copy still opens from that copy (unchanged), no gate.
import { bootHook, story, until, quiet, rows, eq, assert, pass, fake, server, habit, seedServerHabits, setOnline, UID } from './harness/bootHook';

await story('firstLoadGate.hook (failed first load)', async () => {
  seedServerHabits(habit('srv-a', 'Read 10 pages'));
  server.blob.set(UID, { state: { username: 'hooktester' }, updated_at: 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)' });
  const cacheKey = `ascend_user_cache_${UID}`;
  /** Any write a load could make: account data, its profile row, or anything else but auth. */
  const writes = () => fake.log.filter((r) => r.method !== 'GET' && r.method !== 'HEAD' && !r.table.startsWith('auth/') && !r.table.startsWith('rpc/'));

  // T21: new device (saved sign-in, no device copy); the settings doc read fails.
  const h = await bootHook({ as: 'signedIn', beforeRender: () => fake.fail('user_data', 500, ['GET']) });
  await until(() => h.s().firstLoadFailed, 'T21: first load failed');
  await quiet(1500);
  eq(writes().map((r) => `${r.method} ${r.table}`), [], 'T21: nothing written (no profile, blob or row write)');
  assert(!h.s().isAuthChecking && !h.s().isSessionLoading, 'T21: nothing loading while the gate is up');
  eq(h.s().state.currentUser, null, 'T21: no account on screen');
  assert(!h.shownUsers.includes(UID), 'T21: the account never appeared on screen');
  assert(!h.s().isServerDataApplied, 'T21: server data not applied');
  assert(!h.storage.getItem(cacheKey), 'T21: no device copy written for the account');
  pass('T21 failed first load without a device copy: gate, no empty account, no writes');

  // T22: the device comes back online; still failing, so the gate stays.
  const readsBefore = fake.requests({ table: 'user_data', method: 'GET' }).length;
  setOnline(true);
  await until(() => fake.requests({ table: 'user_data', method: 'GET' }).length > readsBefore, 'T22: online re-ran the first load');
  await until(() => h.s().firstLoadFailed && !h.s().isSessionLoading, 'T22: gate back after the retry failed');
  eq(h.s().state.currentUser, null, 'T22: still no account on screen');
  pass('T22 back online runs the first load again by itself');

  // T23: the server is back; Retry.
  fake.unfail('user_data');
  h.s().retryFirstLoad();
  await until(h.loaded, 'T23: account loaded after Retry');
  assert(!h.s().firstLoadFailed, 'T23: gate cleared');
  eq(h.s().state.habits.map((x) => x.name), ['Read 10 pages'], 'T23: the server habit, once');
  await until(() => (fake.inFlight.get('user_data') ?? 0) === 0, 'boot saves settled');
  await quiet(1500);
  eq(rows('habits').length, 1, 'T23: server still holds exactly one habit');
  pass('T23 Retry runs the same first load and opens the account from the server');

  // T24: "clear site data", then a sign-in whose settings read hangs past the 15 s timeout.
  await h.supabase.auth.signOut();
  await until(() => h.s().state.currentUser === null && !h.s().firstLoadFailed, 'signed out');
  h.storage.removeItem(cacheKey);
  const slowRead = fake.hold((r) => r.method === 'GET' && r.table === 'user_data');
  fake.resetCounts();
  const shownBefore = h.shownUsers.length;
  await h.signIn();
  await until(() => slowRead.hits > 0, 'T24: load waiting on the settings read');
  await until(() => h.s().firstLoadFailed, 'T24: gate after the 15 s timeout', 20_000);
  eq(h.s().state.currentUser, null, 'T24: no account on screen after the timeout');
  slowRead.release(); // the timed-out load's late answer
  await quiet(2000);
  eq(h.shownUsers.slice(shownBefore), [], 'T24: the late answer did not put the account on screen');
  assert(h.s().firstLoadFailed, 'T24: gate stays after the late answer');
  eq(writes().map((r) => `${r.method} ${r.table}`), [], 'T24: nothing written while the gate is up');
  // The gate's "Sign out" button (App.tsx) calls logoutUser({ scope: 'local' }).
  const { logoutUser } = await import('../auth/auth');
  await logoutUser({ scope: 'local' });
  await until(() => !h.s().firstLoadFailed && h.s().state.currentUser === null, 'T24: sign out from the gate');
  h.s().retryFirstLoad(); // dropped with the sign-out
  await quiet(1000);
  eq(h.s().state.currentUser, null, 'T24: Retry after sign-out does nothing');
  // Next sign-in fails, then its Retry loads.
  fake.fail('user_data', 503, ['GET']);
  await h.signIn();
  await until(() => h.s().firstLoadFailed, 'T24: next sign-in failed its load');
  fake.unfail('user_data');
  h.s().retryFirstLoad();
  await until(h.loaded, 'T24: loaded after Retry');
  eq(h.s().state.habits.map((x) => x.name), ['Read 10 pages'], 'T24: one habit after Retry');
  pass('T24 timeout: gate, late answer dropped, sign out reachable, Retry loads');

  // T25: this device now holds a copy; the next load fails: it opens from the copy (unchanged).
  await until(() => (h.storage.getItem(cacheKey) || '').includes('Read 10 pages'), 'device copy written');
  await h.supabase.auth.signOut();
  await until(() => h.s().state.currentUser === null, 'signed out');
  assert(h.storage.getItem(cacheKey), 'device copy kept after sign-out');
  // A timeout, so the store's own failure path runs (a read error is answered from the copy inside
  // hydrateUserSession already).
  const slowAgain = fake.hold((r) => r.method === 'GET' && r.table === 'user_data');
  await h.signIn();
  await until(() => h.s().state.currentUser?.id === UID && !h.s().isSessionLoading, 'T25: opened from the device copy', 20_000);
  slowAgain.release();
  assert(!h.s().firstLoadFailed, 'T25: no gate with a device copy');
  assert(!h.s().isServerDataApplied, 'T25: copy, not server data');
  eq(h.s().state.habits.map((x) => x.name), ['Read 10 pages'], 'T25: the copy is shown');
  pass('T25 a timed-out load with a device copy opens from it, as before');
}, 90_000);
