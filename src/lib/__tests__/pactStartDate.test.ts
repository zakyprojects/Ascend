// Partner challenges across time zones (server start_date, migration 20261112100000_pact_start_date.sql).
// Day 1 = the later of the two partners' local dates at creation, the same date for both sides.
// Mutation proof: with pactStartDay ignoring startDate (the old rule, the viewer's own creation
// day on this device) the "Tokyo / London" block fails in every device zone the CI runs (Asia/Karachi,
// UTC, America/New_York) and the "Karachi / London" block fails in UTC and New York.
import type { Habit, SharedChallenge } from '@/types';
import {
  applyPledgeToggle,
  mergeSharedChallenge,
  pactCanStillFinish,
  pactDayCells,
  pactDayNumber,
  pactNotStartedYet,
  pactStartDay,
  reconcileSharedChallengeLifecycle,
  tickLinkedPacts,
} from '../partners/pactLifecycle';
import { trustedNow } from '../time/clock';
import { addDays, todayKey } from '../time/dates';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

function pact(extra: Partial<SharedChallenge>): SharedChallenge {
  return {
    id: 'c1',
    partnershipId: 'p1',
    title: 'Read',
    targetHabitName: 'Read',
    durationDays: 7,
    jointStreak: 0,
    user1Category: 'habit',
    user1Target: 'Read',
    user2Category: 'habit',
    user2Target: 'Read',
    user1DoneDates: [],
    user2DoneDates: [],
    status: 'active',
    createdAt: '2026-11-20T20:00:00.000Z',
    ...extra,
  };
}

// Noon UTC: the same calendar date on a device in Karachi, UTC and New York.
const noonUtc = (day: string) => new Date(`${day}T12:00:00.000Z`);

function karachiLondon() {
  // 01:00 PKT on 11-21 = 20:00 London on 11-20. user1 = Karachi, user2 = London. Server start 11-21.
  const c = pact({ startDate: '2026-11-21' });
  assert(pactStartDay(c) === '2026-11-21', 'start day is the server start date');

  // London viewer on the creation evening: day 1 is tomorrow, nothing lost, can still finish.
  assert(pactDayNumber(c, '2026-11-20') === 0, 'London evening = day 0');
  assert(pactNotStartedYet(c, '2026-11-20'), 'London: not started yet');
  assert(!pactNotStartedYet(c, '2026-11-21'), 'Karachi: started');
  const london = pactDayCells(c, false, '2026-11-20', '2026-11-21');
  assert(london[0].date === '2026-11-21' && london.length === 7, 'London chain starts on the shared start date');
  assert(london[0].state === 'future', 'day 1 is still to come for London');
  assert(pactCanStillFinish(london), 'London creation evening: no false "can\'t finish"');

  // Both tick 11-21 .. 11-27: Karachi viewer at the end sees 7 days, all together, nothing lost.
  const done = pact({ startDate: '2026-11-21', user1DoneDates: range('2026-11-21', 7), user2DoneDates: range('2026-11-21', 7) });
  const karachiEnd = pactDayCells(done, true, '2026-11-27', '2026-11-27');
  assert(karachiEnd.every((cell) => cell.state === 'both'), 'Karachi end: every day done together');
  assert(pactCanStillFinish(karachiEnd), 'Karachi end: can finish');
  assert(reconcileSharedChallengeLifecycle(done, noonUtc('2026-11-27')).status === 'completed', '7/7 = completed');

  // London's day 7 (11-27) is still a pact day: the challenge is running there, not ended.
  const running = pact({ startDate: '2026-11-21', user1DoneDates: range('2026-11-21', 7), user2DoneDates: range('2026-11-21', 6) });
  assert(pactDayNumber(running, '2026-11-27') === 7, 'London 11-27 = day 7');
  assert(reconcileSharedChallengeLifecycle(running, noonUtc('2026-11-27')).status === 'active', 'day 7 still running');
  assert(reconcileSharedChallengeLifecycle(running, noonUtc('2026-11-28')).status === 'expired', 'day 8 = ended on this device');
  console.log('Karachi / London start date passed');
}

function tokyoLondon() {
  // 16:00 UTC on 11-20 = 01:00 Tokyo 11-21 = 16:00 London 11-20 (and 11-20 on a Karachi, UTC or
  // New York device). Server start = 11-21.
  const c = pact({ createdAt: '2026-11-20T16:00:00.000Z', startDate: '2026-11-21' });
  const cells = pactDayCells(c, false, '2026-11-20', '2026-11-21');
  assert(cells[0].date === '2026-11-21' && cells[6].date === '2026-11-27', 'chain = 11-21 .. 11-27 on any device');
  assert(pactCanStillFinish(cells), 'no false "can\'t finish" on any device');
  assert(reconcileSharedChallengeLifecycle(c, noonUtc('2026-11-27')).status === 'active', '11-27 is day 7, still running');
  console.log('Tokyo / London start date passed');
}

function noTickBeforeDayOne() {
  const c = pact({ startDate: '2026-11-21' });
  const before = applyPledgeToggle(c, false, true, noonUtc('2026-11-20'));
  assert(before.updated === c && !before.becameCompleted, 'no tick before day 1');
  const onDay1 = applyPledgeToggle(c, false, true, noonUtc('2026-11-21'));
  assert((onDay1.updated.user2DoneDates || []).includes('2026-11-21'), 'tick on day 1');

  // A habit-linked pact whose day 1 is after the real today is left alone (the server would refuse).
  const later = addDays(todayKey(), 1);
  const linked = pact({ startDate: later, createdAt: trustedNow().toISOString() });
  const read: Habit = {
    id: 'h1', name: 'Read', frequency: 'daily', points: 1, isPreset: false,
    createdAt: '2026-10-01', createdAtPeriod: '2026-10-01', completions: {},
  };
  const res = tickLinkedPacts([linked], () => true, read, true);
  assert(res.ticks.length === 0 && res.challenges[0] === linked, 'linked tick skipped before day 1');
  console.log('no tick before day 1 passed');
}

function fallbackAndMerge() {
  // A row without a start date (older server) keeps the old rule: the viewer's creation day here.
  const old = pact({ createdAt: '2026-11-20T12:00:00.000Z' });
  assert(pactStartDay(old) === '2026-11-20', 'fallback = creation day on this device');
  assert(pactDayNumber(old, '2026-11-26') === 7, 'fallback day 7');

  // A realtime row without the start date never wipes the one already known.
  const known = pact({ startDate: '2026-11-21' });
  const incoming = pact({ user1DoneDates: ['2026-11-21'] });
  delete incoming.startDate;
  assert(mergeSharedChallenge(known, incoming).startDate === '2026-11-21', 'merge keeps the start date');
  assert(mergeSharedChallenge(pact({}), known).startDate === '2026-11-21', 'merge takes a new start date');
  console.log('fallback and merge passed');
}

karachiLondon();
tokyoLondon();
noTickBeforeDayOne();
fallbackAndMerge();
console.log('pactStartDate tests passed');
