// Focus Break v2 (2026-11-13): the pure break rules in focusSession.ts, the row mapping and the
// queued break action in focusServerSession.ts. They mirror
// supabase/migrations/20261113140000_focus_break_v2.sql (PGlite-tested in work/v2/pglite-test.mjs):
// 5/10/15 min after 25 focused min, only in sessions planned for 35+ min (Zakria 2026-11-13; the SQL
// guard for 35 is a separate migration), max 2, not under 5 min left; no auto-resume: Continue during
// the break or within 10 min after it, else the session closes at the break start; logout in a break =
// plain pause.

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
eq(S.FOCUS_BREAK_MIN_PLANNED_MINUTES, 35, 'breaks only from 35 planned min (Zakria 2026-11-13)');
eq(S.breakBlock(running(29), T0 + 26 * MIN), 'short', '29-min session: never a break');
eq(S.breakBlock(running(30), T0), 'short', '30-min session: no Break at all, even at the start');
eq(S.breakBlock(running(30), T0 + 25 * MIN), 'short', '30-min session at exactly 25:00 focused: no break (was the dead button)');
eq(S.breakBlock(running(34), T0 + 26 * MIN), 'short', '34-min session at 26:00 (8 min left): no break');
eq(S.breakBlock(running(35), T0), 'early', '35-min session at the start: Break shown, not yet');
eq(S.breakBlock(running(35), T0 + 25 * MIN - 1000), 'early', '35-min session at 24:59 focused: not yet');
eq(S.breakBlock(running(35), T0 + 25 * MIN), null, '35-min session at 25:00 focused: break allowed');
eq(S.breakBlock(S.pauseAt(running(30), T0 + 26 * MIN), T0 + 26 * MIN), 'short', '30-min paused: still no Break');
eq(S.breakAt(running(34), T0 + 26 * MIN, 5).isPaused, false, '34-min breakAt refused');
eq(S.breakBlock(running(50), T0 + 24 * MIN), 'early', '24 focused min: not yet');
eq(S.breakBlock(running(50), T0 + 25 * MIN), null, '25 focused min: break allowed');
const resumedAfterPause = S.resumeAt(S.pauseAt(running(50), T0 + 10 * MIN), T0 + 30 * MIN);
eq(S.breakBlock(resumedAfterPause, T0 + 44 * MIN), 'early', '44 wall min but 24 focused (a 20-min pause): not yet');
eq(S.breakBlock(resumedAfterPause, T0 + 45 * MIN), null, '25 focused after a pause: allowed');
eq(S.breakBlock(running(50, { breakCount: 2 }), T0 + 30 * MIN), 'used', 'two breaks used');
eq(S.breakBlock(running(35), T0 + 30 * MIN + 1000), 'ending', '35 min, 4:59 left: no break');
eq(S.breakBlock(running(35), T0 + 30 * MIN - 1000), null, '35 min, 5:01 left, 29:59 focused: break allowed');
eq(S.breakBlock(S.pauseAt(running(), T0 + 30 * MIN), T0 + 30 * MIN), 'not-running', 'paused: no break');
eq(S.FOCUS_BREAK_MINUTES_TEXT, '5, 10 or 15', 'copy of the lengths');

// 2. breakAt: paused at the moment, ends after its minutes, count +1; refused cases unchanged.
const s0 = running();
const onBreak = S.breakAt(s0, T0 + 30 * MIN, 10);
assert(S.onBreak(onBreak), 'on a break');
eq(onBreak.pausedAt, T0 + 30 * MIN, 'paused at the break start');
eq(onBreak.pauseEndsAt, T0 + 40 * MIN, 'break ends 10 min later');
eq(onBreak.pausedRemainingSeconds, 20 * 60, '20 min of focus left');
eq(onBreak.breakCount, 1, 'first break counted');
eq(S.breakAt(s0, T0 + 20 * MIN, 5), s0, 'break before 25 focused min refused (unchanged)');
eq(S.breakAt(running(50, { breakCount: 2 }), T0 + 30 * MIN, 5).isPaused, false, 'third break refused');
eq(S.breakAt(s0, T0 + 30 * MIN, 20 as 5).isPaused, false, 'a 20-min break refused');

// 3. No auto-resume: the break waits for Continue; deadline = break end + 10 min.
eq(S.resumeDeadlineMs(onBreak), T0 + 50 * MIN, 'deadline = break end + 10 min');
eq(S.breakSecondsLeft(onBreak, T0 + 35 * MIN), 5 * 60, '5 min of the break left');
eq(S.breakSecondsLeft(onBreak, T0 + 45 * MIN), 0, 'break over: 0');
eq(S.remainingSeconds(onBreak, T0 + 49 * MIN), 20 * 60, 'focus frozen through break + grace');
eq(S.activeMinutesAt(onBreak, T0 + 49 * MIN), 30, 'break + grace minutes never count');
assert(S.canResume(onBreak, T0 + 50 * MIN), 'Continue at the deadline: allowed');
assert(!S.canResume(onBreak, T0 + 50 * MIN + 1000), 'Continue after the deadline: refused');
const during = S.settleSession(onBreak, T0 + 45 * MIN);
assert(!during.changed && during.session === onBreak, 'settle in the grace minutes: still on the break (no auto-resume)');
const gone = S.settleSession(onBreak, T0 + 50 * MIN + 1000);
assert(gone.changed && gone.session === null && gone.close !== null, 'settle after the deadline: closed');
eq(gone.close!.endMs, T0 + 30 * MIN, 'closed at the break START');
eq(gone.close!.activeMinutes, 30, 'focused minutes only (break + grace not counted)');
assert(gone.close!.save, 'saved (a break needs 25 focused min)');
eq(gone.close!.points, 2, '30 min alone: 2 pts (rule 2)');
eq(JSON.stringify(gone.notice), JSON.stringify({ kind: 'expired', saved: true, minutes: 30, afterBreak: true }), 'notice: ended after a break');
const at25 = S.settleSession(S.breakAt(running(50), T0 + 25 * MIN, 5), T0 + 40 * MIN + 1000);
eq(at25.close!.activeMinutes, 25, '25 focused min');
eq(at25.close!.points, 2, '25 min = 2 pts');
const plainGone = S.settleSession(S.pauseAt(running(), T0 + 10 * MIN), T0 + 40 * MIN + 1000);
eq(plainGone.notice?.kind === 'expired' && plainGone.notice.afterBreak, undefined, 'plain pause expiry: not marked after-break');

// 4. Continue (during or after the break): running from now, same focus left, no break mark.
const early = S.resumeAt(onBreak, T0 + 33 * MIN);
eq(early.startTime, T0 + 33 * MIN, 'Continue early: running now');
eq(early.plannedDurationSeconds, 20 * 60, 'same focus left');
eq(early.pauseEndsAt, undefined, 'no break mark while running');
const late = S.resumeAt(onBreak, T0 + 48 * MIN);
eq(late.startTime, T0 + 48 * MIN, 'Continue in the grace minutes: running from then');
eq(S.activeMinutesAt(late, T0 + 48 * MIN), 30, 'still 30 focused');
eq(S.breakBlock(late, T0 + 49 * MIN), null, 'second break possible later');
const second = S.breakAt(late, T0 + 49 * MIN, 5);
eq(second.breakCount, 2, 'second break counted');
eq(S.breakBlock(S.resumeAt(second, T0 + 50 * MIN), T0 + 51 * MIN), 'used', 'no third');

// 6. Logout during a break / its grace: a plain pause stamped at the sign-out (30-min window).
const out = S.pauseForSignOut(onBreak, T0 + 35 * MIN)!;
assert(out.isPaused && !S.onBreak(out), 'logout in a break: plain pause');
eq(out.pausedAt, T0 + 35 * MIN, 'stamped at the sign-out');
eq(out.pausedRemainingSeconds, 20 * 60, 'time left unchanged');
eq(S.resumeDeadlineMs(out), T0 + 65 * MIN, 'resume within 30 min of the sign-out');
const outGrace = S.pauseForSignOut(onBreak, T0 + 46 * MIN)!;
assert(outGrace.isPaused && !S.onBreak(outGrace) && outGrace.pausedAt === T0 + 46 * MIN, 'logout in the grace minutes: plain pause');
eq(outGrace.pausedRemainingSeconds, 20 * 60, 'grace: no focus counted');
eq(S.pauseForSignOut(onBreak, T0 + 51 * MIN), onBreak, 'logout after the deadline: unchanged (closed at the break start at next sign-in)');
mem.clear();
localStorage.setItem(S.focusStorageKey('u1'), JSON.stringify(onBreak));
S.pauseStoredSessionsForSignOut(T0 + 35 * MIN);
const stored = S.parseSession(localStorage.getItem(S.focusStorageKey('u1')))!;
assert(stored.isPaused && stored.pauseEndsAt === undefined && stored.pausedAt === T0 + 35 * MIN, 'stored session: plain pause at sign-out');
const ops = S.readFocusOps('u1');
eq(ops.length, 1, 'one pause queued for the server');
eq(ops[0].kind, 'pause', 'queued kind');
eq((ops[0] as { atMs: number }).atMs, T0 + 35 * MIN, 'queued at the sign-out');
mem.clear();
localStorage.setItem(S.focusStorageKey('u1'), JSON.stringify(onBreak));
S.pauseStoredSessionsForSignOut(T0 + 51 * MIN);
eq(S.readFocusOps('u1').length, 0, 'logout after the deadline: nothing queued');
mem.clear();
localStorage.setItem(S.focusStorageKey('u1'), JSON.stringify(S.pauseAt(running(), T0 + 5 * MIN)));
S.pauseStoredSessionsForSignOut(T0 + 8 * MIN);
eq(S.readFocusOps('u1').length, 0, 'logout on a plain pause: nothing queued (as before)');
mem.clear();
localStorage.setItem(S.focusStorageKey('u1'), JSON.stringify(running()));
S.pauseStoredSessionsForSignOut(T0 + 8 * MIN);
eq(S.readFocusOps('u1')[0]?.kind, 'pause', 'logout while running: pause queued (as before)');
mem.clear();
// A queued 'back' from the removed "I wasn't back" is dropped, never left blocking the queue.
localStorage.setItem(S.focusOpsKey('u1'), JSON.stringify([{ kind: 'back', sessionId: 'b1', atMs: T0 }, { kind: 'resume', sessionId: 'b1', atMs: T0 }]));
eq(S.readFocusOps('u1').map((o) => o.kind).join(), 'resume', "stale 'back' op dropped");
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
const fromRunning = X.rowToSession(
  row({ status: 'running', stretch_started_at: iso(T0 + 30 * MIN), stretch_planned_seconds: 1800, paused_at: null }),
  'u1'
)!;
eq(fromRunning.pauseEndsAt, undefined, 'running row with a stale pause_ends_at (v1 auto-resume mark): ignored');
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
await X.sendOp(transport, { kind: 'resume', sessionId: 'b1', atMs: T0 }, 6);
await X.sendOp(transport, { kind: 'pause', sessionId: 'b1', atMs: T0 }, 7);
eq(calls[1][0] + ' ' + calls[2][0], 'ascend_focus_session_resume ascend_focus_session_pause', 'Continue = the old 3-argument resume RPC');
eq(JSON.stringify(calls[1][1]), JSON.stringify({ p_session_id: 'b1', p_revision: 6, p_at: iso(T0) }), 'resume args');

// 10. An 'expired' row that ended after a break: closed at the break start, focused minutes only.
const expiredRow = row({ status: 'ended', end_reason: 'expired', focus_ended_at: iso(T0 + 20 * MIN) });
const closeRow = X.rowClose(expiredRow, 'u1')!;
eq(closeRow.endMs, T0 + 20 * MIN, 'row close at the break start');
eq(closeRow.activeMinutes, 20, 'row close: 20 focused min');
eq(X.rowToSession(expiredRow, 'u1'), null, 'ended row: nothing shown');

console.log('focusBreak.test.ts: all checks passed');
