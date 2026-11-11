// Hook test (real useAppState + in-process fake Supabase, see harness/): the workout actions of a
// signed-in account. Written for C2 (moving the workout actions out of useAppState).
//   T19  logging a workout puts it in state and in the workouts table with today's points entry;
//        editing it reads current state and saves the new type; deleting it removes it from state and
//        the table and leaves a tombstone; "clear older" removes an earlier day's workout only.
import { bootHook, story, until, quiet, rows, eq, assert, pass, server, UID } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';

await story('workouts.hook (workout actions)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  const old = { id: 'w-old', date: '2026-10-01', type: 'OldRun', durationMinutes: 20, pointsAwarded: 0, createdAt: blobAt };
  server.upsert('workouts', [{ id: old.id, user_id: UID, date: old.date, data: old, updated_at: blobAt }], 'seed');
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await until(() => h.s().state.workouts.some((w) => w.id === 'w-old'), 'T19: earlier workout loaded');
  await quiet(1500);

  const today = (await import('../dates')).todayKey();
  const pointsBefore = h.s().state.pointsHistory.length;
  h.s().logWorkout('HookRun', 30);
  const mine = () => h.s().state.workouts.find((w) => w.date === today && (w.type === 'HookRun' || w.type === 'HookRide'));
  await until(mine, 'T19: logged workout in state');
  const id = mine()!.id;
  assert(h.s().state.pointsHistory.length > pointsBefore, 'T19: logging a workout adds a local points entry for today');
  await until(() => rows('workouts').some((r) => r.id === id), 'T19: workout row reached the workouts table', 5000);

  // updateWorkout checks the workout in current state (get()) before it saves.
  await h.s().updateWorkout(id, 'HookRide', 45);
  await until(() => mine()?.type === 'HookRide', 'T19: edited type in state');
  await until(() => rows('workouts').some((r) => r.id === id && JSON.stringify(r).includes('HookRide')), 'T19: edited type reached the row', 5000);

  h.s().deleteWorkout(id);
  await until(() => !mine(), 'T19: workout gone from state');
  assert((h.s().state.deletedEntityIds || []).includes(id), 'T19: deleted workout has a tombstone');
  await until(() => !rows('workouts').some((r) => r.id === id), 'T19: workout row deleted', 5000);

  h.s().clearWorkoutsBefore(today);
  await until(() => !h.s().state.workouts.some((w) => w.id === 'w-old'), 'T19: earlier workout cleared from state');
  await until(() => !rows('workouts').some((r) => r.id === 'w-old'), 'T19: earlier workout row deleted', 5000);
  eq(h.s().state.workouts.filter((w) => w.date === today).length, 0, 'T19: nothing of today left over');
  pass('T19 workout log, edit, delete and clear-older saved');
});
