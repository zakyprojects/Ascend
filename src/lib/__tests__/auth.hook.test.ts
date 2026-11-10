// Hook test (real useAppState + in-process fake Supabase, see harness/): sign-in and log-out.
// Story, one device: the first load of the account fails (server error), the user keeps working
// locally and signs out; a later sign-in is abandoned while it loads; then two good sessions end
// with a log-out, the second one while the server refuses writes.
//   T9  failed load = local only: the edit is cached on the device, nothing is written to the account.
//   T6  sign-in generation guard: a load that finishes after a sign-out leaves the app signed out.
//   T7  log-out sends the pending edit once (one blob save, one sign-out, nothing after it) even
//       when pressed twice.
//   T8  log-out with unsent changes keeps this account's device data and says so.
import { bootHook, story, until, quiet, rows, eq, assert, pass, fake, server, habit, seedServerHabits, accountWrites, UID } from './harness/bootHook';

await story('auth.hook (sign-in / log-out)', async () => {
  seedServerHabits(habit('srv-a', 'ServerHabit'));
  server.blob.set(UID, { state: { username: 'hooktester' }, updated_at: '2026-11-01T00:00:00.000Z' });
  const cacheKey = `ascend_user_cache_${UID}`;

  // T9: the account's blob read fails at boot (no device cache yet).
  const h = await bootHook({ as: 'signedIn', beforeRender: () => fake.fail('user_data', 500, ['GET']) });
  await until(() => h.s().state.currentUser?.id === UID && !h.s().isAuthChecking && !h.s().isSessionLoading, 'fallback after the failed load');
  assert(!h.s().isServerDataApplied, 'T9: server data not applied after a failed load');
  fake.unfail('user_data'); // the server is back: a save now would write the fallback state over it
  fake.resetCounts();
  h.s().addCustomHabit('LocalOnly', 'daily');
  await until(() => (h.storage.getItem(cacheKey) || '').includes('LocalOnly'), 'T9: edit cached on the device');
  await quiet(1500);
  eq(fake.requests({ table: 'user_data' }).length, 0, 'T9: no user_data request after a failed load');
  eq(accountWrites().length, 0, 'T9: no write to the account after a failed load');
  pass('T9 failed load: the edit stays on the device, nothing is written to the account');

  await h.supabase.auth.signOut();
  await until(() => h.s().state.currentUser === null, 'signed out after the failed session');

  // T6: sign in, then sign out while the account is still loading.
  const habitsRead = fake.hold((r) => r.method === 'GET' && r.table === 'habits');
  await h.signIn();
  await until(() => habitsRead.hits > 0, 'second sign-in is loading');
  await h.supabase.auth.signOut();
  await until(() => !h.s().isSessionLoading && h.s().state.currentUser === null, 'sign-out applied during the load');
  fake.resetCounts();
  const shownBefore = h.shownUsers.length;
  habitsRead.release();
  await quiet(2000);
  eq(h.shownUsers.slice(shownBefore), [], 'T6: the account never appeared on screen after the sign-out');
  eq(h.s().state.currentUser, null, 'T6: still signed out after the abandoned load finished');
  eq(accountWrites().length, 0, 'T6: the abandoned load wrote nothing to the account');
  pass('T6 a load that finishes after a sign-out does not sign the app back in');

  // T7: a good session; an edit waits on the 500 ms save debounce when log-out is pressed twice.
  await h.signIn();
  await until(h.loaded, 'third sign-in loaded');
  await until(() => rows('habits').some((r) => r.data?.name === 'LocalOnly'), 'the edit kept from the failed session reaches the server now', 5000);
  await until(() => (fake.inFlight.get('user_data') ?? 0) === 0, 'boot saves settled');
  await quiet(1500);
  fake.resetCounts();
  h.s().setUsername('Flushed');
  await until(() => h.s().state.username === 'Flushed', 'edit on screen');
  await Promise.all([h.s().logout(), h.s().logout()]);
  const blobPosts = fake.requests({ method: 'POST', table: 'user_data' });
  eq(blobPosts.length, 1, 'T7: exactly one blob save during log-out');
  eq(blobPosts[0]?.body?.state?.username, 'Flushed', 'T7: the log-out save carries the pending edit');
  eq(fake.requests({ table: 'auth/logout' }).length, 1, 'T7: one sign-out request');
  await quiet(1500);
  eq(accountWrites().map((r) => `${r.method} ${r.table}`), ['POST user_data'], 'T7: the flush is the only account write (nothing sent after the sign-out)');
  await until(() => h.s().state.currentUser === null, 'T7: guest after log-out', 3000);
  pass('T7 log-out flushes the pending edit once, even when pressed twice');

  // T8: the server refuses writes; log-out with unsent changes.
  await h.signIn();
  await until(h.loaded, 'fourth sign-in loaded');
  await until(() => (fake.inFlight.get('user_data') ?? 0) === 0, 'boot saves settled');
  await quiet(1500);
  fake.fail('user_data', 503, ['POST']);
  fake.fail('habits', 503, ['POST', 'PATCH']);
  h.s().setUsername('Unsent');
  h.s().addCustomHabit('UnsentHabit', 'daily');
  await until(() => h.s().state.username === 'Unsent' && h.s().state.habits.some((x) => x.name === 'UnsentHabit'), 'edits on screen');
  await h.s().logout();
  await until(() => h.s().state.currentUser === null, 'T8: guest after log-out', 3000);
  const cache = h.storage.getItem(cacheKey) || '';
  assert(cache.includes('Unsent') && cache.includes('UnsentHabit'), 'T8: device cache with the unsent edits kept');
  assert(h.storage.getItem(`ascend_dirty_${UID}`) || (h.storage.getItem(`ascend_outbox_${UID}`) || '{}') !== '{}', 'T8: unsent marker (dirty flag or outbox) kept');
  assert(h.toasts.some((t) => t.title === 'Some changes may not have saved'), `T8: user told some changes may not have saved (toasts: ${JSON.stringify(h.toasts.map((t) => t.title))})`);
  pass('T8 log-out with unsent changes keeps the device data and says so');
});
