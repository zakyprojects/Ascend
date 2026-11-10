// Hook test (real useAppState + in-process fake Supabase, see harness/): a signed-out state with
// data on screen signs in to an account whose device cache is marked dirty (unsent edits from an
// earlier session on this device).
//   T16  both are kept: the screen's (no-account) items are merged with the dirty cache and the
//        server, in state and on the server; the cache's unsent setting survives; the dirty flag
//        clears after the save.
// Not reachable from today's UI (signed-out screens are gated to /login), so this locks the merge
// for any later local-guest mode (mode-a-guest-merge-cache-2026-11-10.md).
import { bootHook, story, until, rows, eq, pass, server, habit, seedServerHabits, UID } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';

await story('guestCache.hook (signed-out data + dirty account cache)', async () => {
  seedServerHabits(habit('srv-a', 'ServerHabit'));
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });

  const h = await bootHook({
    as: 'guest',
    storage: {
      ascend_guest_state_v2: { habits: [habit('g-h1', 'GuestHabit')] },
      [`ascend_user_cache_${UID}`]: {
        currentUser: { id: UID, uid: '424242', email: 'hook@test.local', username: 'hooktester', avatar: 'x', createdAt: blobAt },
        username: 'hooktester',
        lastSeenRelease: 150,
        habits: [habit('off-c', 'OfflineHabit')],
      },
      [`ascend_dirty_${UID}`]: 'earlier-session-1',
    },
  });
  await until(() => !h.s().isAuthChecking, 'guest boot finished');
  eq(h.s().state.currentUser, null, 'boots signed out');
  eq(h.s().state.habits.map((x) => x.name), ['GuestHabit'], 'signed-out habit on screen');

  const signIn = await h.signIn();
  eq(signIn.error, null, 'sign-in accepted by the fake auth');
  await until(h.loaded, 'account loaded');

  eq(h.s().state.habits.map((x) => x.name).sort(), ['GuestHabit', 'OfflineHabit', 'ServerHabit'], 'T16: state keeps the signed-out habit, the cached offline habit and the server habit');
  await until(() => rows('habits').some((r) => r.id === 'g-h1'), 'T16: signed-out habit uploaded to the account', 5000);
  await until(() => rows('habits').some((r) => r.id === 'off-c'), 'T16: cached offline habit uploaded', 5000);
  eq(rows('habits').map((r: any) => r.data?.name).sort(), ['GuestHabit', 'OfflineHabit', 'ServerHabit'], 'T16: habits rows = the same three');
  eq(h.s().state.lastSeenRelease, 150, 'T16: the dirty cache setting (150) wins over the server (100)');
  await until(() => !h.storage.getItem(`ascend_dirty_${UID}`), 'T16: dirty flag cleared after the save', 5000);
  pass('T16 signed-out data + dirty account cache: both merged on sign-in (state + habits table)');
});
