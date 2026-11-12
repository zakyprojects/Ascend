// Work that reads what a setState updater decided (useAppState's afterCommit queue, 2026-11-10).
// React 18 runs most updaters during the next render, not inside the setState call, so a value
// assigned in the updater and read on the next line is still empty. This renders the REAL hook
// (no Supabase env = local mode, no network) and checks that the follow-up work still happens:
// a pact-linked habit sends its pact tick on every tap, and plan create/update broadcast + sync.
// Node has no DOM: the few browser objects the hook and react-dom touch are small stand-ins.

import { doc, win } from './harness/dom';

const { todayKey } = await import('../time/dates');
const TODAY = todayKey();
const CREATED = '2026-11-10T10:00:00.000Z';
const partnership = { id: 'p1', user1Id: 'u1', user2Id: 'u2', user1Username: 'me', user2Username: 'pal', status: 'active', createdAt: CREATED };
// Guest state with a partner and a running pact whose user1 side targets the habit "Read".
(win.localStorage as Storage).setItem(
  'ascend_guest_state_v2',
  JSON.stringify({
    habits: [],
    currentUser: { id: 'u1', username: 'me', email: 'me@x.test', name: 'me' },
    username: 'me',
    partnership,
    partnerships: [partnership],
    sharedChallenges: [
      {
        id: 'c1', partnershipId: 'p1', title: 'Read', targetHabitName: 'Read', user1Target: 'Read', user2Target: 'Read',
        jointStreak: 0, user1Category: 'habit', user2Category: 'habit', status: 'active', startDate: TODAY,
        endDate: '2099-01-01', durationDays: 30, user1DoneDates: [], user2DoneDates: [], totalCompleted: 0, createdAt: CREATED,
      },
    ],
  })
);

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { useAppState } = await import('../store/store');
const { syncBroadcaster } = await import('../auth/supabase');
type Store = ReturnType<typeof useAppState>;

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const events: string[] = [];
const broadcast = syncBroadcaster.broadcast.bind(syncBroadcaster);
syncBroadcaster.broadcast = ((type: string, payload: unknown) => {
  events.push(type);
  return (broadcast as (t: string, p: unknown) => unknown)(type, payload);
}) as typeof syncBroadcaster.broadcast;
const count = (type: string) => events.filter((e) => e === type).length;

async function run(strict: boolean) {
  let store: Store | null = null;
  function App() {
    store = useAppState();
    return null;
  }
  const s = () => store!;
  const container = (doc.createElement as () => unknown)() as Element;
  const root = createRoot(container);
  const app = React.createElement(App);
  root.render(strict ? React.createElement(React.StrictMode, null, app) : app);
  await wait(300);
  const label = strict ? 'StrictMode' : 'normal';
  eq(s().state.sharedChallenges?.length, 1, `${label}: seeded pact loaded`);

  // 1. Six taps on a habit linked to the pact: one pact send per tap, the local pact follows.
  if (!s().state.habits.some((h) => h.name === 'Read')) s().addCustomHabit('Read', 'daily');
  await wait(200);
  const habitId = s().state.habits.find((h) => h.name === 'Read')!.id;
  const pactDone = () => (s().state.sharedChallenges?.find((c) => c.id === 'c1')?.user1DoneDates || []).includes(TODAY);
  for (let tap = 1; tap <= 6; tap++) {
    const before = count('CHALLENGE_UPDATED');
    const wasDone = pactDone();
    s().toggleHabit(habitId);
    await wait(200);
    eq(count('CHALLENGE_UPDATED') - before, 1, `${label}: tap ${tap} sends exactly one pact tick`);
    eq(pactDone(), !wasDone, `${label}: tap ${tap} flips the local pact tick`);
  }

  // 2. A new plan is broadcast and its save starts (local mode: the save returns nothing → failed).
  events.length = 0;
  s().createImprovementPlan(`Run 100 km ${label}`, 'd', false, [], 'Health', 'target_goal', { targetValue: 100, targetUnit: 'km', currentProgress: 0 });
  await wait(300);
  const plan = s().state.improvementPlans.find((p) => p.title === `Run 100 km ${label}`)!;
  assert(!!plan, `${label}: plan created`);
  eq(count('PLAN_CREATED'), 1, `${label}: PLAN_CREATED sent once`);
  assert(plan.syncStatus !== 'pending', `${label}: the plan's save ran (status ${plan.syncStatus})`);

  // 3. Target progress updates are broadcast and saved, once each.
  for (const value of [10, 25]) {
    events.length = 0;
    s().updateTargetGoalProgress(plan.id, value);
    await wait(300);
    const p = s().state.improvementPlans.find((x) => x.id === plan.id)!;
    eq(p.currentProgress, value, `${label}: progress ${value} in state`);
    eq(count('PLAN_UPDATED'), 1, `${label}: progress ${value} sends PLAN_UPDATED once`);
  }
  root.unmount();
}

await run(false);
await run(true);
console.log('store afterCommit: pact ticks 6/6 and plan create/update sync, normal + StrictMode: OK');
// The hook keeps timers and channels open; end the run once the checks passed.
(globalThis as unknown as { process: { exit: (code: number) => never } }).process.exit(0);
