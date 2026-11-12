// I7 (2026-11-12): the Recovery page gets a nav status from today's check-in (its id is the local
// day key, todayKey). No tracker -> no status; checked in -> done; open -> pending, risk from 20:00.
import type { AddictionTracker, AppState, RecoveryCheckin } from '@/types';
import { DEFAULT_STATE } from '@/types';
import { addDays, todayKey } from '../../time/dates';
import { getNavStatuses } from '../navStatus';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(Object.is(a, b), `${msg} (got ${String(a)}, want ${String(b)})`);

// Local-time dates, so the test means the same in every TZ the suite runs in.
const MORNING = new Date(2026, 10, 12, 9, 0, 0);
const BEFORE_RISK = new Date(2026, 10, 12, 19, 59, 59);
const AT_RISK = new Date(2026, 10, 12, 20, 0, 0);
const TODAY = todayKey(MORNING);
const YESTERDAY = addDays(TODAY, -1);

const tracker: AddictionTracker = {
  id: 'tracker-1',
  title: 'Recovery',
  startDate: '2026-10-01T00:00:00.000Z',
  milestonesUnlocked: [],
  createdAt: '2026-10-01T00:00:00.000Z',
};
const checkin = (id: string): RecoveryCheckin => ({ id, trackerId: tracker.id, createdAt: '2026-11-12T04:00:00.000Z' });
const stateWith = (patch: Partial<AppState>): AppState => ({ ...DEFAULT_STATE, ...patch });
const recovery = (state: AppState, now: Date) => getNavStatuses(state, () => false, now).recovery;

// 1. No tracker -> no status, even with an old check-in left in state.
eq(recovery(stateWith({ addictionTracker: null }), MORNING), undefined, 'no tracker: no status');
eq(recovery(stateWith({ addictionTracker: null, recoveryCheckins: [checkin(TODAY)] }), AT_RISK), undefined, 'no tracker, stray check-in: no status');

// 2. Checked in today -> done, before and after the risk hour.
{
  const s = stateWith({ addictionTracker: tracker, recoveryCheckins: [checkin(TODAY)] });
  const morning = recovery(s, MORNING);
  eq(morning?.tone, 'done', 'checked in: done');
  eq(morning?.label, 'checked in today', 'checked in: label');
  eq(morning?.meta, undefined, 'checked in: no meta');
  eq(recovery(s, AT_RISK)?.tone, 'done', 'checked in: still done after 20:00');
}

// 3. Not checked in -> pending before 20:00 (also with recoveryCheckins missing).
{
  const s = stateWith({ addictionTracker: tracker, recoveryCheckins: [] });
  const open = recovery(s, MORNING);
  eq(open?.tone, 'pending', 'not checked in: pending');
  eq(open?.label, 'not checked in today', 'not checked in: label');
  eq(open?.meta, undefined, 'not checked in: no meta');
  eq(recovery(s, BEFORE_RISK)?.tone, 'pending', '19:59:59: still pending');
  eq(recovery(stateWith({ addictionTracker: tracker, recoveryCheckins: undefined }), MORNING)?.tone, 'pending', 'missing array: pending');
}

// 4. From 20:00 an open day is risk.
eq(recovery(stateWith({ addictionTracker: tracker, recoveryCheckins: [] }), AT_RISK)?.tone, 'risk', '20:00: risk');

// 5. Yesterday's check-in does not count for today.
{
  const s = stateWith({ addictionTracker: tracker, recoveryCheckins: [checkin(YESTERDAY)] });
  eq(recovery(s, MORNING)?.tone, 'pending', "yesterday's check-in: pending");
  eq(recovery(s, AT_RISK)?.tone, 'risk', "yesterday's check-in: risk after 20:00");
}

// 6. The id format is the same key the Recovery page writes (todayKey / useLocalDayKey: YYYY-MM-DD local).
assert(/^\d{4}-\d{2}-\d{2}$/.test(TODAY), 'today key is YYYY-MM-DD');
eq(TODAY, '2026-11-12', 'today key is the local calendar day');

console.log('navStatus recovery: all assertions passed');
