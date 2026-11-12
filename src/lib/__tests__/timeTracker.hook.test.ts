// Hook test (real useAppState + in-process fake Supabase, see harness/): the Time Tracker actions of a
// signed-in account. Written for C2 (moving the Time Tracker actions out of useAppState).
//   T18  a new category and a block for today reach state and their synced tables; an overlapping
//        block is refused (the action reads current state); deleting the block removes it from state
//        and from the day row.
import { bootHook, story, until, quiet, rows, eq, assert, pass, server, UID } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';

await story('timeTracker.hook (Time Tracker actions)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await quiet(1500);

  // T18
  const today = (await import('../time/dates')).todayKey();
  const activity = h.s().addTimeTrackerActivity({ name: 'HookCategory', color: '#123456', icon: 'Star', isSystemDefault: false });
  await until(() => h.s().state.timeTracker?.activities?.some((a) => a.id === activity.id), 'T18: new category in state');
  await until(() => rows('time_tracker_activities').some((r) => r.id === activity.id || JSON.stringify(r).includes(activity.id)), 'T18: category row reached time_tracker_activities', 5000);
  h.s().addDailyTimeBlock(today, { activityId: activity.id, startTime: '00:00', endTime: '00:30' } as never);
  const blockOnScreen = () => (h.s().state.timeTracker?.dailyLogs?.[today] || []).find((b) => b.activityId === activity.id);
  await until(blockOnScreen, 'T18: block for today in state');
  const blockId = blockOnScreen()!.id;
  await until(() => rows('time_tracker_days').some((r) => JSON.stringify(r).includes(blockId)), 'T18: block reached the time_tracker_days row', 5000);
  // The overlap check reads the current state through get(): a second block at the same time is refused.
  let overlapError = '';
  try {
    h.s().addDailyTimeBlock(today, { activityId: activity.id, startTime: '00:00', endTime: '00:30' } as never);
  } catch (err) {
    overlapError = String((err as Error)?.message ?? err);
  }
  assert(overlapError !== '', 'T18: an overlapping block is refused (the action reads current state)');
  eq((h.s().state.timeTracker?.dailyLogs?.[today] || []).filter((b) => b.activityId === activity.id).length, 1, 'T18: still one block');
  h.s().deleteDailyTimeBlock(today, blockId);
  await until(() => !blockOnScreen(), 'T18: block gone from state');
  await until(() => !rows('time_tracker_days').some((r) => JSON.stringify(r?.data?.blocks ?? r?.blocks ?? []).includes(blockId)), 'T18: block gone from the day row', 5000);
  pass('T18 Time Tracker category + block saved, block delete saved');
});
