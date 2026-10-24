import type { Habit, SharedChallenge } from '@/types';
import { pactHabitToAdd } from '../pactLifecycle';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const TODAY = '2026-10-24';

function habit(id: string, name: string, extra: Partial<Habit> = {}): Habit {
  return {
    id,
    name,
    frequency: 'daily',
    points: 1,
    isPreset: false,
    createdAt: 'Sat 2026-10-24 5:00 AM PKT (UTC+05:00)',
    createdAtPeriod: '2026-10-24',
    completions: {},
    ...extra,
  };
}

function pact(user1Target: string, user2Target: string, extra: Partial<SharedChallenge> = {}): SharedChallenge {
  return {
    id: 'c1',
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
    createdAt: 'Sat 2026-10-24 9:00 AM PKT (UTC+05:00)',
    ...extra,
  };
}

// A free custom name: added as a daily custom habit, with the goal's exact text (spaces tidied).
{
  const add = pactHabitToAdd(pact('  Call  my mom ', 'Run'), true, [], TODAY);
  assert(add?.kind === 'custom' && add.name === 'Call my mom', 'custom habit with the goal name');
  const theirs = pactHabitToAdd(pact('Call my mom', 'Run 5k'), false, [], TODAY);
  assert(theirs?.kind === 'custom' && theirs.name === 'Run 5k', 'user2 reads their own side');
}

// A Library name is added as that preset (it earns the preset's points, as from the Library).
{
  const add = pactHabitToAdd(pact('morning walk', 'x'), true, [], TODAY);
  assert(add?.kind === 'preset' && add.preset.name === 'Morning walk', 'preset by the same-name rule');
}

// The Reading habit's name turns on the Reading habit, unless one is already on.
{
  const add = pactHabitToAdd(pact('Reading (Books)', 'x'), true, [], TODAY);
  assert(add?.kind === 'reading', 'reading habit');
  const renamed = habit('r', 'My reading', { linkedModule: 'reading' });
  assert(pactHabitToAdd(pact('Reading (Books)', 'x'), true, [renamed], TODAY) === null, 'Reading habit already on');
}

// Nothing offered: name taken (any frequency, any case), linked, finished, not a habit goal, ticked today.
{
  assert(pactHabitToAdd(pact('Run', 'x'), true, [habit('h', 'run')], TODAY) === null, 'daily habit with the name (linked)');
  assert(
    pactHabitToAdd(pact('Run', 'x'), true, [habit('h', 'Run', { frequency: 'weekly' })], TODAY) === null,
    'a weekly habit holds the name'
  );
  assert(pactHabitToAdd(pact('Run', 'x', { status: 'completed' }), true, [], TODAY) === null, 'finished pact');
  assert(pactHabitToAdd(pact('Run', 'x', { status: 'expired' }), true, [], TODAY) === null, 'expired pact');
  assert(pactHabitToAdd(pact('Run', 'x', { user1Category: 'reading' }), true, [], TODAY) === null, 'not a habit goal');
  assert(pactHabitToAdd(pact('   ', 'x'), true, [], TODAY) === null, 'empty goal');
  assert(
    pactHabitToAdd(pact('Run', 'x', { user1DoneDates: [TODAY] }), true, [], TODAY) === null,
    'ticked today: the new habit would take the tick back'
  );
  assert(
    pactHabitToAdd(pact('Run', 'x', { user1DoneDates: ['2026-10-23'] }), true, [], TODAY)?.kind === 'custom',
    'ticked yesterday only: offered'
  );
}

console.log('pactHabitAdd fixtures: all passed');
