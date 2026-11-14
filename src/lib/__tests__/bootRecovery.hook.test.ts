// Hook test (real useAppState + in-process fake Supabase, see harness/): the account's load fails on
// a device that holds a copy of it, so the app opens from that copy (nothing synced yet).
// Story, one device: a normal load writes the device copy; sign out; another device adds a habit.
//   RC1 the next sign-in's load hangs past the 15 s timeout: the app opens from the copy, an edit is
//       made on it, a pull meanwhile waits on that same load (no second load), and the late answer
//       is applied: the other device's habit arrives, the edit is kept once and reaches the server.
//   RC2 a load that fails at once (no timeout): opens from the copy and stays as it is (no retry
//       loop); pull-to-refresh loads the account again and it syncs.
import { bootHook, story, until, quiet, rows, eq, assert, pass, fake, server, habit, seedServerHabits, UID } from './harness/bootHook';

await story('bootRecovery.hook (load failed, opened from the device copy)', async () => {
  seedServerHabits(habit('srv-a', 'Read 10 pages'));
  server.blob.set(UID, { state: { username: 'hooktester' }, updated_at: 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)' });
  const cacheKey = `ascend_user_cache_${UID}`;
  const names = () => h.s().state.habits.map((x) => x.name).sort();

  // A normal load: the device copy is written. Then sign out (the copy stays).
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'first load');
  await until(() => (h.storage.getItem(cacheKey) || '').includes('Read 10 pages'), 'device copy written');
  await until(() => (fake.inFlight.get('user_data') ?? 0) === 0, 'boot saves settled');
  await h.supabase.auth.signOut();
  await until(() => h.s().state.currentUser === null, 'signed out');

  // RC1: another device adds a habit; this sign-in's settings read hangs past the 15 s timeout.
  seedServerHabits(habit('srv-b', 'From other device'));
  const slow = fake.hold((r) => r.method === 'GET' && r.table === 'user_data');
  await h.signIn();
  await until(() => h.s().state.currentUser?.id === UID && !h.s().isSessionLoading, 'RC1: opened from the device copy', 20_000);
  assert(!h.s().isServerDataApplied, 'RC1: copy, not server data');
  eq(names(), ['Read 10 pages'], 'RC1: the copy is shown');
  const edit = h.s().addCustomHabit('Made on the copy', 'daily');
  await quiet(1000);
  assert(!rows('habits').some((r: any) => r.id === edit.id), 'RC1: the edit waits (nothing saved before a load)');
  const readsBeforePull = slow.hits;
  let pulled = false;
  const pull = h.s().refreshNow().then(() => (pulled = true));
  await quiet(1000);
  eq(slow.hits, readsBeforePull, 'RC1: the pull did not start a second load');
  assert(!pulled, 'RC1: the pull waits on the running load');
  slow.release(); // the timed-out load's late answer
  await until(() => h.s().isServerDataApplied, 'RC1: late answer applied', 10_000);
  await pull;
  eq(names(), ['From other device', 'Made on the copy', 'Read 10 pages'], 'RC1: server rows + the edit, each once');
  await until(() => rows('habits').some((r: any) => r.id === edit.id), 'RC1: the edit reached the server', 5000);
  await quiet(1500);
  eq(rows('habits').filter((r: any) => r.data?.name === 'Made on the copy').length, 1, 'RC1: one copy of the edit on the server');
  eq(rows('habits').length, 3, 'RC1: server holds three habits');
  pass('RC1 a timed-out load is adopted when it answers; a pull meanwhile waits on it; the edit is kept once');

  // RC2: a load that fails at once (the profile row is missing and creating it fails).
  await until(() => (fake.inFlight.get('user_data') ?? 0) === 0 && (fake.inFlight.get('habits') ?? 0) === 0, 'saves settled');
  await h.supabase.auth.signOut();
  await until(() => h.s().state.currentUser === null, 'signed out');
  const profiles = server.g('profiles');
  const profileRow = profiles.splice(0, profiles.length);
  fake.fail('profiles', 500, ['POST']);
  seedServerHabits(habit('srv-c', 'Added later')); // before the sign-in, so realtime does not bring it
  await h.signIn();
  await until(() => h.s().state.currentUser?.id === UID && !h.s().isSessionLoading, 'RC2: opened from the device copy');
  assert(!h.s().isServerDataApplied, 'RC2: copy, not server data');
  fake.resetCounts();
  await quiet(1500);
  eq(fake.requests({ table: 'user_data', method: 'GET' }).length, 0, 'RC2: no retry loop on its own');
  assert(!names().includes('Added later'), 'RC2: not synced before the pull');
  profiles.push(...profileRow);
  fake.unfail('profiles');
  await h.s().refreshNow();
  await until(() => h.s().isServerDataApplied, 'RC2: the pull loaded the account', 10_000);
  assert(fake.requests({ table: 'user_data', method: 'GET' }).length >= 1, 'RC2: the pull read the settings doc');
  eq(names(), ['Added later', 'From other device', 'Made on the copy', 'Read 10 pages'], 'RC2: synced after the pull');
  pass('RC2 a failed load opened from the copy syncs on pull-to-refresh');
}, 90_000);
