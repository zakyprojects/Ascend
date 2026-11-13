// Focus Break (I1, 2026-11-13): the pure break rules in focusSession.ts, the row mapping and the
// queued break / back actions in focusServerSession.ts. They mirror
// supabase/migrations/20261113120000_focus_break.sql (PGlite-tested in work/i1/pglite-test.mjs):
// 5/10/15 min, sessions over 25 min, max 2, not under 5 min left, auto-resume at the break end with
// the same time left, "I wasn't back" restarts the stretch, logout in a break = plain pause.

// Node has no localStorage: a small in-memory one.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return mem.size;
  },
  key: (i: number) => [...mem.keys()][i] ?? null,
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
} as Storage;

const S = await import('../focus/focusSession');
const X = await import('../focus/focusServerSession');
type Session = import('../focus/focusSession').FocusSession;
type Row = import('../focus/focusServerSession').FocusServerRow;

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 13, 5, 0, 0); // 10:00 PKT
const iso = (t: number) => new Date(t).toISOString();

const running = (focusMinutes = 50, extra: Partial<Session> = {}): Session => ({
  id: 'b1',
  mode: 'focus',
  taskName: 'Write',
  focusMinutes,
  breakMinutes: 10,
  isCustom: false,
  startTime: T0,
  plannedDurationSeconds: focusMinutes * 60,
  isPaused: false,
  pausedRemainingSeconds: focusMinutes * 60,
  userId: 'u1',
  startedAt: T0,
  pausedAt: null,
  marksAt: [],
  revision: 1,
  ...extra,
});

// 1. Who may take a break.
eq(S.breakBlock(running(25), T0 + MIN), 'short', '25-min session: no break');
eq(S.breakBlock(running(26), T0 + MIN), null, '26-min session: break allowed');
eq(S.breakBlock(running(50, { breakCount: 2 }), T0 + MIN), 'used', 'two breaks used');
eq(S.breakBlock(running(30), T0 + 25 * MIN + 1000), 'ending', '4:59 left: no break');
eq(S.breakBlock(running(30), T0 + 25 * MIN - 1000), null, '5:01 left: break allowed');
eq(S.breakBlock(running(30), T0 + 25 * MIN), null, 'exactly 5:00 left: allowed (server: v_left < 300 refused)');
eq(S.breakBlock(S.pauseAt(running(), T0 + MIN), T0 + MIN), 'not-running', 'paused: no break');
eq(S.FOCUS_BREAK_MINUTES_TEXT, '5, 10 or 15', 'copy of the lengths');

// 2. breakAt: paused at the moment, ends after its minutes, count +1; refused cases unchanged.
const s0 = running();
const onBreak = S.breakAt(s0, T0 + 20 * MIN, 10);
assert(S.onBreak(onBreak), 'on a break');
eq(onBreak.pausedAt, T0 + 20 * MIN, 'paused at the break start');
eq(onBreak.pauseEndsAt, T0 + 30 * MIN, 'break ends 10 min later');
eq(onBreak.pausedRemainingSeconds, 30 * 60, '30 min of focus left');
eq(onBreak.breakCount, 1, 'first break counted');
eq(S.resumeDeadlineMs(onBreak), null, 'a break has no 30-min resume deadline');
assert(S.canResume(onBreak, T0 + 200 * MIN), 'a break never expires by the resume window');
assert(S.breakAt(running(25), T0 + MIN, 5) === running(25) || S.breakAt(running(25), T0 + MIN, 5).isPaused === false, '25-min session unchanged');
eq(S.breakAt(running(50, { breakCount: 2 }), T0 + MIN, 5).isPaused, false, 'third break refused');
eq(S.breakAt(s0, T0 + MIN, 20 as 5).isPaused, false, 'a 20-min break refused');

// 3. breakDue / settleSession: running again from the break end with the same time left.
eq(S.breakDue(onBreak, T0 + 29 * MIN), onBreak, 'before the end: unchanged');
const resumed = S.breakDue(onBreak, T0 + 45 * MIN);
eq(resumed.isPaused, false, 'after the end: running');
eq(resumed.startTime, T0 + 30 * MIN, 'running from the break end');
eq(resumed.plannedDurationSeconds, 30 * 60, 'same time left');
eq(resumed.pauseEndsAt, resumed.startTime, 'auto-resume marker');
assert(S.autoResumed(resumed), 'autoResumed');
eq(S.remainingSeconds(resumed, T0 + 45 * MIN), 15 * 60, 'at wall minute 45: 15 min left (ends at start + 60)');
eq(S.activeMinutesAt(resumed, T0 + 45 * MIN), 35, '35 active min: break time excluded');
const settled = S.settleSession(onBreak, T0 + 70 * MIN);
assert(settled.changed && settled.close === null && settled.session?.isPaused === false, 'settle: a long-gone break never expires');
eq(S.settleSession(onBreak, T0 + 25 * MIN).changed, false, 'settle during the break: unchanged');
const marks = S.milestoneTimes(resumed, T0 + 60 * MIN);
eq(marks.length, 3, 'milestones 25/35/45');
eq(marks[1], T0 + 45 * MIN, '35 active min at wall 45 (10 min break excluded)');

// 4. End break early, and a plain pause clears the marker.
const early = S.resumeAt(onBreak, T0 + 23 * MIN);
eq(early.startTime, T0 + 23 * MIN, 'End break: running now');
eq(early.pauseEndsAt, undefined, 'End break: no marker');
assert(!S.autoResumed(early), 'End break is not an auto-resume');
eq(S.pauseAt(resumed, T0 + 40 * MIN).pauseEndsAt, undefined, 'plain pause clears the marker');

// 5. "I wasn't back": the stretch restarts now with the same time left; only after an auto-resume.
const back = S.backAt(resumed, T0 + 37 * MIN);
eq(back.startTime, T0 + 37 * MIN, 'back: stretch restarts now');
eq(back.plannedDurationSeconds, 30 * 60, 'back: same time left');
eq(back.pauseEndsAt, undefined, 'back: marker cleared');
eq(S.activeMinutesAt(back, T0 + 37 * MIN), 20, 'back: the 7 min since the break end are removed');
eq(S.backAt(early, T0 + 30 * MIN), early, 'back after End break: unchanged');
eq(S.backAt(resumed, T0 + 61 * MIN), resumed, 'back after the plan finished: unchanged');

// 6. Logout during a break: a plain pause stamped at the sign-out (the normal 30-min window).
const out = S.pauseForSignOut(onBreak, T0 + 25 * MIN)!;
assert(out.isPaused && !S.onBreak(out), 'logout in a break: plain pause');
eq(out.pausedAt, T0 + 25 * MIN, 'stamped at the sign-out');
eq(out.pausedRemainingSeconds, 30 * 60, 'time left unchanged');
eq(S.resumeDeadlineMs(out), T0 + 55 * MIN, 'resume within 30 min of the sign-out');
const outLate = S.pauseForSignOut(onBreak, T0 + 33 * MIN)!;
eq(outLate.pausedRemainingSeconds, 27 * 60, 'logout after the break end: paused with 3 more minutes done');
mem.clear();
localStorage.setItem(S.focusStorageKey('u1'), JSON.stringify(onBreak));
S.pauseStoredSessionsForSignOut(T0 + 25 * MIN);
const stored = S.parseSession(localStorage.getItem(S.focusStorageKey('u1')))!;
assert(stored.isPaused && stored.pauseEndsAt === undefined && stored.pausedAt === T0 + 25 * MIN, 'stored session: plain pause at sign-out');
const ops = S.readFocusOps('u1');
eq(ops.length, 1, 'one pause queued for the server');
eq(ops[0].kind, 'pause', 'queued kind');
eq((ops[0] as { atMs: number }).atMs, T0 + 25 * MIN, 'queued at the sign-out');
mem.clear();

// 7. parseSession keeps the new fields (a reload mid-break).
const parsed = S.parseSession(JSON.stringify(onBreak))!;
eq(parsed.pauseEndsAt, onBreak.pauseEndsAt, 'parse keeps pauseEndsAt');
eq(parsed.breakCount, 1, 'parse keeps breakCount');
eq(S.parseSession(JSON.stringify(s0))!.breakCount, undefined, 'no breaks: no key');

// 8. Server row -> session (pause_ends_at, break_count).
const row = (o: Partial<Row>): Row => ({
  session_id: 'b1',
  status: 'paused',
  task_name: 'Write',
  skill_id: null,
  focus_minutes: 50,
  break_minutes: 10,
  is_custom: false,
  started_at: iso(T0),
  stretch_started_at: iso(T0),
  stretch_planned_seconds: 3000,
  paused_at: iso(T0 + 20 * MIN),
  paused_remaining_seconds: 1800,
  marks_at: [],
  focus_ended_at: null,
  end_reason: null,
  log_claimed: false,
  revision: 3,
  pause_ends_at: iso(T0 + 30 * MIN),
  break_count: 1,
  ...o,
});
const fromBreak = X.rowToSession(row({}), 'u1')!;
assert(S.onBreak(fromBreak) && fromBreak.pauseEndsAt === T0 + 30 * MIN && fromBreak.breakCount === 1, 'paused row with pause_ends_at = on a break');
const fromAuto = X.rowToSession(
  row({ status: 'running', stretch_started_at: iso(T0 + 30 * MIN), stretch_planned_seconds: 1800, paused_at: null }),
  'u1'
)!;
assert(S.autoResumed(fromAuto), 'running row with pause_ends_at = stretch start = auto-resumed');
const fromOther = X.rowToSession(
  row({ status: 'running', stretch_started_at: iso(T0 + 33 * MIN), stretch_planned_seconds: 1800, paused_at: null }),
  'u1'
)!;
eq(fromOther.pauseEndsAt, undefined, 'running row with an older pause_ends_at: no marker');
const oldRow = X.rowToSession(row({ pause_ends_at: undefined, break_count: undefined }), 'u1')!;
assert(oldRow.isPaused && !S.onBreak(oldRow) && oldRow.breakCount === undefined, 'row without the new keys: plain pause');
eq(JSON.stringify(X.rowToSession(row({ status: 'running', pause_ends_at: null, break_count: 0, paused_at: null }), 'u1')), JSON.stringify(X.rowToSession(row({ status: 'running', pause_ends_at: undefined, break_count: undefined, paused_at: null }), 'u1')), 'no break: same session as before this change (no extra keys)');

// 9. Queued actions reach the right RPCs.
const calls: Array<[string, Record<string, unknown>]> = [];
const transport = {
  call: async (fn: string, args: Record<string, unknown>) => {
    calls.push([fn, args]);
    return { ok: true as const, reply: { row: null, applied: true, claimed: false, previous: null } };
  },
};
await X.sendOp(transport, { kind: 'break', sessionId: 'b1', atMs: T0, minutes: 15 }, 4);
eq(calls[0][0], 'ascend_focus_session_break', 'break RPC');
eq(JSON.stringify(calls[0][1]), JSON.stringify({ p_session_id: 'b1', p_minutes: 15, p_revision: 4, p_at: iso(T0) }), 'break args');
await X.sendOp(transport, { kind: 'back', sessionId: 'b1', atMs: T0, baseRevision: 5 }, 5);
eq(calls[1][0], 'ascend_focus_session_back', 'back RPC');
eq(JSON.stringify(calls[1][1]), JSON.stringify({ p_session_id: 'b1', p_revision: 5, p_at: iso(T0) }), 'back args');
await X.sendOp(transport, { kind: 'resume', sessionId: 'b1', atMs: T0 }, 6);
await X.sendOp(transport, { kind: 'pause', sessionId: 'b1', atMs: T0 }, 7);
eq(calls[2][0] + ' ' + calls[3][0], 'ascend_focus_session_resume ascend_focus_session_pause', 'old 3-argument RPCs unchanged');

console.log('focusBreak.test.ts: all checks passed');
