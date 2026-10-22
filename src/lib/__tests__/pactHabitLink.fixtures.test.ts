import type { Habit, SharedChallenge } from '@/types';
import {
  habitDoneOn,
  habitForPactGoal,
  linkedHabitFor,
  pactSideDoneOn,
  planLinkedPactRepairs,
  type LinkedPactReconcileInput,
} from '../pactLifecycle';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const TODAY = '2026-10-22';

function habit(id: string, name: string, extra: Partial<Habit> = {}): Habit {
  return {
    id,
    name,
    frequency: 'daily',
    points: 1,
    isPreset: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    createdAtPeriod: '2026-10-01',
    completions: {},
    ...extra,
  };
}

const doneToday = { [TODAY]: { done: true, updatedAt: '2026-10-22T05:00:00.000Z' } };

function pact(id: string, user1Target: string, user2Target: string, extra: Partial<SharedChallenge> = {}): SharedChallenge {
  return {
    id,
    partnershipId: 'p1',
    title: user1Target,
    targetHabitName: user1Target,
    durationDays: 14,
    jointStreak: 0,
    user1Category: 'habit',
    user1Target,
    user2Category: 'habit',
    user2Target,
    user1DoneDates: [],
    user2DoneDates: [],
    status: 'active',
    createdAt: '2026-10-22T04:00:00.000Z',
    ...extra,
  };
}

function plan(overrides: Partial<LinkedPactReconcileInput>) {
  return planLinkedPactRepairs({
    challenges: [],
    habits: [],
    sideOf: () => true,
    today: TODAY,
    isBusy: () => false,
    divergedBefore: new Set(),
    attemptedOn: new Map(),
    retry: new Set(),
    ...overrides,
  });
}

function runFixtures() {
  // The one name rule: trimmed, inner spaces collapsed, any case.
  const steps = habit('h1', '10,000 steps');
  assert(habitForPactGoal('  10,000   STEPS ', [steps])?.id === 'h1', 'case and spaces match');
  assert(habitForPactGoal('10,000 step', [steps]) === null, 'a different name does not match');
  assert(habitForPactGoal('', [steps]) === null, 'empty goal links nothing');
  assert(habitForPactGoal('Gym', [habit('w', 'Gym', { frequency: 'weekly' })]) === null, 'weekly habits do not link');
  assert(
    habitForPactGoal('Reading (Books)', [habit('r', 'Reading (Books)', { linkedModule: 'reading', isSystemLinked: true })]) === null,
    'the Reading habit does not link'
  );

  // Each side reads its own goal; a side whose category is not 'habit' links nothing.
  const p = pact('c1', '10,000 steps', 'Read 20 pages');
  assert(linkedHabitFor(p, true, [steps])?.id === 'h1', 'user1 side links');
  assert(linkedHabitFor(p, false, [steps]) === null, 'user2 side has another goal');
  assert(linkedHabitFor({ ...p, user1Category: 'custom' as SharedChallenge['user1Category'] }, true, [steps]) === null, 'non-habit category');
  assert(linkedHabitFor({ ...p, user1Target: '' }, true, [steps])?.id === 'h1', 'empty target falls back to targetHabitName');

  assert(habitDoneOn({ ...steps, completions: doneToday }, TODAY), 'done today');
  assert(!habitDoneOn({ ...steps, completions: { [TODAY]: { done: false, updatedAt: 'x' } } }, TODAY), 'untick tombstone');
  assert(habitDoneOn({ ...steps, completions: [TODAY] as unknown as Habit['completions'] }, TODAY), 'legacy array completions');
  assert(pactSideDoneOn({ ...p, user1DoneDates: [TODAY] }, true, TODAY), 'pact side done');
  assert(!pactSideDoneOn({ ...p, user1DoneDates: [TODAY] }, false, TODAY), 'other side not done');

  const ticked = { ...steps, completions: doneToday };

  // First pass that sees a difference only remembers it (a habit change may still be on its way).
  const first = plan({ challenges: [p], habits: [ticked] });
  assert(first.repairs.length === 0 && first.diverged.has('c1'), 'first sighting waits');

  // Second pass in a row repairs it, toward the habit's state.
  const second = plan({ challenges: [p], habits: [ticked], divergedBefore: first.diverged });
  assert(second.repairs.length === 1 && second.repairs[0].done === true && !second.repairs[0].isRetry, 'second sighting repairs');

  // Once per pact per day.
  const again = plan({ challenges: [p], habits: [ticked], divergedBefore: first.diverged, attemptedOn: new Map([['c1', TODAY]]) });
  assert(again.repairs.length === 0 && again.diverged.has('c1'), 'no second repair the same day');
  const nextDay = plan({ challenges: [p], habits: [ticked], divergedBefore: first.diverged, attemptedOn: new Map([['c1', '2026-10-21']]) });
  assert(nextDay.repairs.length === 1, "yesterday's attempt does not block today");

  // In step: nothing to do, and the remembered difference is dropped.
  const inStep = plan({ challenges: [{ ...p, user1DoneDates: [TODAY] }], habits: [ticked], divergedBefore: first.diverged });
  assert(inStep.repairs.length === 0 && inStep.diverged.size === 0, 'in step');

  // Habit unticked, pact ticked: the pact follows (untick).
  const untick = plan({ challenges: [{ ...p, user1DoneDates: [TODAY] }], habits: [steps], divergedBefore: new Set(['c1']) });
  assert(untick.repairs.length === 1 && untick.repairs[0].done === false, 'untick follows the habit');

  // Finished pacts, busy pacts, unknown partnerships and unlinked pacts are left alone.
  for (const status of ['completed', 'expired'] as const) {
    const finished = plan({ challenges: [{ ...p, status }], habits: [ticked], divergedBefore: new Set(['c1']) });
    assert(finished.repairs.length === 0 && finished.diverged.size === 0, `${status} pact untouched`);
  }
  assert(plan({ challenges: [p], habits: [ticked], divergedBefore: new Set(['c1']), isBusy: () => true }).repairs.length === 0, 'busy pact waits');
  assert(plan({ challenges: [p], habits: [ticked], divergedBefore: new Set(['c1']), sideOf: () => null }).repairs.length === 0, 'unknown side');
  assert(plan({ challenges: [p], habits: [], divergedBefore: new Set(['c1']) }).repairs.length === 0, 'no habit, no link');

  // A failed save is resent at once, even in step and after the day's attempt.
  const retry = plan({
    challenges: [{ ...p, user1DoneDates: [TODAY] }],
    habits: [ticked],
    attemptedOn: new Map([['c1', TODAY]]),
    retry: new Set(['c1']),
  });
  assert(retry.repairs.length === 1 && retry.repairs[0].isRetry && retry.repairs[0].done, 'retry resends the habit state');

  // The partner's side (user2) is planned from user2's goal.
  const partnerSide = plan({
    challenges: [pact('c2', 'Read 20 pages', '10,000 steps')],
    habits: [ticked],
    sideOf: () => false,
    divergedBefore: new Set(['c2']),
  });
  assert(partnerSide.repairs.length === 1 && partnerSide.repairs[0].isUser1 === false, 'user2 side repaired');

  console.log('pactHabitLink fixtures passed');
}

runFixtures();
