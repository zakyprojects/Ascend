// Pull-to-refresh rules (lib/ui/pullRefresh.ts): when a pull may start, which moves become a pull
// and which give way (scroll, sideways swipe, long press), the threshold and how long the loader shows.
import {
  createPull,
  pullMayStart,
  pullOffset,
  settleRefresh,
  PULL_THRESHOLD_PX,
  PULL_FOLLOW_RATE,
  PULL_OVERSHOOT_PX,
  type PullStartContext,
} from '../pullRefresh';
import { startsInsideOwnPull } from '../gestures';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// --- pullMayStart --------------------------------------------------------------------------
const ok: PullStartContext = {
  touches: 1,
  coarsePointer: true,
  active: true,
  busy: false,
  scrollTop: 0,
  zoomed: false,
  nearEdge: false,
  ownGesture: false,
  overlayOpen: false,
  textSelected: false,
};
assert(pullMayStart(ok), 'one finger at the top of the page on a touch screen');
assert(pullMayStart({ ...ok, scrollTop: -4 }), 'iOS rubber band (negative scroll) still counts as the top');
const blocked: [Partial<PullStartContext>, string][] = [
  [{ touches: 2 }, 'two fingers'],
  [{ coarsePointer: false }, 'mouse / trackpad'],
  [{ active: false }, 'signed out'],
  [{ busy: true }, 'a refresh is already running'],
  [{ scrollTop: 1 }, 'scrolled down even a little'],
  [{ zoomed: true }, 'zoomed in'],
  [{ nearEdge: true }, 'from the screen edge (system back)'],
  [{ ownGesture: true }, 'on a reorder list, swipe row, chart, field or inner scroller'],
  [{ overlayOpen: true }, 'a dialog, sheet or the notification list is open'],
  [{ textSelected: true }, 'text selected'],
];
for (const [change, why] of blocked) assert(!pullMayStart({ ...ok, ...change }), `no pull: ${why}`);

// --- pullOffset ----------------------------------------------------------------------------
assert(pullOffset(-30) === 0, 'finger above the start: no travel');
assert(pullOffset(40) === 40 * PULL_FOLLOW_RATE, 'follows the finger at half speed');
assert(pullOffset(PULL_THRESHOLD_PX / PULL_FOLLOW_RATE) === PULL_THRESHOLD_PX, 'reaches the threshold exactly');
{
  const far = pullOffset(2000);
  assert(far > PULL_THRESHOLD_PX && far < PULL_THRESHOLD_PX + PULL_OVERSHOOT_PX, 'past the threshold it resists and tops out');
  assert(pullOffset(300) < pullOffset(400), 'still moves a little past the threshold');
}

// --- createPull ----------------------------------------------------------------------------
const toThreshold = PULL_THRESHOLD_PX / PULL_FOLLOW_RATE; // finger travel that arms
{
  const p = createPull(100, 100, 0);
  assert(p.move(102, 105, 10, 0).kind === 'wait', 'under the slop: still a tap');
  const first = p.move(104, 140, 20, 0);
  assert(first.kind === 'pull' && !first.armed, 'straight down past the slop: a pull, not armed yet');
  assert(p.locked, 'locked once it is a pull');
  const armed = p.move(104, 100 + toThreshold + 2, 30, 0);
  assert(armed.kind === 'pull' && armed.armed && armed.armedNow, 'past the threshold: armed (buzz once)');
  const again = p.move(104, 100 + toThreshold + 20, 40, 0);
  assert(again.kind === 'pull' && again.armed && !again.armedNow, 'further down: still armed, no second buzz');
  assert(p.end(), 'letting go armed: refresh');
  assert(p.move(104, 400, 50, 0).kind === 'cancel', 'ended pull takes no more moves');
}
{
  const p = createPull(100, 100, 0);
  p.move(100, 100 + toThreshold + 10, 20, 0);
  const back = p.move(100, 130, 30, 0);
  assert(back.kind === 'pull' && !back.armed, 'moving back up under the threshold disarms');
  assert(!p.end(), 'letting go under the threshold: no refresh');
}
{
  const p = createPull(100, 100, 0);
  p.move(100, 100 + toThreshold + 10, 20, 0);
  const back = p.move(100, 130, 30, 0);
  const rearm = p.move(100, 100 + toThreshold + 10, 40, 0);
  assert(back.kind === 'pull' && rearm.kind === 'pull' && rearm.armedNow, 'disarm then arm again buzzes again');
  assert(p.end(), 'armed again at the end: refresh');
}
{
  const p = createPull(100, 100, 0);
  assert(p.move(100, 80, 20, 0).kind === 'cancel', 'finger moves up: a scroll, not a pull');
  assert(!p.end(), 'cancelled pull never refreshes');
}
{
  const p = createPull(100, 100, 0);
  assert(p.move(140, 110, 20, 0).kind === 'cancel', 'sideways: the tab/page swipe takes it');
  assert(!p.locked, 'sideways never locks the pull');
}
{
  // Diagonal band: down 30, sideways 20 → 30 <= 20 × 1.7, neither a pull nor (useTabSwipe) a swipe.
  const p = createPull(100, 100, 0);
  assert(p.move(120, 130, 20, 0).kind === 'cancel', 'diagonal: not a pull');
  const steep = createPull(100, 100, 0);
  assert(steep.move(110, 130, 20, 0).kind === 'pull', 'down 30, sideways 10: a pull');
}
{
  const p = createPull(100, 100, 0);
  assert(p.move(100, 140, 600, 0).kind === 'cancel', 'a finger that rested 500 ms first is a long press');
}
{
  const p = createPull(100, 100, 0);
  p.move(100, 140, 20, 0);
  assert(p.move(100, 100 + toThreshold + 10, 30, 12).kind === 'cancel', 'the page scrolled after all: the scroll wins');
  assert(!p.end(), 'and it does not refresh');
}

// --- startsInsideOwnPull (lib/gestures) ---------------------------------------------------
{
  // Minimal elements: attribute names, a parent and a scroll position.
  type El = { attrs: string[]; tag: string; scrollTop: number; parentElement: El | null; matches: (sel: string) => boolean };
  const el = (parent: El | null, { attrs = [] as string[], tag = 'div', scrollTop = 0 } = {}): El => ({
    attrs,
    tag,
    scrollTop,
    parentElement: parent,
    matches(sel: string) {
      return sel.split(',').some((part) => {
        const s = part.trim();
        if (s === tag) return true;
        const attr = /^\[([a-z-]+)\]$/.exec(s)?.[1];
        return !!attr && attrs.includes(attr);
      });
    },
  });
  const own = (target: El, root: El) => startsInsideOwnPull(target as unknown as Element, root as unknown as Element);
  const root = el(null, { attrs: ['data-tab-swipe'] });
  const card = el(root);
  assert(!own(el(card), root), 'plain page content (inside main, itself a swipe root): pull allowed');
  assert(!own(el(el(root, { attrs: ['role'] })), root), 'other attributes do not block');
  for (const attr of ['data-no-swipe', 'data-no-pull']) {
    assert(own(el(el(card, { attrs: [attr] })), root), `inside [${attr}] (reorder list, swipe row, chart, Select): no pull`);
  }
  for (const tag of ['input', 'textarea', 'select']) assert(own(el(card, { tag }), root), `on a ${tag}: no pull`);
  assert(own(el(el(card, { scrollTop: 40 })), root), 'inside a list scrolled away from its top: that list scrolls');
  assert(!own(el(el(card, { scrollTop: 0 })), root), 'inside a list at its top: pull allowed');
  assert(!own(root, root), 'the root itself never blocks');
}

// --- settleRefresh -------------------------------------------------------------------------
{
  // A fake clock: wait(ms) resolves when the test advances time past it.
  let now = 0;
  const timers: { at: number; resolve: () => void }[] = [];
  const wait = (ms: number) => new Promise<void>((resolve) => timers.push({ at: now + ms, resolve }));
  const advance = async (to: number) => {
    now = to;
    for (const t of timers.filter((x) => x.at <= now)) t.resolve();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  const track = (p: Promise<void>) => {
    const s = { done: false };
    void p.then(() => (s.done = true));
    return s;
  };

  // Fast work: the loader still shows for the minimum.
  const fast = track(settleRefresh(Promise.resolve(), wait, 600, 10_000));
  await advance(100);
  assert(!fast.done, 'fast refresh: loader stays for the minimum');
  await advance(600);
  assert(fast.done, 'fast refresh: loader goes at 600 ms');

  // Hanging work: the loader goes at the maximum.
  now = 0;
  timers.length = 0;
  const hang = track(settleRefresh(new Promise(() => {}), wait, 600, 10_000));
  await advance(9_000);
  assert(!hang.done, 'slow refresh: loader stays while it runs');
  await advance(10_000);
  assert(hang.done, 'slow refresh: loader goes quietly at 10 s');

  // Failing work: settles, never rejects.
  now = 0;
  timers.length = 0;
  let rejected = false;
  const failing = settleRefresh(Promise.reject(new Error('net')), wait, 600, 10_000).catch(() => (rejected = true));
  await advance(600);
  await failing;
  assert(!rejected, 'a failed refresh never rejects (no error toast)');
}

console.log('pullRefresh: all assertions passed');
