// Hook test (real useAppState + in-process fake Supabase, see harness/): data-loss guards.
// Story: this tab last knew the account with 20 items (its in-memory watermark), but the server
// now answers with 2. The user keeps the existing data; later the sign-in disappears from the
// tab's storage (signed out in another tab) while an edit waits to be saved.
//   T10 the load that would drop most of the data asks first (destructive-wipe prompt at
//       hydration), writes nothing, and Cancel writes nothing either.
//   T11 a save that finds its sign-in gone keeps the edit on the device (dirty), shows no error
//       toast, writes nothing, and the tab shows the account signed out.
import { bootHook, story, until, quiet, eq, assert, pass, fake, server, habit, seedServerHabits, accountWrites, UID, AUTH_KEY } from './harness/bootHook';

await story('guards.hook (data-loss guards)', async () => {
  seedServerHabits(habit('srv-a', 'ServerA'), habit('srv-b', 'ServerB'));
  server.blob.set(UID, { state: { username: 'hooktester' }, updated_at: '2026-11-01T00:00:00.000Z' });

  const h = await bootHook({
    as: 'signedIn',
    beforeRender: async () => {
      const { setUserDataWatermark } = await import('../auth/supabase');
      setUserDataWatermark(UID, { itemCount: 20, arrayBreakdown: { habits: 20 }, tombstoneIds: [] });
    },
  });

  // T10: the prompt comes from the hydration guard itself (its own description), in the same
  // commit as the state, and server data is not marked applied.
  await until(() => h.s().destructiveWipeModal?.open, 'T10: destructive-wipe prompt opened');
  const desc = h.s().destructiveWipeModal?.description || '';
  assert(/items are missing compared to your last save/.test(desc), `T10: prompt raised by the hydration guard (description: ${JSON.stringify(desc)})`);
  assert(!h.s().isServerDataApplied, 'T10: suspicious load not marked as applied server data');
  eq(h.s().state.habits.map((x) => x.id).sort(), ['srv-a', 'srv-b'], 'T10: what the server has is on screen');
  await quiet(1500);
  eq(accountWrites().map((r) => `${r.method} ${r.table}`), [], 'T10: nothing written while the prompt is open');
  fake.resetCounts();
  h.s().handleCancelDestructiveWipe();
  await quiet(1500);
  eq(accountWrites().map((r) => `${r.method} ${r.table}`), [], 'T10: Cancel writes nothing');
  eq(h.s().state.habits.map((x) => x.id).sort(), ['srv-a', 'srv-b'], 'T10: nothing removed after Cancel');
  pass('T10 hydration drop guard: prompt, no write; Cancel writes nothing');

  // T11: the sign-in is gone from storage (another tab signed out), then an edit.
  h.storage.removeItem(AUTH_KEY);
  fake.resetCounts();
  const toastsBefore = h.toasts.length;
  // An immediate save (not the username: a username change also re-runs the social sync, which
  // notices the lost sign-in by itself before any save).
  h.s().setLastSeenRelease(200);
  await until(() => h.s().state.currentUser === null, 'T11: tab shows the account signed out', 5000);
  await quiet(1500);
  eq(accountWrites().map((r) => `${r.method} ${r.table}`), [], 'T11: nothing written without the sign-in');
  eq(h.toasts.slice(toastsBefore).filter((t) => t.kind === 'error').map((t) => t.title), [], 'T11: no error toast');
  assert(h.storage.getItem(`ascend_dirty_${UID}`), 'T11: the unsaved edit stays marked on the device (dirty flag)');
  assert((h.storage.getItem(`ascend_user_cache_${UID}`) || '').includes('"lastSeenRelease":200'), 'T11: the edit is in the device cache');
  pass('T11 session lost: edit kept on the device, no toast, no write, signed out');
});
