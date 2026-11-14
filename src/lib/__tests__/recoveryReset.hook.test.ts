// Hook test (real useAppState + in-process fake Supabase, see harness/): a reset of the streak (Reset
// streak and Slipped share resetAddictionStreak) takes back TODAY's check-in and its preview point;
// yesterday's stays (server rule: 20261113230000_recovery_reset_takes_back_today.sql).
//   T34  a tracker 40 days old, checked in for yesterday and today (+1 preview each): the reset moves
//        the start to now, removes today's check-in and recovery_day_<today>, sends the soft delete of
//        today's check-in, and keeps yesterday's check-in and point. A second reset (Slipped without
//        Clean) changes no check-in or point.
import { bootHook, story, until, quiet, eq, assert, pass, server, fake, UID } from './harness/bootHook';
import { recoveryDayAwardId } from '../points/recoveryAwards';

/** A row an earlier device stored, put straight into the fake table. */
function seedRow(table: string, id: string, data: Record<string, unknown>, at: string) {
  server.t(table).set(`${UID}:${id}`, { user_id: UID, id, data, created_at: at, updated_at: at, deleted_at: null, server_updated_at: server.stamp() });
}

await story('recoveryReset.hook (a reset takes back today, never yesterday)', async () => {
  const { todayKey, addDays } = await import('../time/dates');
  const today = todayKey();
  const yesterday = addDays(today, -1);
  const iso = (key: string) => `${key}T12:00:00.000Z`;
  const tid = 'rr-trk';
  seedRow('addiction_trackers', tid, { id: tid, title: 'Smoking', startDate: iso(addDays(today, -40)), createdAt: iso(addDays(today, -40)), milestonesUnlocked: [] }, iso(addDays(today, -40)));
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: iso(addDays(today, -1)) });

  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  const state = () => h.s().state;
  await until(() => state().addictionTracker?.id === tid, 'T34: tracker loaded');
  await quiet(1000);

  h.s().checkInRecovery(yesterday);
  h.s().checkInRecovery(today);
  const days = () => (state().recoveryCheckins || []).map((c) => c.id).sort().join(',');
  const point = (day: string) => state().pointsHistory.find((e) => e.id === recoveryDayAwardId(day));
  await until(() => days() === [yesterday, today].sort().join(','), 'T34: both check-ins in state');
  eq(point(today)?.amount, 1, "T34: today's preview point");
  eq(point(yesterday)?.amount, 1, "T34: yesterday's preview point");
  await quiet(1500);
  const deletesOfToday = () =>
    fake.requests({ table: 'recovery_checkins' }).filter((r: any) => r.method === 'PATCH' && JSON.stringify(r).includes(today)).length;
  const deletesBefore = deletesOfToday();

  const startBefore = state().addictionTracker!.startDate;
  h.s().resetAddictionStreak();
  await until(() => state().addictionTracker!.startDate !== startBefore, 'T34: the reset moves the start date');
  eq(days(), yesterday, "T34: today's check-in is gone, yesterday's stays");
  assert(!point(today), "T34: today's preview point is gone");
  eq(point(yesterday)?.amount, 1, "T34: yesterday's point stays");
  await until(() => deletesOfToday() > deletesBefore, "T34: the soft delete of today's check-in is sent", 5000);

  // Slipped without Clean today: the streak restarts again, no check-in or point changes.
  await quiet(500);
  const pointsBefore = JSON.stringify(state().pointsHistory);
  const startMid = state().addictionTracker!.startDate;
  h.s().resetAddictionStreak();
  await until(() => state().addictionTracker!.startDate !== startMid, 'T34: second reset moves the start date');
  eq(days(), yesterday, 'T34: second reset keeps the check-ins');
  eq(JSON.stringify(state().pointsHistory), pointsBefore, 'T34: second reset keeps the points');
  pass("T34 a reset takes back today's check-in and point, yesterday's stays");
});
