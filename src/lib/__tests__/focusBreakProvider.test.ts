// Focus Break (I1, 2026-11-13) through the REAL FocusSessionProvider, rendered in Node (no Supabase
// env = device-only mode, so every action stays in the queue for the server): Break, the break end
// on its own (with the cue only when the app is open at that moment), "I wasn't back", End break,
// the limits (max 2, sessions over 25 min, not in the last 5 min).
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

const store = {
  state: { currentUser: { id: UID }, focusLogs: [] },
  isAuthChecking: false,
  isSessionLoading: false,
  logFocusSession: () => 'focus_log',
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

// 1. Break 10 on a 50-min session.
c().start({ taskName: 'Write', focusMinutes: 50, breakMinutes: 10, isCustom: false });
await wait(50);
assert(s()?.mode === 'focus' && !s()!.isPaused, 'started');
c().takeBreak(10);
await wait(50);
assert(S.onBreak(s()), 'on a break');
eq(s()!.breakCount, 1, 'break counted');
assert(Math.abs(s()!.pauseEndsAt! - s()!.pausedAt! - 10 * MIN) < 5, 'ends 10 min after it began');
const breakOp = lastOp() as { kind: string; minutes?: number };
eq(breakOp.kind, 'break', 'break queued for the server');
eq(breakOp.minutes, 10, 'queued with its length');

// 2. The break ends on its own while the app is open: running from the break end, cue played.
const endsAt = trustedNowMs() + 300;
external({ ...s()!, pauseEndsAt: endsAt });
await wait(700);
assert(Boolean(s() && !s()!.isPaused), 'running again after the break end');
eq(s()!.startTime, endsAt, 'running from the break end');
assert(S.autoResumed(s()), 'marked as started on its own');
eq(buzzes.length, 1, 'break-over cue played once (app open)');
eq(JSON.stringify(buzzes[0]), JSON.stringify([60, 80, 60]), 'cue pattern');

// 3. "I wasn't back": counts from now, same time left, queued.
const leftBefore = s()!.plannedDurationSeconds;
await wait(30);
c().notBack();
await wait(50);
assert(!S.autoResumed(s()) && s()!.startTime > endsAt, 'stretch restarted now');
eq(s()!.plannedDurationSeconds, leftBefore, 'same time left');
eq(lastOp().kind, 'back', 'back queued for the server');
c().notBack();
await wait(30);
eq(ops().filter((o) => o.kind === 'back').length, 1, 'a second "I wasn\'t back" does nothing');

// 4. Second break; it ended 3 min ago while the app was closed: running from its end, no cue.
c().takeBreak(5);
await wait(50);
eq(s()!.breakCount, 2, 'second break counted');
const longAgo = trustedNowMs() - 3 * MIN;
external({ ...s()!, pauseEndsAt: longAgo });
await wait(200);
assert(Boolean(s() && !s()!.isPaused && s()!.startTime === longAgo), 'opened late: running since the break end');
eq(buzzes.length, 1, 'no cue for a break that ended while the app was closed');

// 5. A third break is refused.
const opsBefore = ops().length;
c().takeBreak(5);
await wait(50);
assert(!s()!.isPaused, 'third break refused');
eq(ops().length, opsBefore, 'nothing queued');

// 6. Under 5 min of focus left: refused.
external({ ...s()!, breakCount: 0, startTime: trustedNowMs() - (s()!.plannedDurationSeconds - 4 * 60) * 1000 });
await wait(50);
c().takeBreak(5);
await wait(50);
assert(!s()!.isPaused, 'no break with 4 min left');

// 7. End break early.
external({ ...s()!, startTime: trustedNowMs(), plannedDurationSeconds: 40 * 60, pauseEndsAt: undefined });
await wait(50);
c().takeBreak(15);
await wait(50);
assert(S.onBreak(s()), 'third session state: on a break');
c().resume();
await wait(50);
assert(Boolean(s() && !s()!.isPaused && s()!.pauseEndsAt === undefined), 'End break: running now, no marker');
eq(lastOp().kind, 'resume', 'End break queued as resume');

// 8. A 25-min session has no break.
c().stop();
await wait(50);
eq(s(), null, 'discarded (under 25 active min)');
c().start({ taskName: 'Short', focusMinutes: 25, breakMinutes: 5, isCustom: false });
await wait(50);
c().takeBreak(5);
await wait(50);
assert(Boolean(s() && !s()!.isPaused), '25-min session: break refused');

console.log('focusBreakProvider.test.ts: all checks passed');
(globalThis as unknown as { process: { exit: (code: number) => never } }).process.exit(0);
