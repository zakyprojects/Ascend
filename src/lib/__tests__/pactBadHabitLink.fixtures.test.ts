import type { BadHabit, BadHabitLog, Habit, SharedChallenge } from '@/types';
import { addDays, todayKey } from '../dates';
import {
  badHabitForPactGoal,
  badHabitStatusOn,
  isResistSide,
  linkedBadHabitFor,
  linkedHabitFor,
  pactBadHabitToAdd,
  pactCanStillFinish,
  pactDayCells,
  pactHabitToAdd,
  pactUnlinkNote,
  planLinkedPactRepairs,
  resistPactTitle,
  tickLinkedBadHabitPacts,
  type LinkedPactReconcileInput,
} from '../pactLifecycle';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// The tick helpers change the device's own today (applyPledgeToggle), so these fixtures use it.
const TODAY = todayKey();

function badHabit(id: string, name: string, extra: Partial<BadHabit> = {}): BadHabit {
  return { id, name, isPreset: true, isCompleted: false, createdAt: '2026-10-01T05:00:00.000Z', ...extra };
}

function log(badHabitId: string, status: BadHabitLog['status'], date = TODAY): BadHabitLog {
  return { id: `${badHabitId}_${date}`, badHabitId, date, status, pointsAwardedOrDeducted: 0, createdAt: '2026-10-01T05:00:00.000Z' };
}

/** A resist challenge on this bad habit, as the New challenge dialog creates it. */
function resist(id: string, name: string, extra: Partial<SharedChallenge> = {}): SharedChallenge {
  return {
    id,
    partnershipId: 'p1',
    title: resistPactTitle(name),
    targetHabitName: name,
    durationDays: 14,
    jointStreak: 0,
    user1Category: 'bad_habit',
    user1Target: name,
    user2Category: 'bad_habit',
    user2Target: name,
    user1DoneDates: [],
    user2DoneDates: [],
    status: 'active',
    // Local noon of day 1: the day chain dates from the viewer's local creation day.
    createdAt: `${TODAY}T12:00:00`,
    ...extra,
  };
}

function plan(overrides: Partial<LinkedPactReconcileInput>) {
  return planLinkedPactRepairs({
    challenges: [],
    habits: [],
    badHabits: [],
    badHabitLogs: [],
    sideOf: () => true,
    today: TODAY,
    isBusy: () => false,
    divergedBefore: new Set(),
    attemptedOn: new Map(),
    retry: new Set(),
    ...overrides,
  });
}

const doom = badHabit('b1', 'Doomscrolling');

// ── Link by name to the viewer's own active bad habit ──
{
  const p = resist('c1', 'Doomscrolling');
  assert(resistPactTitle('  Doomscrolling ') === 'Resist Doomscrolling', 'title');
  assert(isResistSide(p, true) && isResistSide(p, false), 'both sides resist');
  assert(linkedBadHabitFor(p, true, [doom])?.id === 'b1', 'user1 links by name');
  assert(linkedBadHabitFor(p, false, [badHabit('x', '  doomSCROLLING ')])?.id === 'x', "user2 links to their own bad habit (any case, spaces)");
  assert(linkedBadHabitFor(p, true, [badHabit('b2', 'Junk food')]) === null, 'another name does not link');
  assert(linkedBadHabitFor(p, true, [{ ...doom, isCompleted: true }]) === null, 'a legacy completed bad habit does not link');
  assert(badHabitForPactGoal('', [doom]) === null, 'empty goal links nothing');

  // The two link rules never cross: a habit side never links a bad habit, and the other way round.
  const habitPact: SharedChallenge = { ...p, user1Category: 'habit', user2Category: 'habit', title: 'Doomscrolling' };
  assert(linkedBadHabitFor(habitPact, true, [doom]) === null, 'a habit side does not link a bad habit');
  const sameNamedHabit: Habit = {
    id: 'h1',
    name: 'Doomscrolling',
    frequency: 'daily',
    points: 1,
    isPreset: false,
    createdAt: '2026-10-01T05:00:00.000Z',
    createdAtPeriod: '2026-10-01',
    completions: {},
  };
  assert(linkedHabitFor(p, true, [sameNamedHabit]) === null, 'a resist side does not link a habit');
  assert(pactHabitToAdd(p, true, [], TODAY) === null, 'a resist side never offers "Add as a daily habit"');

  assert(badHabitStatusOn('b1', [log('b1', 'resisted')], TODAY) === 'resisted', 'resisted today');
  assert(badHabitStatusOn('b1', [log('b1', 'occurred')], TODAY) === 'occurred', 'slipped today');
  assert(badHabitStatusOn('b1', [log('b1', 'resisted', addDays(TODAY, -1))], TODAY) === null, "yesterday's log is not today's");
  console.log('resist link fixtures passed');
}

// ── A bad-habit log ticks / unticks today's linked resist pacts (viewer side only) ──
{
  const mine = resist('t1', 'Doomscrolling');
  const theirsOnly = resist('t2', 'Doomscrolling');
  const other = resist('t3', 'Junk food');
  const finished = resist('t4', 'Doomscrolling', { status: 'completed' });
  const unknown = resist('t5', 'Doomscrolling', { partnershipId: 'other' });
  const all = [mine, theirsOnly, other, finished, unknown];
  const sideOf = (c: SharedChallenge) => (c.partnershipId === 'p1' ? c.id !== 't2' : null);

  // Logging Resisted ticks.
  const on = tickLinkedBadHabitPacts(all, sideOf, doom, true, TODAY);
  assert(on.ticks.length === 2, 'both running linked pacts tick');
  assert(on.ticks[0].updated.id === 't1' && on.ticks[0].isUser1, 'user1 side ticked');
  assert(on.ticks[1].updated.id === 't2' && !on.ticks[1].isUser1, 'user2 side ticked');
  assert((on.challenges[0].user1DoneDates || []).includes(TODAY), 'today added');
  assert((on.challenges[0].user2DoneDates || []).length === 0, "the partner's side is never touched");
  assert(on.challenges[2] === other && on.challenges[3] === finished && on.challenges[4] === unknown, 'other, finished, unknown untouched');

  // A second Resisted (already ticked) saves nothing.
  assert(tickLinkedBadHabitPacts(on.challenges, sideOf, doom, true, TODAY).ticks.length === 0, 'no second save');

  // Undo, or Resisted → Slipped, unticks today.
  const off = tickLinkedBadHabitPacts(on.challenges, sideOf, doom, false, TODAY);
  assert(off.ticks.length === 2 && !(off.challenges[0].user1DoneDates || []).includes(TODAY), 'untick on undo / slip');

  // A slip on a day that was never ticked saves nothing.
  assert(tickLinkedBadHabitPacts(all, sideOf, doom, false, TODAY).ticks.length === 0, 'slip on an unticked day: nothing sent');

  // Past days are never changed: yesterday's tick stays through today's untick.
  const yesterday = addDays(TODAY, -1);
  const withYesterday = resist('t6', 'Doomscrolling', { user1DoneDates: [yesterday, TODAY] });
  const kept = tickLinkedBadHabitPacts([withYesterday], () => true, doom, false, TODAY).challenges[0];
  assert((kept.user1DoneDates || []).join() === yesterday, "yesterday's tick stays");
  console.log('resist tick fixtures passed');
}

// ── The minute repair pass keeps a resist side equal to "Resisted today" ──
{
  const p = resist('c1', 'Doomscrolling');
  const resisted = [log('b1', 'resisted')];

  const first = plan({ challenges: [p], badHabits: [doom], badHabitLogs: resisted });
  assert(first.repairs.length === 0 && first.diverged.has('c1'), 'first sighting waits');
  const second = plan({ challenges: [p], badHabits: [doom], badHabitLogs: resisted, divergedBefore: first.diverged });
  assert(second.repairs.length === 1 && second.repairs[0].done === true, 'resisted elsewhere → tick');

  const ticked = { ...p, user1DoneDates: [TODAY] };
  const slip = plan({ challenges: [ticked], badHabits: [doom], badHabitLogs: [log('b1', 'occurred')], divergedBefore: new Set(['c1']) });
  assert(slip.repairs.length === 1 && slip.repairs[0].done === false, 'slipped elsewhere → untick');
  const undone = plan({ challenges: [ticked], badHabits: [doom], badHabitLogs: [], divergedBefore: new Set(['c1']) });
  assert(undone.repairs.length === 1 && undone.repairs[0].done === false, 'log undone elsewhere → untick');
  const inStep = plan({ challenges: [ticked], badHabits: [doom], badHabitLogs: resisted, divergedBefore: new Set(['c1']) });
  assert(inStep.repairs.length === 0 && inStep.diverged.size === 0, 'in step');

  // Deleted bad habit mid-challenge: the side is unlinked, so its (hand) tick is left alone.
  const deleted = plan({ challenges: [ticked], badHabits: [], badHabitLogs: [], divergedBefore: new Set(['c1']) });
  assert(deleted.repairs.length === 0 && deleted.diverged.size === 0, 'deleted bad habit: today stays, hand tick from now on');
  console.log('resist repair fixtures passed');
}

// ── Partner without that bad habit: "Add to my bad habits" ──
{
  const p = resist('c1', 'Doomscrolling');
  const preset = pactBadHabitToAdd(p, false, [], TODAY);
  assert(preset?.kind === 'preset' && preset.preset.name === 'Doomscrolling', 'a Library name adds the preset');
  const custom = pactBadHabitToAdd(resist('c2', 'Nail biting'), false, [], TODAY);
  assert(custom?.kind === 'custom' && custom.name === 'Nail biting', 'any other name adds a custom bad habit');
  assert(pactBadHabitToAdd(p, false, [doom], TODAY) === null, 'already has it: no offer');
  assert(pactBadHabitToAdd(p, false, [{ ...doom, isCompleted: true }], TODAY)?.kind === 'preset', 'a legacy completed one does not count');
  assert(pactBadHabitToAdd({ ...p, user2DoneDates: [TODAY] }, false, [], TODAY) === null, 'ticked by hand today: offer waits for tomorrow');
  assert(pactBadHabitToAdd({ ...p, status: 'expired' }, false, [], TODAY) === null, 'finished: no offer');
  assert(pactBadHabitToAdd({ ...p, user2Category: 'habit' }, false, [], TODAY) === null, 'not a resist side: no offer');

  assert(pactUnlinkNote(1, 'bad habit') === ' 1 running challenge uses this bad habit; it keeps going and you tick it by hand.', 'bad-habit delete note');
  assert(pactUnlinkNote(2) === ' 2 running challenges use this habit; they keep going and you tick them by hand.', 'habit note unchanged');
  console.log('resist add fixtures passed');
}

// ── Day chain and "can it still finish" (every challenge) ──
{
  const d = (n: number) => addDays(TODAY, n);
  // Day 3 of 7 today: started two days ago.
  const base = resist('c1', 'Doomscrolling', { durationDays: 7, createdAt: `${d(-2)}T12:00:00` });

  const clean = pactDayCells({ ...base, user1DoneDates: [d(-2), d(-1)], user2DoneDates: [d(-2), d(-1)] }, true, TODAY, TODAY);
  assert(clean.length === 7 && clean[0].date === d(-2) && clean[6].date === d(4), 'one cell per day from day 1');
  assert(clean[0].state === 'both' && clean[1].state === 'both', 'both done');
  assert(clean[2].state === 'open' && clean[2].isToday, 'today open');
  assert(clean[3].state === 'future', 'still to come');
  assert(pactCanStillFinish(clean), 'nothing missed: can finish');

  // Partner missed yesterday: the day is lost (they can't tick a past day).
  const partnerMissed = pactDayCells({ ...base, user1DoneDates: [d(-2), d(-1)], user2DoneDates: [d(-2)] }, true, TODAY, TODAY);
  assert(partnerMissed[1].state === 'one' && partnerMissed[1].lost && partnerMissed[1].mine, 'one of you, lost');
  assert(!pactCanStillFinish(partnerMissed), "a missed day: can't finish (Start again from today)");

  // I missed yesterday (slip or no log look the same): missed.
  const iMissed = pactDayCells({ ...base, user1DoneDates: [d(-2)], user2DoneDates: [d(-2)] }, true, TODAY, TODAY);
  assert(iMissed[1].state === 'missed' && !pactCanStillFinish(iMissed), 'nobody ticked yesterday: missed');

  // The partner is a day behind (their today is my yesterday): my yesterday is still open for them.
  const behind = pactDayCells({ ...base, user1DoneDates: [d(-2), d(-1)], user2DoneDates: [d(-2)] }, true, TODAY, d(-1));
  assert(behind[1].state === 'one' && !behind[1].lost && pactCanStillFinish(behind), "partner's day still open: not lost yet");

  // Seen from the other side (user2), cells read user2's dates as "mine".
  const fromUser2 = pactDayCells({ ...base, user1DoneDates: [d(-2), d(-1)], user2DoneDates: [d(-2)] }, false, TODAY, TODAY);
  assert(fromUser2[1].theirs && !fromUser2[1].mine && fromUser2[1].lost, 'user2 view');

  // Started today: day 1 open, nothing lost.
  const fresh = pactDayCells(resist('c2', 'Doomscrolling', { durationDays: 30 }), true, TODAY, TODAY);
  assert(fresh.length === 30 && fresh[0].isToday && pactCanStillFinish(fresh), 'fresh 30-day challenge');
  console.log('day chain fixtures passed');
}
