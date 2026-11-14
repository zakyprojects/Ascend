// Hook test (real useAppState + in-process fake Supabase, see harness/): a guest signs in.
// Story: a guest has a habit on this device and signs in to an account that already has one on
// the server. While the account's rows are still loading, the guest adds another habit.
//   T1  the guest's progress is merged into the account (state and server), not dropped.
//   T2  nothing is saved to the account before its server data has loaded, and the edit made
//       during the load is kept and saved afterwards.
import { bootHook, story, until, quiet, rows, eq, assert, pass, fake, server, habit, seedServerHabits, accountWrites, UID } from './harness/bootHook';

await story('boot.hook (guest sign-in)', async () => {
  seedServerHabits(habit('srv-a', 'ServerHabit'));
  server.blob.set(UID, { state: { username: 'hooktester' }, updated_at: '2026-11-01T00:00:00.000Z' });

  const h = await bootHook({ as: 'guest', storage: { ascend_guest_state_v2: { habits: [habit('g-h1', 'GuestHabit')] } } });
  await until(() => !h.s().isAuthChecking, 'guest boot finished');
  eq(h.s().state.currentUser, null, 'boots as guest');
  eq(h.s().state.habits.map((x) => x.name), ['GuestHabit'], 'guest habit on screen');

  // Hold the account's habits read (part of hydration) to keep the load open.
  const habitsRead = fake.hold((r) => r.method === 'GET' && r.table === 'habits');
  fake.resetCounts();
  const signIn = await h.signIn();
  eq(signIn.error, null, 'sign-in accepted by the fake auth');
  await until(() => habitsRead.hits > 0, 'hydration reached the habits read');

  // T2: an edit while the account is loading.
  h.s().addCustomHabit('DuringLoad', 'daily');
  await until(() => h.s().state.habits.some((x) => x.name === 'DuringLoad'), 'edit applied on screen');
  await quiet(1500);
  eq(accountWrites().map((r) => `${r.method} ${r.table}`), [], 'T2: no write to user_data or any synced table while server data is loading');
  assert(!h.s().isServerDataApplied, 'T2: server data not applied yet while the read is held');

  habitsRead.release();
  await until(h.loaded, 'account loaded after the read is released');
  const names = h.s().state.habits.map((x) => x.name).sort();
  eq(names, ['DuringLoad', 'GuestHabit', 'ServerHabit'], 'T1/T2: state = server habit + guest habit + edit made during load');
  await until(() => rows('habits').some((r) => r.id === 'g-h1'), 'T1: guest habit uploaded to the account', 5000);
  pass('T1 guest progress merged on sign-in (state + habits table)');
  await until(() => rows('habits').some((r) => r.data?.name === 'DuringLoad'), 'T2: edit made during load uploaded after load', 5000);
  pass('T2 no save before server data; the edit made during load is kept and saved after');
  assert(rows('habits').some((r) => r.id === 'srv-a'), 'server habit still on the server');
});
