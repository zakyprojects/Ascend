// Hook test (real useAppState + in-process fake Supabase, see harness/): the habit actions of a
// signed-in account. Written for C2 (moving the habit actions out of useAppState).
//   T27  a custom habit and a Library habit reach the habits table (the same Library habit twice is
//        added once); renaming reads current state, saves the new name and refuses a taken name;
//        ticking a habit marks today done, adds today's points and ticks the running challenge
//        linked to it (its save reaches shared_challenges); unticking clears today; the Reading
//        habit turns on and off (off leaves a tombstone); deleting a habit removes it and its row.
import { bootHook, story, until, quiet, rows, eq, assert, pass, server, fake, UID, habit, seedServerHabits } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const PACT = '33333333-3333-4333-8333-333333333333';

await story('habits.hook (habit actions)', async () => {
  // eslint-disable-next-line no-restricted-syntax -- the pact starts now, so it is running today
  const startedAt = new Date().toISOString();
  const partnership = { id: 'p-hook', user1Id: UID, user1Username: 'hooktester', user2Id: PARTNER, user2Username: 'hookpartner', pairedAt: blobAt };
  const pact = {
    id: PACT, partnershipId: 'p-hook', title: 'HookPact', targetHabitName: 'HookPactHabit', durationDays: 7, jointStreak: 0,
    totalJointDaysCompleted: 0, user1Category: 'habit', user1Target: 'HookPactHabit', user2Category: 'habit', user2Target: 'Other',
    user1DoneDates: [], user2DoneDates: [], status: 'active', createdAt: startedAt,
  };
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100, partnerships: [partnership], partnership, sharedChallenges: [pact] }, updated_at: blobAt });
  seedServerHabits(habit('h-pact', 'HookPactHabit'));
  // The partners read fails, so the app keeps the partnership and pact it loaded from the account.
  fake.fail('partnerships', 500, ['GET']);
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await until(() => h.s().state.habits.some((x) => x.id === 'h-pact'), 'T27: server habit loaded');
  await until(() => h.s().state.sharedChallenges.some((c) => c.id === PACT && c.status === 'active'), 'T27: running pact on screen');
  await quiet(1500);
  const today = (await import('../time/dates')).todayKey();
  const byName = (name: string) => h.s().state.habits.filter((x) => x.name === name);

  const custom = h.s().addCustomHabit('HookHabit', 'daily');
  await until(() => byName('HookHabit').length === 1, 'T27: custom habit in state');
  await until(() => rows('habits').some((r) => r.id === custom.id), 'T27: custom habit reached habits', 5000);

  const { PRESET_CATEGORIES } = await import('../content/presets');
  const preset = PRESET_CATEGORIES[0].habits[0];
  h.s().addPresetHabit(preset);
  await until(() => byName(preset.name).length === 1, 'T27: Library habit in state');
  h.s().addPresetHabit(preset);
  await quiet(1500);
  eq(byName(preset.name).length, 1, 'T27: the same Library habit is added once');

  h.s().renameHabit(custom.id, 'HookHabit2');
  await until(() => byName('HookHabit2').length === 1, 'T27: renamed habit in state');
  await until(() => rows('habits').some((r) => r.id === custom.id && r.data?.name === 'HookHabit2'), 'T27: new name reached the row', 5000);
  let refused = false;
  try {
    h.s().renameHabit(custom.id, 'HookPactHabit');
  } catch {
    refused = true;
  }
  assert(refused, 'T27: renaming to a taken name is refused (reads current habits)');

  const pactHabit = () => h.s().state.habits.find((x) => x.id === 'h-pact')!;
  const pointsBefore = h.s().state.pointsHistory.length;
  h.s().toggleHabit('h-pact');
  await until(() => h.s().isHabitDone(pactHabit()), 'T27: ticked habit is done today');
  assert(h.s().state.pointsHistory.length > pointsBefore, 'T27: ticking adds a points entry for today');
  await until(() => (h.s().state.sharedChallenges.find((c) => c.id === PACT)?.user1DoneDates || []).includes(today), 'T27: the linked pact is ticked in state');
  await until(
    () => server.g('shared_challenges').some((r: { id: string; user1_done_dates?: string[] }) => r.id === PACT && (r.user1_done_dates || []).includes(today)),
    'T27: the linked pact tick reached shared_challenges',
    5000
  );
  await until(() => rows('habits').some((r) => r.id === 'h-pact' && r.data?.completions?.[today]?.done === true), 'T27: the tick reached the row', 5000);
  h.s().toggleHabit('h-pact');
  await until(() => !h.s().isHabitDone(pactHabit()), 'T27: unticked habit is not done today');

  h.s().toggleReadingHabit();
  const reading = () => h.s().state.habits.find((x) => x.linkedModule === 'reading');
  await until(reading, 'T27: Reading habit on');
  const readingId = reading()!.id;
  await until(() => rows('habits').some((r) => r.id === readingId), 'T27: Reading habit reached habits', 5000);
  h.s().toggleReadingHabit();
  await until(() => !reading(), 'T27: Reading habit off');
  assert((h.s().state.deletedEntityIds || []).includes(readingId), 'T27: Reading habit off leaves a tombstone');

  h.s().deleteHabit(custom.id);
  await until(() => byName('HookHabit2').length === 0, 'T27: deleted habit gone from state');
  assert((h.s().state.deletedEntityIds || []).includes(custom.id), 'T27: deleted habit has a tombstone');
  await until(() => !rows('habits').some((r) => r.id === custom.id), 'T27: deleted habit row removed', 5000);
  fake.unfail('partnerships');
  pass('T27 habit add, rename, tick (with its linked pact), Reading habit and delete saved');
});
