// Hook test (real useAppState + in-process fake Supabase, see harness/): a second tab.
// The test plays "tab B" on the real BroadcastChannel('ascend-state-sync') next to the app's tab.
// Story: tab B saved an edit and sends its state; then a message for another account arrives,
// then one from a tab still on an old app version (no row versions).
//   T12 a state adopted from another tab is not saved again by this tab (no save echo).
//   T13 a message for another account is ignored; one without row versions is not adopted and
//       makes this tab pull from the server once instead.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { bootHook, story, until, quiet, eq, assert, pass, fake, server, habit, seedServerHabits, UID } from './harness/bootHook';

await story('tabs.hook (cross-tab state channel)', async () => {
  seedServerHabits(habit('srv-a', 'ServerHabit'));
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: '2026-11-01T00:00:00.000Z' });

  const tabB = new BroadcastChannel('ascend-state-sync');
  const fromApp: any[] = [];
  tabB.onmessage = (e: MessageEvent) => fromApp.push(e.data);

  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await until(() => fromApp.some((m) => m.type === 'ASCEND_STATE_SYNC' && m.userId === UID && m.syncHashes), 'the app tab broadcast its state');
  await until(() => (fake.inFlight.get('user_data') ?? 0) === 0, 'boot saves settled');
  await quiet(1500);
  const latest = () => [...fromApp].reverse().find((m) => m.type === 'ASCEND_STATE_SYNC' && m.userId === UID)!;
  const send = (msg: any) => tabB.postMessage({ type: 'ASCEND_STATE_SYNC', senderTabId: 'tab-B', timestamp: 0, ...msg });

  // T12: tab B's state with an edit it already saved itself.
  const base = latest();
  fake.resetCounts();
  send({ userId: UID, state: { ...base.state, lastSeenRelease: 300 }, syncHashes: base.syncHashes });
  await until(() => h.s().state.lastSeenRelease === 300, 'T12: tab B state adopted');
  await quiet(1500);
  eq(fake.requests({ method: 'POST', table: 'user_data' }).length, 0, 'T12: no blob save echo of the adopted state');
  pass('T12 adopted tab state is not saved again (no echo)');

  // T13a: a message for another account.
  const other = '22222222-2222-4222-8222-222222222222';
  send({ userId: other, state: { ...base.state, currentUser: { ...base.state.currentUser, id: other }, lastSeenRelease: 400 }, syncHashes: base.syncHashes });
  await quiet(1500);
  eq(h.s().state.currentUser?.id, UID, 'T13: still this account after a message for another one');
  eq(h.s().state.lastSeenRelease, 300, 'T13: other account state not adopted');

  // T13b: a tab on an old app version (no syncHashes).
  fake.resetCounts();
  send({ userId: UID, state: { ...base.state, lastSeenRelease: 500 } });
  await until(() => fake.requests({ method: 'GET', table: 'habits' }).length > 0, 'T13: pull started after a message without row versions');
  await quiet(1500);
  eq(h.s().state.lastSeenRelease, 300, 'T13: old-version tab state not adopted');
  eq(fake.requests({ method: 'GET', table: 'habits' }).length, 1, 'T13: exactly one pull of the habits table');
  assert(h.s().state.habits.some((x) => x.id === 'srv-a'), 'T13: account data still on screen');
  pass('T13 other-account message ignored; old-version message not adopted, one pull instead');
  tabB.close();
});
