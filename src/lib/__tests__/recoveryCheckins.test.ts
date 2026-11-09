// Recovery check-in points (20261109130000_recovery_daily_checkins.sql): the client mirror
// (computeRecoveryCheckinAward), the recovery_checkins sync collection and the merge branch.
// The same cases run against the SQL in work/rcc/pglite-test.mjs.
import { DEFAULT_STATE, type AddictionTracker, type AppState, type PointsEntry, type RecoveryCheckin } from '../../types';
const { canUndoRecoveryCheckin, computeRecoveryCheckinAward, recoveryCheckinBlock, recoveryCheckinDays, recoveryDayAwardId, recoveryPointsInSeason } =
  await import('../recoveryAwards');
const { RECOVERY_POINTS } = await import('../pointsConfig');
const { addDays, localDayStartMs } = await import('../dates');
const { getSeasonStart } = await import('../leagueTime');
const { SYNCED_COLLECTIONS } = await import('../sync/syncedCollections');
const { diffSyncedCollections, hashRow, DELETED } = await import('../sync/outbox');
const { excisePointsEntriesInternal } = await import('../store');
const { mergeAppState } = await import('../stateMerger');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const HOUR = 3600000;
const iso = (ms: number) => new Date(ms).toISOString();

// "Now" = 15:00 local on a day well inside season 1.
const today = '2026-11-20';
const NOW = localDayStartMs(today) + 15 * HOUR;
const yesterday = addDays(today, -1);
assert(JSON.stringify(recoveryCheckinDays(NOW)) === JSON.stringify({ today, yesterday }), 'today and yesterday');

const tracker = (createdMs: number, startMs = createdMs): AddictionTracker => ({
  id: 'trk1',
  title: 'Smoking',
  startDate: iso(startMs),
  createdAt: iso(createdMs),
  milestonesUnlocked: [],
});
const old = tracker(NOW - 10 * 24 * HOUR);

// Today: +1, dated at the tap; yesterday (late tap): +1 at yesterday's last millisecond.
const t = computeRecoveryCheckinAward(old, today, [], NOW);
assert(t?.id === recoveryDayAwardId(today) && t.amount === RECOVERY_POINTS.perCheckin && t.source === 'recovery_checkin', 'today earns 1');
assert(t!.timestamp === iso(NOW), 'today dated at the tap');
const y = computeRecoveryCheckinAward(old, yesterday, [], NOW);
assert(y?.timestamp === iso(localDayStartMs(today) - 1), 'yesterday dated at its last millisecond');
// Only today and yesterday; never twice.
assert(!computeRecoveryCheckinAward(old, addDays(today, -2), [], NOW), 'two days ago earns nothing');
assert(!computeRecoveryCheckinAward(old, addDays(today, 1), [], NOW), 'tomorrow earns nothing');
assert(!computeRecoveryCheckinAward(old, today, [t!], NOW), 'already awarded');

// The tracker's first day earns nothing; points start the next day.
const fresh = tracker(localDayStartMs(today) + 9 * HOUR);
assert(recoveryCheckinBlock(fresh, today) === 'first-day' && !computeRecoveryCheckinAward(fresh, today, [], NOW), 'creation day = 0');
assert(recoveryCheckinBlock(fresh, yesterday) === 'first-day', 'before creation = 0');
const sinceYesterday = tracker(localDayStartMs(yesterday) + 9 * HOUR);
assert(!computeRecoveryCheckinAward(sinceYesterday, yesterday, [], NOW) && computeRecoveryCheckinAward(sinceYesterday, today, [], NOW)?.amount === 1, 'created yesterday: today earns');

// A reset today: today earns nothing, yesterday (still the old streak) earns.
const relapsed = tracker(NOW - 10 * 24 * HOUR, localDayStartMs(today) + 10 * HOUR);
assert(recoveryCheckinBlock(relapsed, today) === 'restarted' && !computeRecoveryCheckinAward(relapsed, today, [], NOW), 'reset day = 0');
assert(computeRecoveryCheckinAward(relapsed, yesterday, [], NOW)?.amount === 1, 'yesterday before the reset earns');
assert(!computeRecoveryCheckinAward(null, today, [], NOW), 'no tracker = 0');

// Season cap over every recovery source of the season (old milestone rows included); earlier seasons don't count.
const seasonStart = getSeasonStart(new Date(NOW)).getTime();
const row = (id: string, amount: number, source: string, atMs: number): PointsEntry => ({ id, amount, reason: id, source, timestamp: iso(atMs) });
const held: PointsEntry[] = [
  row('recovery_trk0_1w_1', 10, 'recovery_milestone', seasonStart + HOUR),
  ...Array.from({ length: 79 }, (_, i) => row(`c${i}`, 1, 'recovery_checkin', seasonStart + (i + 2) * HOUR)),
  row('focus_award_x', 10, 'focus', seasonStart + HOUR),
  row('older', 50, 'recovery_checkin', seasonStart - HOUR),
];
assert(recoveryPointsInSeason(held, NOW) === 89, `89 held this season (${recoveryPointsInSeason(held, NOW)})`);
assert(computeRecoveryCheckinAward(old, today, held, NOW)?.amount === 1, '89 -> +1');
const full = [...held, row('c_last', 1, 'recovery_checkin', seasonStart + 200 * HOUR)];
assert(!computeRecoveryCheckinAward(old, today, full, NOW), 'cap 90 reached -> 0');

// The collection: table recovery_checkins, row id = the day, round-trips with the same hash.
const collection = SYNCED_COLLECTIONS.find((c) => c.stateKey === 'recoveryCheckins');
assert(collection?.table === 'recovery_checkins', 'recoveryCheckins is a synced collection on recovery_checkins');
const checkin: RecoveryCheckin = { id: today, trackerId: 'trk1', createdAt: iso(NOW) };
const r = collection!.toRow(checkin as never);
assert(r.id === today && (r.data as { id: string }).id === today, 'row id and data.id are the day');
assert(hashRow(collection!.toRow(collection!.fromRow({ ...r, user_id: 'u' }) as never)) === hashRow(r), 'fromRow/toRow round trip');

// Merge keeps every day either side has.
const a: AppState = { ...DEFAULT_STATE, recoveryCheckins: [checkin] };
const b: AppState = { ...DEFAULT_STATE, recoveryCheckins: [{ id: yesterday, trackerId: 'trk1', createdAt: iso(NOW - HOUR) }] };
const merged = mergeAppState(a, b);
assert((merged.recoveryCheckins || []).map((c) => c.id).sort().join(',') === [yesterday, today].sort().join(','), 'merge unions check-in days');

// Undo (the tick): only today's check-in, never yesterday's late tap or an older day.
const yCheckin: RecoveryCheckin = { id: yesterday, trackerId: 'trk1', createdAt: iso(NOW - HOUR) };
assert(canUndoRecoveryCheckin([checkin, yCheckin], today, NOW), 'today can be undone');
assert(!canUndoRecoveryCheckin([checkin, yCheckin], yesterday, NOW), "yesterday's late tap can't be undone");
assert(!canUndoRecoveryCheckin([yCheckin], today, NOW), 'nothing to undo without a check-in today');
// After midnight the day checked in is yesterday: undo is gone for it.
assert(!canUndoRecoveryCheckin([checkin], today, localDayStartMs(addDays(today, 1)) + HOUR), 'after midnight: no undo of that day');

// Undo removes today's preview point (what store.undoRecoveryCheckin excises) and nothing else.
const yPoint = computeRecoveryCheckinAward(old, yesterday, [], NOW)!;
const before: AppState = { ...DEFAULT_STATE, recoveryCheckins: [checkin, yCheckin], pointsHistory: [t!, yPoint] };
const { excisedEntryIds, ...afterPoints } = excisePointsEntriesInternal(
  { ...before, recoveryCheckins: [yCheckin] },
  (e) => e.id === recoveryDayAwardId(today) && e.source === 'recovery_checkin'
);
assert(excisedEntryIds.join(',') === recoveryDayAwardId(today), "undo excises today's point only");
assert(afterPoints.pointsHistory.map((e) => e.id).join(',') === yPoint.id, "yesterday's point stays");
// Re-tap after the undo: the same single point again (same id), never a second one.
const again = computeRecoveryCheckinAward(old, today, afterPoints.pointsHistory, NOW + HOUR);
assert(again?.id === recoveryDayAwardId(today) && again.amount === 1, 're-tap earns the same point once');
assert(!computeRecoveryCheckinAward(old, today, [...afterPoints.pointsHistory, again!], NOW + HOUR), 'a second tap after the re-tap earns nothing');

// Sync: the undo is a soft delete of today's row (no tombstone id), the re-tap an upsert of the same id.
const synced = diffSyncedCollections({ ...DEFAULT_STATE, recoveryCheckins: [checkin, yCheckin] }, {}, {}, iso(NOW));
const key = 'recoveryCheckins';
assert(Object.keys(synced.baseline[key] || {}).sort().join(',') === [yesterday, today].sort().join(','), 'both days synced');
const undone = diffSyncedCollections({ ...DEFAULT_STATE, recoveryCheckins: [yCheckin] }, synced.baseline, {}, iso(NOW + 1000));
const undoOps = Object.values(undone.outbox) as { kind: string; table: string; id: string }[];
assert(undoOps.length === 1 && undoOps[0].kind === 'delete' && undoOps[0].table === 'recovery_checkins' && undoOps[0].id === today, `undo = one delete of today (${JSON.stringify(undoOps)})`);
assert(undone.baseline[key][today] === DELETED, 'today known as deleted');
const retapItem: RecoveryCheckin = { id: today, trackerId: 'trk1', createdAt: iso(NOW + 2000) };
const retapped = diffSyncedCollections({ ...DEFAULT_STATE, recoveryCheckins: [retapItem, yCheckin] }, undone.baseline, undone.outbox, iso(NOW + 2000));
const retapOps = Object.values(retapped.outbox) as { kind: string; id: string }[];
assert(retapOps.length === 1 && retapOps[0].kind === 'upsert' && retapOps[0].id === today, `re-tap replaces the pending delete with an upsert (${JSON.stringify(retapOps)})`);

console.log('recoveryCheckins fixtures: all passed');
