// Hook test (real useAppState + in-process fake Supabase, see harness/): the sign-in page's key
// (App.tsx useAuthPageKey). The page stays mounted under the loader while a sign-in loads; when
// that sign-in ends with no account (Sign out from the first-load gate) it must come back fresh,
// not as the old instance still showing "Welcome back / Opening AscendDay…" with no form (B1,
// 2026-11-14).
//   T35 an ordinary sign-in that loads, and an ordinary sign-out: the key stays.
//   T36 sign-in whose first load fails (gate), Retry that fails again: the key stays.
//   T37 Sign out from that gate: the key changes (fresh sign-in page with its form).
//   T38 the next sign-in loads normally: the key stays.
import { bootHook, story, until, eq, assert, pass, fake, server, habit, seedServerHabits, UID } from './harness/bootHook';
import { useAuthPageKey } from '../app/useAuthPageKey';

await story('authPageKey.hook (sign-in page after the first-load gate)', async () => {
  seedServerHabits(habit('srv-a', 'Read 10 pages'));
  server.blob.set(UID, { state: { username: 'hooktester' }, updated_at: 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)' });
  const cacheKey = `ascend_user_cache_${UID}`;
  // The same two inputs App.tsx passes.
  const h = await bootHook({
    as: 'guest',
    use: (s) => useAuthPageKey(s.isSessionLoading || s.firstLoadFailed, Boolean(s.state.currentUser)),
  });
  const key = () => h.used() as number;
  await until(() => !h.s().isAuthChecking, 'boot done');
  eq(h.s().state.currentUser, null, 'signed out at the start');
  const k0 = key();

  // T35: the settings read is held so the loading state is on screen (rendered) before it ends.
  const signInLoading = async (what: string, want: number) => {
    const slow = fake.hold((r) => r.method === 'GET' && r.table === 'user_data');
    await h.signIn();
    await until(() => slow.hits > 0 && h.s().isSessionLoading, `${what}: loading shown`);
    eq(key(), want, `${what}: key unchanged while loading`);
    slow.release();
    await until(h.loaded, `${what}: signed in and loaded`);
  };
  await signInLoading('T35', k0);
  eq(key(), k0, 'T35: key unchanged by a sign-in that loads');
  await h.supabase.auth.signOut();
  await until(() => h.s().state.currentUser === null && !h.s().isSessionLoading, 'T35: signed out');
  eq(key(), k0, 'T35: key unchanged by an ordinary sign-out');
  pass('T35 ordinary sign-in and sign-out keep the sign-in page key');

  // T36: no device copy, the settings read fails.
  h.storage.removeItem(cacheKey);
  fake.fail('user_data', 500, ['GET']);
  await h.signIn();
  await until(() => h.s().firstLoadFailed, 'T36: gate after the failed first load');
  eq(key(), k0, 'T36: key unchanged while the gate is up');
  const readsBefore = fake.requests({ table: 'user_data', method: 'GET' }).length;
  h.s().retryFirstLoad();
  await until(() => fake.requests({ table: 'user_data', method: 'GET' }).length > readsBefore, 'T36: Retry ran the load');
  await until(() => h.s().firstLoadFailed && !h.s().isSessionLoading, 'T36: gate back after Retry failed');
  eq(key(), k0, 'T36: key unchanged by a Retry');
  pass('T36 gate and a failed Retry keep the key');

  // T37: the gate's "Sign out" (App.tsx) calls logoutUser({ scope: 'local' }).
  const { logoutUser } = await import('../auth/auth');
  await logoutUser({ scope: 'local' });
  await until(() => !h.s().firstLoadFailed && h.s().state.currentUser === null, 'T37: signed out from the gate');
  eq(key(), k0 + 1, 'T37: a fresh sign-in page after Sign out from the gate');
  pass('T37 Sign out from the gate gives a fresh sign-in page');

  // T38
  fake.unfail('user_data');
  await signInLoading('T38', k0 + 1);
  eq(key(), k0 + 1, 'T38: key unchanged by the next sign-in');
  assert(h.s().state.habits.length === 1, 'T38: one habit');
  pass('T38 the next sign-in loads with the same key');
}, 60_000);
