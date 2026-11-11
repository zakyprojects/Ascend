// Hook test (real useAppState + in-process fake Supabase, see harness/): the bad-habit actions of a
// signed-in account. Written for C2 (moving the bad-habit actions out of useAppState).
//   T28  a custom and a Library bad habit reach bad_habits (the same Library one twice is added once);
//        logging today as Resisted saves the log and ticks the running resist challenge linked to it
//        (its save reaches shared_challenges); Slipped replaces the log and unticks the challenge; a
//        day other than today is not logged; undo removes today's log (tombstone, row gone) and
//        unticks the challenge; renaming reads current state, saves the new name and refuses a taken
//        name; deleting a bad habit removes it and its row.
import { bootHook, story, until, quiet, rows, eq, assert, pass, server, fake, UID } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const PACT = '44444444-4444-4444-8444-444444444444';

await story('badHabits.hook (bad-habit actions)', async () => {
  // eslint-disable-next-line no-restricted-syntax -- the pact starts now, so it is running today
  const startedAt = new Date().toISOString();
  const partnership = { id: 'p-hook', user1Id: UID, user1Username: 'hooktester', user2Id: PARTNER, user2Username: 'hookpartner', pairedAt: blobAt };
  const pact = {
    id: PACT, partnershipId: 'p-hook', title: 'Resist HookUrge', targetHabitName: 'HookUrge', durationDays: 7, jointStreak: 0,
    totalJointDaysCompleted: 0, user1Category: 'bad_habit', user1Target: 'HookUrge', user2Category: 'bad_habit', user2Target: 'HookUrge',
    user1DoneDates: [], user2DoneDates: [], status: 'active', createdAt: startedAt,
  };
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100, partnerships: [partnership], partnership, sharedChallenges: [pact] }, updated_at: blobAt });
  const urge = { id: 'bh-urge', name: 'HookUrge', isPreset: false, isCompleted: false, createdAt: blobAt };
  server.upsert('bad_habits', [{ id: urge.id, user_id: UID, data: urge, updated_at: blobAt }], 'seed');
  // The partners read fails, so the app keeps the partnership and pact it loaded from the account.
  fake.fail('partnerships', 500, ['GET']);
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await until(() => h.s().state.badHabits.some((b) => b.id === 'bh-urge'), 'T28: server bad habit loaded');
  await until(() => h.s().state.sharedChallenges.some((c) => c.id === PACT && c.status === 'active'), 'T28: running resist pact on screen');
  await quiet(1500);
  const { todayKey, getNextDateKey } = await import('../dates');
  const today = todayKey();
  const byName = (name: string) => h.s().state.badHabits.filter((b) => b.name === name);
  const todayLog = () => h.s().state.badHabitLogs.find((l) => l.badHabitId === 'bh-urge' && l.date === today);
  const pactDone = () => (h.s().state.sharedChallenges.find((c) => c.id === PACT)?.user1DoneDates || []).includes(today);
  const pactRowDone = () =>
    server.g('shared_challenges').some((r: { id: string; user1_done_dates?: string[] }) => r.id === PACT && (r.user1_done_dates || []).includes(today));

  const custom = h.s().addBadHabit('HookHabitBad');
  await until(() => byName('HookHabitBad').length === 1, 'T28: custom bad habit in state');
  await until(() => rows('bad_habits').some((r) => r.id === custom.id), 'T28: custom bad habit reached bad_habits', 5000);
  const { PRESET_BAD_HABITS } = await import('../presets');
  h.s().addBadHabit(PRESET_BAD_HABITS[0].name, true);
  await until(() => byName(PRESET_BAD_HABITS[0].name).length === 1, 'T28: Library bad habit in state');
  h.s().addBadHabit(PRESET_BAD_HABITS[0].name, true);
  await quiet(1500);
  eq(byName(PRESET_BAD_HABITS[0].name).length, 1, 'T28: the same Library bad habit is added once');

  h.s().logBadHabitDay('bh-urge', today, 'resisted');
  await until(() => todayLog()?.status === 'resisted', 'T28: Resisted log in state');
  await until(() => rows('bad_habit_logs').some((r) => r.id === todayLog()!.id), 'T28: log reached bad_habit_logs', 5000);
  await until(pactDone, 'T28: the linked resist pact is ticked in state');
  await until(pactRowDone, 'T28: the linked resist pact tick reached shared_challenges', 5000);

  h.s().logBadHabitDay('bh-urge', today, 'occurred');
  await until(() => todayLog()?.status === 'occurred', 'T28: Slipped replaces the log');
  eq(todayLog()!.consecutiveOccurrences, 1, 'T28: first slip in a row counts 1');
  await until(() => !pactDone(), 'T28: Slipped unticks the linked resist pact in state');
  await until(() => !pactRowDone(), 'T28: the untick reached shared_challenges', 5000);

  const otherDay = getNextDateKey(today);
  h.s().logBadHabitDay('bh-urge', otherDay, 'resisted');
  await quiet(1500);
  assert(!h.s().state.badHabitLogs.some((l) => l.badHabitId === 'bh-urge' && l.date === otherDay), 'T28: a day other than today is not logged');

  h.s().logBadHabitDay('bh-urge', today, 'resisted');
  await until(() => todayLog()?.status === 'resisted' && pactDone(), 'T28: Resisted again ticks the pact again');
  await until(pactRowDone, 'T28: the new tick reached shared_challenges', 5000);
  const logId = todayLog()!.id;
  h.s().undoTodayBadHabitLog('bh-urge');
  await until(() => !todayLog(), 'T28: undo removes today’s log');
  await until(() => !pactDone(), 'T28: undo unticks the linked resist pact in state');
  await until(() => !pactRowDone(), 'T28: the undo untick reached shared_challenges', 5000);
  assert((h.s().state.deletedEntityIds || []).includes(logId), 'T28: the undone log has a tombstone');
  await until(() => !rows('bad_habit_logs').some((r) => r.id === logId), 'T28: the undone log row is gone', 5000);

  h.s().renameBadHabit(custom.id, 'HookHabitBad2');
  await until(() => byName('HookHabitBad2').length === 1, 'T28: renamed bad habit in state');
  await until(() => rows('bad_habits').some((r) => r.id === custom.id && r.data?.name === 'HookHabitBad2'), 'T28: new name reached the row', 5000);
  let refused = false;
  try {
    h.s().renameBadHabit(custom.id, 'HookUrge');
  } catch {
    refused = true;
  }
  assert(refused, 'T28: renaming to a taken name is refused (reads current bad habits)');

  h.s().deleteBadHabit(custom.id);
  await until(() => byName('HookHabitBad2').length === 0, 'T28: deleted bad habit gone from state');
  assert((h.s().state.deletedEntityIds || []).includes(custom.id), 'T28: deleted bad habit has a tombstone');
  await until(() => !rows('bad_habits').some((r) => r.id === custom.id), 'T28: deleted bad habit row removed', 5000);
  fake.unfail('partnerships');
  pass('T28 bad habit add, log (with its linked resist pact), undo, rename and delete saved');
});
