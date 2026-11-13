// Hook test (real useAppState + the real useDiscoverPlans + in-process fake Supabase, see harness/):
// Discover's public plans and pull-to-refresh.
//   DR1 refreshNow (pull-to-refresh) refetches the public plans: a plan another member shared since
//       shows; the list stays on screen while the refetch runs (no skeleton, no error), and a pull
//       whose refetch fails keeps the list.
import { bootHook, story, until, quiet, eq, assert, pass, fake, server, UID } from './harness/bootHook';
import { doc } from './harness/dom';

const OTHER = '33333333-3333-4333-8333-333333333333';
const at = '2026-11-02T05:00:00.000Z';
const publicPlan = (id: string, title: string) => ({
  id, creator_id: OTHER, creator_username: 'other', title, description: '', category: 'Personal Growth',
  is_public: true, copy_count: 0, created_at: at, steps: { planType: 'milestone', items: [] },
});

await story('discoverRefresh.hook (Discover refresh)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)' });
  server.g('improvement_plans').push(publicPlan('66666666-6666-4666-8666-666666666661', 'First shared plan'));
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');

  // The Plans page's Discover hook, mounted next to the store.
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { useDiscoverPlans } = await import('../../components/plans/useDiscoverPlans');
  let discover: ReturnType<typeof useDiscoverPlans> | null = null;
  const seen: string[] = []; // every status + list size the page rendered
  function Discover() {
    discover = useDiscoverPlans(h.s(), true);
    const mark = `${discover.status}:${discover.plans.length}`;
    if (seen[seen.length - 1] !== mark) seen.push(mark);
    return null;
  }
  createRoot((doc.createElement as () => Element)()).render(React.createElement(Discover));
  const d = () => discover!;
  await until(() => discover?.status === 'ready' && discover.plans.length === 1, 'Discover loaded');
  await quiet(1500);

  // DR1: another member shares a plan (no realtime event reaches this device); the user pulls.
  server.g('improvement_plans').push(publicPlan('66666666-6666-4666-8666-666666666662', 'Second shared plan'));
  fake.resetCounts();
  seen.length = 0;
  await h.s().refreshNow();
  await until(() => d().plans.length === 2, 'DR1: the new public plan shows after the pull', 5000);
  assert(fake.requests({ table: 'improvement_plans', method: 'GET' }).some((r) => /is_public=eq\.true/.test(r.search)), 'DR1: public plans read again');
  eq(d().plans.map((p) => p.title).sort(), ['First shared plan', 'Second shared plan'], 'DR1: both plans listed');
  assert(seen.every((m) => m.startsWith('ready:')), `DR1: list stayed on screen during the refetch (saw ${seen.join(', ')})`);
  // A pull whose refetch fails keeps the list on screen.
  fake.fail('improvement_plans', 500, ['GET']);
  fake.resetCounts();
  await h.s().refreshNow();
  await until(() => fake.requests({ table: 'improvement_plans', method: 'GET' }).some((r) => /is_public=eq\.true/.test(r.search)), 'DR1: failing refetch tried');
  await quiet(500);
  eq(`${d().status}:${d().plans.length}`, 'ready:2', 'DR1: a failed pull keeps the list');
  fake.unfail('improvement_plans');
  pass('DR1 pull-to-refresh refetches Discover; the list stays while it loads and when it fails');
}, 60_000);
