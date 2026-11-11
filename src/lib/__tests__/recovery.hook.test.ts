// Hook test (real useAppState + in-process fake Supabase, see harness/): the recovery actions of a
// signed-in account (sobriety tracker, check-ins, cravings). Written for C2 (moving them out of
// useAppState).
//   T21  a new tracker reaches state and addiction_trackers; a rename reads current state and saves;
//        a check-in for today is kept and its undo removes it; a reset moves the start date; a craving
//        reaches craving_logs and its delete removes it; deleting the tracker removes it.
import { bootHook, story, until, quiet, rows, assert, pass, server, UID } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';

await story('recovery.hook (tracker, check-in, craving actions)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await quiet(1500);
  const today = (await import('../dates')).todayKey();

  h.s().setAddictionTracker('HookQuit', '2026-10-01T00:00:00.000Z');
  await until(() => h.s().state.addictionTracker?.title === 'HookQuit', 'T21: tracker in state');
  const trackerId = h.s().state.addictionTracker!.id;
  await until(() => rows('addiction_trackers').some((r) => r.id === trackerId), 'T21: tracker reached addiction_trackers', 5000);

  // renameAddictionTracker checks the tracker in current state (get()) first.
  await h.s().renameAddictionTracker('HookQuitRenamed');
  await until(() => h.s().state.addictionTracker?.title === 'HookQuitRenamed', 'T21: renamed in state');
  await until(() => rows('addiction_trackers').some((r) => r.id === trackerId && JSON.stringify(r).includes('HookQuitRenamed')), 'T21: rename reached the row', 5000);

  h.s().checkInRecovery(today);
  await until(() => (h.s().state.recoveryCheckins || []).some((c) => c.id === today), 'T21: check-in for today in state');
  h.s().undoRecoveryCheckin();
  await until(() => !(h.s().state.recoveryCheckins || []).some((c) => c.id === today), 'T21: check-in undone');

  const startBefore = h.s().state.addictionTracker!.startDate;
  h.s().resetAddictionStreak();
  await until(() => h.s().state.addictionTracker!.startDate !== startBefore, 'T21: reset moves the start date');

  h.s().logCraving(6, 'HookTrigger', 'walk');
  const craving = () => h.s().state.cravingLogs.find((c) => c.trigger === 'HookTrigger');
  await until(craving, 'T21: craving in state');
  const cravingId = craving()!.id;
  await until(() => rows('craving_logs').some((r) => r.id === cravingId), 'T21: craving reached craving_logs', 5000);
  h.s().deleteCravingLog(cravingId);
  await until(() => !craving(), 'T21: craving gone from state');
  await until(() => !rows('craving_logs').some((r) => r.id === cravingId), 'T21: craving row deleted', 5000);

  h.s().deleteAddictionTracker();
  await until(() => !h.s().state.addictionTracker, 'T21: tracker gone from state');
  await until(() => !rows('addiction_trackers').some((r) => r.id === trackerId), 'T21: tracker row deleted', 5000);
  assert(!h.s().state.addictionTracker, 'T21: no tracker left');
  pass('T21 recovery tracker, rename, check-in + undo, reset, craving and deletes saved');
});
