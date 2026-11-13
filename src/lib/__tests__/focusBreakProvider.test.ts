// Focus Break v2 (2026-11-13) through the REAL FocusSessionProvider, rendered in Node (no Supabase
// env = device-only mode, so every action stays in the queue for the server): Break after 25 focused
// min, no auto-resume at the break end (cue once, only when the app is open at that moment), Continue
// (button and notification), the 10-min grace deadline closing the session at the break start, the
// limits (max 2, not in the last 5 min, no break on short sessions).
import { win } from './harness/dom';
import type { AppStore } from '@/lib/store/store';

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { FocusSessionProvider, useFocusSession } = await import('../../components/pfc/FocusSessionProvider');
const S = await import('../focus/focusSession');
const { trustedNowMs } = await import('../time/clock');
type Ctx = import('../../components/pfc/FocusSessionProvider').FocusSessionContextValue;

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MIN = 60_000;
const UID = 'u-break';
const KEY = S.focusStorageKey(UID);

// The break-end cue follows the tick choice: 'vibration' here, so a recorded buzz proves it played.
localStorage.setItem('ascend_feedback_prefs', JSON.stringify({ tick: 'vibration', swipe: 'none', vibrationStrength: 'medium', soundVolume: 'soft' }));
const buzzes: unknown[] = [];
Object.defineProperty(globalThis.navigator, 'vibrate', { configurable: true, value: (p: unknown) => (buzzes.push(p), true) });

// The notification's Continue reaches the page as a service worker message (public/sw.js).
const swListeners = new Set<(e: { data: unknown }) => void>();
Object.defineProperty(globalThis.navigator, 'serviceWorker', {
  configurable: true,
  value: {
    addEventListener: (_t: string, fn: (e: { data: unknown }) => void) => void swListeners.add(fn),
    removeEventListener: (_t: string, fn: (e: { data: unknown }) => void) => void swListeners.delete(fn),
  },
});
const swPost = (data: unknown) => swListeners.forEach((fn) => fn({ data }));

const logs: Array<{ minutes: number; endedAtMs: number }> = [];
const store = {
  state: { currentUser: { id: UID }, focusLogs: [] },
  isAuthChecking: false,
  isSessionLoading: false,
  logFocusSession: (_task: string, minutes: number, _skill: unknown, _x: unknown, meta: { endedAtMs: number }) => {
    logs.push({ minutes, endedAtMs: meta.endedAtMs });
    return 'focus_log';
  },
} as unknown as AppStore;

let ctx: Ctx | null = null;
function Probe() {
  ctx = useFocusSession();
  return null;
}
createRoot((win.document as { createElement: () => Element }).createElement()).render(
  React.createElement(FocusSessionProvider, { store, onOpenFocus: () => undefined, children: React.createElement(Probe) })
);
await wait(100);
const c = () => ctx!;
const s = () => c().session;
const ops = () => S.readFocusOps(UID);
const lastOp = () => ops()[ops().length - 1];
/** Another tab (or the server) changed the stored session: write it and fire the storage event. */
const external = (next: import('../focus/focusSession').FocusSession) => {
  const value = JSON.stringify(next);
  localStorage.setItem(KEY, value);
  (win as unknown as { dispatchEvent: (e: unknown) => void }).dispatchEvent({ type: 'storage', key: KEY, newValue: value });
};

// 1. A break needs 25 focused minutes.
c().start({ taskName: 'Write', focusMinutes: 50, breakMinutes: 10, isCustom: false });
await wait(50);
assert(s()?.mode === 'focus' && !s()!.isPaused, 'started');
c().takeBreak(10);
await wait(50);
assert(!s()!.isPaused, 'break at minute 0 refused (under 25 focused)');
eq(ops().filter((o) => o.kind === 'break').length, 0, 'nothing queued');
// 26 focused minutes done.
external({ ...s()!, startTime: trustedNowMs() - 26 * MIN, startedAt: trustedNowMs() - 26 * MIN, plannedDurationSeconds: 50 * 60 });
await wait(50);
c().takeBreak(10);
await wait(50);
assert(S.onBreak(s()), 'on a break');
eq(s()!.breakCount, 1, 'break counted');
assert(Math.abs(s()!.pauseEndsAt! - s()!.pausedAt! - 10 * MIN) < 5, 'ends 10 min after it began');
const breakOp = lastOp() as { kind: string; minutes?: number };
eq(breakOp.kind, 'break', 'break queued for the server');
eq(breakOp.minutes, 10, 'queued with its length');
const leftAtBreak = s()!.pausedRemainingSeconds;

// 2. The break ends while the app is open in two tabs: cue once, but it stays paused (no auto-resume).
let tab2: Ctx | null = null;
function Probe2() {
  tab2 = useFocusSession();
  return null;
}
const root2 = createRoot((win.document as { createElement: () => Element }).createElement());
root2.render(React.createElement(FocusSessionProvider, { store, onOpenFocus: () => undefined, children: React.createElement(Probe2) }));
await wait(100);
const endsAt = trustedNowMs() + 300;
external({ ...s()!, pauseEndsAt: endsAt });
await wait(700);
assert(S.onBreak(tab2!.session), 'second tab follows the break');
root2.unmount();
await wait(50);
assert(S.onBreak(s()) && s()!.isPaused, 'still on the break after its end (waits for Continue)');
eq(s()!.pausedRemainingSeconds, leftAtBreak, 'focus frozen');
eq(buzzes.length, 1, 'break-over cue played once (app open, two tabs)');
eq(JSON.stringify(buzzes[0]), JSON.stringify([60, 80, 60]), 'cue pattern');
external({ ...s()! }); // another tab re-wrote the same session: no second cue
await wait(200);
eq(buzzes.length, 1, 'same break: no second cue');

// 3. Continue in the grace minutes: running from now, same focus left, queued as resume.
const before = trustedNowMs();
c().resume();
await wait(50);
assert(Boolean(s() && !s()!.isPaused && s()!.pauseEndsAt === undefined), 'Continue: running');
assert(s()!.startTime >= before, 'running from the Continue moment');
eq(s()!.plannedDurationSeconds, leftAtBreak, 'same focus left');
eq(lastOp().kind, 'resume', 'Continue queued as resume');

// 4. Second break; it ended 3 min ago while the app was closed: no cue, still paused.
c().takeBreak(5);
await wait(50);
eq(s()!.breakCount, 2, 'second break counted');
external({ ...s()!, pauseEndsAt: trustedNowMs() - 3 * MIN });
await wait(200);
assert(S.onBreak(s()), 'opened late (in the grace minutes): still paused');
eq(buzzes.length, 1, 'no cue for a break that ended while the app was closed');

// 5. Continue from the notification (service worker message), only for this session.
swPost({ type: 'ascend:focus-continue', sessionId: 'another' });
await wait(50);
assert(S.onBreak(s()), 'another session id: ignored');
swPost({ type: 'ascend:focus-continue', sessionId: s()!.id });
await wait(50);
assert(Boolean(s() && !s()!.isPaused), 'notification Continue: running');
eq(lastOp().kind, 'resume', 'queued as resume');

// 6. A third break is refused.
const opsBefore = ops().length;
c().takeBreak(5);
await wait(50);
assert(!s()!.isPaused, 'third break refused');
eq(ops().length, opsBefore, 'nothing queued');

// 7. Under 5 min of focus left: refused.
external({ ...s()!, breakCount: 0, startTime: trustedNowMs() - (s()!.plannedDurationSeconds - 4 * 60) * 1000 });
await wait(50);
c().takeBreak(5);
await wait(50);
assert(!s()!.isPaused, 'no break with 4 min left');

// 8. Not continued by break end + 10 min (app open): closed at the break START, focused minutes only.
const breakStart = trustedNowMs() - 20 * MIN;
external({
  ...s()!,
  isPaused: true,
  pausedAt: breakStart,
  pausedRemainingSeconds: 20 * 60, // 30 of 50 focused
  pauseEndsAt: breakStart + 10 * MIN, // deadline = now + 0
  breakCount: 1,
});
await wait(1500);
eq(s(), null, 'closed after the deadline');
eq(logs.length, 1, 'logged once');
eq(logs[0].minutes, 30, 'focused minutes only (break + grace not counted)');
eq(logs[0].endedAtMs, breakStart, 'ended at the break start');
const n = c().notice;
assert(n?.kind === 'expired' && n.saved && n.afterBreak === true && n.minutes === 30, 'notice: ended after the break');

// 9. Continue after the deadline does nothing but close it.
c().start({ taskName: 'Late', focusMinutes: 50, breakMinutes: 10, isCustom: false });
await wait(50);
const t = trustedNowMs();
const lateId = s()!.id;
external({ ...s()!, startedAt: t - 50 * MIN, isPaused: true, pausedAt: t - 26 * MIN, pausedRemainingSeconds: 20 * 60, pauseEndsAt: t - 16 * MIN - 1000, breakCount: 1 });
// (the deadline effect may already have closed it; Continue must never revive it)
c().resume();
await wait(100);
eq(s(), null, 'Continue after the deadline: closed, not resumed');
eq(ops().filter((o) => o.kind === 'resume' && o.sessionId === lateId).length, 0, 'no resume queued');
eq(logs.length, 2, 'it was logged by the close (30 focused min)');

// 10. A 25-min session (and up to 29) has no break.
c().start({ taskName: 'Short', focusMinutes: 29, breakMinutes: 5, isCustom: false });
await wait(50);
external({ ...s()!, startTime: trustedNowMs() - 25 * MIN - 30_000, plannedDurationSeconds: 29 * 60 });
await wait(50);
c().takeBreak(5);
await wait(50);
assert(Boolean(s() && !s()!.isPaused), '29-min session: break refused');

console.log('focusBreakProvider.test.ts: all checks passed');
(globalThis as unknown as { process: { exit: (code: number) => never } }).process.exit(0);
