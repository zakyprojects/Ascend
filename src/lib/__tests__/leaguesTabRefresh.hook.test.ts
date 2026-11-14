// Hook test (real useAppState + the real Leagues page + in-process fake Supabase, see harness/):
// switching the Leagues period sub-tab (Weekly / Monthly / Season, by tab or by swipe) refreshes
// other members' standings through the same throttled refresh as mount and the minute poll.
//   LT1 a tab switch 15 s or more after the last refresh sends one points-only request; the rows stay
//       on screen while it runs (no skeleton) and the new points replace them in place.
//   LT2 a swipe (TabPanel) refreshes the same way; switches within 15 s of a refresh send nothing,
//       and any number of quick switches while one runs share that one request.
//   LT3 offline a switch sends nothing and marks the rows "Couldn't refresh"; back online it clears.
import { bootHook, story, until, assert, eq, pass, fake, server, setOnline, quiet, UID } from './harness/bootHook';
import { doc } from './harness/dom';
import { getMonthPeriodId, getWeekPeriodId, leagueNow } from '../time/leagueTime';

// The page renders real elements: a few more browser stand-ins than the store hook needs.
const d = doc as Record<string, unknown>;
const baseElement = d.createElement as () => Record<string, unknown>;
const element = () => {
  const el = baseElement();
  Object.assign(el, {
    appendChild: (child: Record<string, unknown>) => ((child.parentNode = el), child),
    insertBefore: (child: unknown) => child,
    getClientRects: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
  });
  return el;
};
d.createElement = element;
d.createElementNS = element;
d.createTextNode = (text: string) => ({ nodeType: 3, nodeValue: text });
const g = globalThis as Record<string, unknown>;
g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };

// The league clock runs on performance.now() once the server time is in: moving it on is how the
// test passes the store's 15 s refresh throttle without waiting for it.
const realPerfNow = performance.now.bind(performance);
let skippedMs = 0;
performance.now = () => realPerfNow() + skippedMs;
const skip = (ms: number) => void (skippedMs += ms);

const OTHER = '22222222-2222-4222-8222-222222222222';
// Points count only under the current week's and month's ids, as the server sends them.
const boards = (pts: number) => ({
  weekly: { period_id: getWeekPeriodId(leagueNow()), points: [[OTHER, pts]] },
  monthly: { period_id: getMonthPeriodId(leagueNow()), points: [[OTHER, pts + 1]] },
  ninetyDay: { points: [[OTHER, pts + 2]] },
  members: [{ id: UID, username: 'hooktester', avatar: '🧑' }, { id: OTHER, username: 'rival', avatar: '🧑' }],
});

await story('leaguesTabRefresh.hook (Leagues sub-tab switch refreshes standings)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)' });
  fake.leagueBoards = boards(100);
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Leagues } = await import('../../components/views/Leagues');
  const { Tabs, TabPanel, Skeleton } = await import('../../components/ui/primitives');
  const container = element();
  const page = createRoot(container as unknown as Element);
  const h = await bootHook({
    as: 'signedIn',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    use: (store: any) => React.useEffect(() => page.render(React.createElement(Leagues, { store }))),
  });
  await until(h.loaded, 'signed-in boot loaded');

  // The rendered page's components, read from React's tree (no real DOM to click in Node).
  type Fiber = { type: unknown; memoizedProps: Record<string, unknown>; child: Fiber | null; sibling: Fiber | null };
  const fibers = (type: unknown) => {
    const key = Object.keys(container).find((k) => k.startsWith('__reactContainer$'));
    const found: Fiber[] = [];
    const walk = (f: Fiber | null) => {
      for (; f; f = f.sibling) {
        if (f.type === type) found.push(f);
        walk(f.child);
      }
    };
    walk(key ? (container[key] as Fiber) : null);
    return found;
  };
  const tabs = () => fibers(Tabs)[0].memoizedProps as { value: string; onChange: (id: string) => void };
  const panel = () => fibers(TabPanel)[0].memoizedProps as { value: string; onChange: (id: string) => void };
  const skeletons = () => fibers(Skeleton).length;
  const rival = (type: 'weekly' | 'monthly' | 'ninetyDay') =>
    h.s().getLeagueData(type).competitors.find((c) => c.id === OTHER)?.points;
  const boardCalls = () => fake.requests({ table: 'rpc/ascend_league_boards' });

  await until(() => h.s().getLeagueStandingsStatus() === 'ready' && rival('weekly') === 100, 'standings loaded');
  await until(() => fibers(Tabs).length === 1 && fibers(TabPanel).length === 1, 'Leagues page rendered');
  await quiet(500);
  eq(skeletons(), 0, 'loaded table has no skeleton rows');

  // LT1: the server has newer points; past the throttle, the user taps Monthly.
  fake.leagueBoards = boards(150);
  skip(16_000);
  fake.resetCounts();
  const held = fake.hold((r) => r.table === 'rpc/ascend_league_boards');
  tabs().onChange('monthly');
  await until(() => held.hits === 1, 'LT1: the tab switch sent a standings request');
  eq(panel().value, 'monthly', 'LT1: Monthly shown');
  eq(boardCalls().length, 1, 'LT1: one request');
  assert(boardCalls()[0].body?.p_slim === true, 'LT1: points-only (slim) request, not the full member list');
  eq([h.s().getLeagueStandingsStatus(), skeletons(), rival('monthly')], ['ready', 0, 101], 'LT1: old rows stay on screen while it runs');
  held.release();
  await until(() => rival('monthly') === 151, 'LT1: new monthly points in place');
  eq([rival('weekly'), rival('ninetyDay')], [150, 152], 'LT1: week and season moved with it');
  eq([skeletons(), boardCalls().length], [0, 1], 'LT1: no skeleton, still one request');
  pass('LT1 a tab switch after 15 s refreshes once (slim); rows stay and update in place');

  // LT2: switches right after a refresh send nothing.
  for (const id of ['ninetyDay', 'weekly', 'monthly', 'ninetyDay', 'weekly']) tabs().onChange(id);
  panel().onChange('monthly');
  await quiet(1500);
  eq(boardCalls().length, 1, 'LT2: switches within 15 s of a refresh send no request');
  // Past the throttle, a swipe refreshes; quick switches while it runs share that request.
  fake.leagueBoards = boards(180);
  skip(16_000);
  const held2 = fake.hold((r) => r.table === 'rpc/ascend_league_boards');
  panel().onChange('ninetyDay');
  await until(() => held2.hits === 1, 'LT2: the swipe sent a standings request');
  for (const id of ['weekly', 'monthly', 'ninetyDay', 'weekly', 'monthly', 'ninetyDay', 'weekly', 'monthly', 'ninetyDay']) {
    if (id === 'monthly') panel().onChange(id);
    else tabs().onChange(id);
  }
  await quiet(500);
  held2.release();
  await until(() => rival('ninetyDay') === 182, 'LT2: new season points in place');
  await quiet(1500);
  eq([boardCalls().length, panel().value, skeletons()], [2, 'ninetyDay', 0], 'LT2: ten quick switches = one more request');
  pass('LT2 swipe refreshes too; switches inside 15 s or during a refresh add no request');

  // LT3: offline.
  fake.leagueBoards = boards(200);
  skip(16_000);
  setOnline(false);
  await quiet(500);
  assert(!h.s().isLeagueStandingsStale(), 'LT3: going offline alone does not mark the rows');
  tabs().onChange('weekly');
  await until(() => h.s().isLeagueStandingsStale(), 'LT3: offline switch marks the rows stale');
  await quiet(1500);
  eq([boardCalls().length, h.s().getLeagueStandingsStatus(), rival('weekly'), skeletons()], [2, 'ready', 180, 0], 'LT3: offline sends nothing, rows stay');
  setOnline(true);
  await until(() => !h.s().isLeagueStandingsStale() && rival('weekly') === 200, 'LT3: back online the refresh clears it');
  pass('LT3 offline switch sends nothing and shows Couldn\'t refresh; back online it clears');
}, 90_000);
