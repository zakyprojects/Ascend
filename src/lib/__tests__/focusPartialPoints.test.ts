// Focus timer partial points (rule R1, Zakria 2026-11-04; since 2026-11-09 only for rows logged
// before rule 2, which keep it: the rule-2 suite is focusPoints12min.test.ts) and the session rules
// around it: the R1 value table, the server mirror (cap, midnight split, late arrival of yesterday's session,
// wall-clock clamp, old rows),
// paused time never counting, the 30-minute resume window, a running session counting wall time
// while the app is closed or the phone locked, and logout pausing it for the same account only.
import type { FocusSessionLog, PointsEntry } from '@/types';
import type { FocusSession } from '../focusSession';

// Node has no localStorage: a small in-memory one.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
} as Storage;

const { focusR1Points, FOCUS_DAILY_CAP } = await import('../focusPoints');
const { computeFocusAwards, creditedFocusMinutes, focusFloorDay } = await import('../focusAwards');
const S = await import('../focusSession');
const { PFC_POINTS } = await import('../pointsConfig');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(a === b, `${msg} (got ${String(a)}, want ${String(b)})`);

const MIN = 60_000;

// --- 1. R1 value table ---
assert(PFC_POINTS.focus.dailyCap === 10 && FOCUS_DAILY_CAP === 10, 'config: daily cap 10');
const table: Array<[planned: number, active: number, points: number]> = [
  [25, 25, 2], [25, 24, 0], [50, 50, 5], [90, 90, 10], // presets keep 2 / 5 / 10
  [90, 75, 7], [90, 60, 5], [90, 85, 8], [90, 89, 8], [90, 45, 4], [90, 25, 2],
  [60, 60, 6], [45, 45, 4], [45, 30, 2], [10, 10, 0], [30, 30, 2], [75, 75, 8],
  [120, 120, 10], [120, 100, 8], [90, 200, 10], // active above the plan is capped at the plan
];
for (const [planned, active, points] of table) eq(focusR1Points(active, planned), points, `R1 ${active} of ${planned}`);

// --- 2. Server mirror ---
const DAY = '2026-11-04';
const PREV = '2026-11-03';
const at = (day: string, h: number, m = 0) => new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const dayStart = at(DAY, 0);
const NOW = at(DAY, 23, 59);

/** A new-rule log: started at startMs, ran `active` minutes without pause, planned `planned`. */
function r1Log(id: string, startMs: number, active: number, planned: number, extra: Partial<FocusSessionLog> = {}): FocusSessionLog {
  const endMs = startMs + active * MIN;
  const marks = [25, 35, 45, 55, 65, 75, 85].filter((m) => m <= Math.min(active, planned)).map((m) => iso(startMs + m * MIN));
  return {
    id,
    date: localDay(endMs),
    taskName: 'Work',
    durationMinutes: active,
    pointsAwarded: 0,
    createdAt: iso(endMs),
    plannedMinutes: planned,
    startedAt: iso(startMs),
    milestonesAt: marks,
    ...extra,
  };
}
function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const legacy = (id: string, minutes: number, h: number, day = DAY): FocusSessionLog => ({
  id,
  date: day,
  taskName: 'Old',
  durationMinutes: minutes,
  pointsAwarded: 0,
  createdAt: iso(at(day, h)),
});
const amount = (logs: FocusSessionLog[], day = DAY, existing?: PointsEntry | null, floor = false) =>
  computeFocusAwards(logs, day, at(day, 0), NOW, existing, { floor }).entry?.amount ?? 0;

eq(amount([r1Log('a', at(DAY, 9), 75, 90)]), 7, '90 stopped at 75 = 7');
eq(amount([r1Log('a', at(DAY, 9), 90, 90)]), 10, '90 finished = 10');
eq(amount([r1Log('a', at(DAY, 9), 20, 90)]), 0, 'under 25 = 0');
// Old rows keep the old tiers exactly.
eq(amount([legacy('o1', 50, 8), legacy('o2', 90, 12)]), 10, 'old rows: 5 + 10 capped at 10');
eq(amount([legacy('o1', 75, 8)]), 5, 'old row of 75 min still earns its tier (5)');
// Cap 10 a day across old and new rows, in time order.
{
  const logs = [legacy('o1', 50, 8), r1Log('n1', at(DAY, 10), 60, 60), r1Log('n2', at(DAY, 14), 45, 45)];
  const res = computeFocusAwards(logs, DAY, dayStart, NOW);
  eq(res.entry?.amount, 10, 'cap 10 with old + new rows');
  eq(res.sessionPoints.get('o1'), 5, 'first session keeps its 5');
  eq(res.sessionPoints.get('n1'), 5, 'second gets the remaining 5 of its 6');
  eq(res.sessionPoints.get('n2'), 0, 'third gets nothing');
}
// Wall-clock clamp: a claimed 90 minutes in a 30-minute window earns only what 30 minutes can.
{
  const forged = r1Log('f', at(DAY, 9), 90, 90, { createdAt: iso(at(DAY, 9, 30)) });
  eq(creditedFocusMinutes(forged), 30, 'credited minutes clamp to end - start');
  eq(amount([forged]), 2, 'forged 90 in 30 min earns 2, not 10');
  eq(amount([r1Log('g', at(DAY, 9), 90, 90, { startedAt: iso(at(DAY, 11)) })]), 0, 'start after end earns 0');
  eq(amount([r1Log('h', at(DAY, 9), 90, 90, { startedAt: undefined })]), 0, 'missing start earns 0');
}
// Midnight: milestones count on the local day they were crossed.
{
  const cross = r1Log('m', at(PREV, 23, 40), 90, 90); // 25 → 00:05: every milestone is today
  const early = r1Log('m2', at(PREV, 23, 20), 90, 90); // 25 → 23:45, 35 → 23:55 (yesterday), rest today
  eq(early.date, DAY, 'logged on the end day');
  eq(amount([early], DAY), 7, 'today: 45..85 (5) + finish bonus (2)');
  eq(amount([early], PREV, null, true), 3, 'yesterday (floor): 25 (2) + 35 (1)');
  eq(amount([cross], PREV, null, true), 0, 'nothing crossed before midnight, nothing yesterday');
  const existing: PointsEntry = { id: `focus_award_${PREV}`, amount: 9, reason: 'x', source: 'focus', timestamp: iso(at(PREV, 10)) };
  eq(amount([early, legacy('o', 90, 10, PREV)], PREV, existing, true), 10, 'yesterday raised up to the cap');
  const high: PointsEntry = { ...existing, amount: 10 };
  const kept = computeFocusAwards([early], PREV, at(PREV, 0), NOW, high, { floor: true }).entry;
  eq(kept?.amount, 10, 'floor never lowers yesterday');
  // Bad crossing times count at the end (today), never on an earlier day.
  const bad = r1Log('b', at(PREV, 23, 20), 90, 90, { milestonesAt: [iso(at(PREV, 23, 21)), iso(at(PREV, 23, 22))] });
  eq(amount([bad], PREV, null, true), 0, 'too-early crossings do not move points to yesterday');
  eq(amount([bad], DAY), 10, 'they count on the end day');
}
// Late arrival (20261104160000): a session that ended yesterday and reaches the server today is
// dated yesterday and raises yesterday in floor mode; older days never move.
{
  const PREV2 = '2026-11-02';
  const late = r1Log('l', at(PREV, 21), 90, 90); // 21:00 → 22:30 yesterday
  eq(late.date, PREV, 'dated the day it ended');
  eq(focusFloorDay(late, DAY), PREV, 'raises yesterday');
  eq(amount([late], PREV, null, true), 10, 'yesterday gets all 10 (floor)');
  eq(amount([late], DAY), 0, 'today gets nothing');
  const existing: PointsEntry = { id: `focus_award_${PREV}`, amount: 4, reason: 'x', source: 'focus', timestamp: iso(at(PREV, 10)) };
  eq(amount([late, r1Log('y', at(PREV, 9), 45, 45)], PREV, existing, true), 10, 'adds to the live rows of yesterday, cap 10');
  eq(focusFloorDay(r1Log('old', at(PREV2, 21), 90, 90), DAY), null, 'two days old: never raised');
  const intoPrev = r1Log('x', at(PREV2, 23, 20), 90, 90); // ended yesterday 00:50
  eq(focusFloorDay(intoPrev, DAY), PREV, 'crossed into yesterday: raises yesterday');
  eq(amount([intoPrev], PREV, null, true), 7, 'only the part on yesterday: 45..85 (5) + bonus (2)');
  eq(focusFloorDay(r1Log('t', at(DAY, 9), 90, 90), DAY), null, 'a session of today alone: no floor');
  eq(focusFloorDay(r1Log('m', at(PREV, 23, 20), 90, 90), DAY), PREV, 'across midnight into today: raises yesterday');
  eq(focusFloorDay(r1Log('m3', at(PREV, 23, 40), 90, 90), DAY), null, 'started yesterday but nothing crossed before midnight: no floor');
  eq(focusFloorDay(legacy('o', 90, 22, PREV), DAY), null, 'old-rule rows are never raised');
  eq(focusFloorDay(r1Log('u', at(PREV, 21), 20, 30), DAY), null, 'under 25: nothing to raise');
}

// --- 3. Session: paused time never counts; milestones skip the pause ---
const T0 = at(DAY, 9);
function newSession(minutes: number, userId = 'user-a'): FocusSession {
  return {
    id: 's1',
    mode: 'focus',
    taskName: 'Work',
    focusMinutes: minutes,
    breakMinutes: 5,
    isCustom: false,
    startTime: T0,
    plannedDurationSeconds: minutes * 60,
    isPaused: false,
    pausedRemainingSeconds: minutes * 60,
    userId,
    startedAt: T0,
    pausedAt: null,
    marksAt: [],
  };
}
{
  let s = newSession(90);
  s = S.pauseAt(s, T0 + 20 * MIN);
  eq(S.activeMinutesAt(s, T0 + 45 * MIN), 20, 'paused: 20 active min, the pause does not count');
  s = S.resumeAt(s, T0 + 40 * MIN); // 20 min paused
  eq(S.activeMinutesAt(s, T0 + 50 * MIN), 30, 'after resume: 20 + 10');
  const close = S.closeAt(s, T0 + 70 * MIN); // 50 active
  eq(close.activeMinutes, 50, '50 active minutes in 70 wall minutes');
  eq(close.points, 4, '50 active min alone = 4 (rule 2)');
  eq(close.milestonesAt[0], T0 + 45 * MIN, '25-min mark crossed 20 min late because of the pause');
  eq(close.milestonesAt.length, 3, 'three milestones');
  // The mirror accepts these crossings (each at least start + its minutes).
  const log = r1Log('p', T0, 50, 90, { createdAt: iso(close.endMs), milestonesAt: close.milestonesAt.map(iso) });
  eq(amount([log]), 4, 'logged pause session earns 4');
}

// --- 4. Resume window: 29:59 resumes, 30:01 closes; >= 25 saved, < 25 dropped ---
eq(S.FOCUS_RESUME_WINDOW_MINUTES, 30, 'resume window is 30 minutes');
{
  const paused = S.pauseAt(newSession(90), T0 + 40 * MIN);
  const p0 = paused.pausedAt!;
  const r1 = S.settleSession(paused, p0 + 29 * MIN + 59_000);
  assert(!r1.changed && r1.session?.isPaused === true, '29:59 paused: still resumable');
  assert(S.canResume(paused, p0 + 29 * MIN + 59_000), 'canResume at 29:59');
  const r2 = S.settleSession(paused, p0 + 30 * MIN + 1_000);
  assert(r2.session === null && r2.close !== null, '30:01 paused: closed');
  eq(r2.close!.endMs, p0, 'closed at the pause moment');
  eq(r2.close!.activeMinutes, 40, 'credited only up to the pause');
  assert(r2.close!.save, '40 active min is saved');
  eq(r2.close!.points, 3, '40 active min alone = 3 (rule 2)');
  assert(r2.notice?.kind === 'expired' && r2.notice.saved, 'notice: saved');

  const short = S.pauseAt(newSession(90), T0 + 20 * MIN);
  const r3 = S.settleSession(short, short.pausedAt! + 31 * MIN);
  assert(r3.session === null && r3.close !== null && !r3.close.save, 'under 25 min: dropped, nothing to log');
  assert(r3.notice?.kind === 'expired' && !r3.notice.saved, 'notice: not saved');
  const at30 = S.settleSession(paused, p0 + 30 * MIN);
  assert(!at30.changed && S.canResume(paused, p0 + 30 * MIN), '30:00 paused: still resumable');
}

// --- 5. Running sessions count wall time: app closed, phone locked, device asleep ---
{
  const s = newSession(90);
  // Locked for 20 minutes in the middle (no tab alive from 30 to 50 min): all of it counts.
  const reopen = T0 + 50 * MIN;
  const back = S.settleSession(s, reopen);
  assert(!back.changed && back.session === s && back.notice === null, 'reopened before the end: nothing changes, no notice');
  eq(S.activeMinutesAt(s, reopen), 50, 'locked 20 min mid-session: all 50 wall minutes count');
  eq(S.remainingSeconds(s, reopen), 40 * 60, '40 min left after 50');
  // Away for hours, even past the old 30-minute window: still running, nothing closed early.
  const longAway = S.settleSession(s, T0 + 89 * MIN);
  assert(!longAway.changed && longAway.session?.isPaused === false, 'away 59 min (end not reached): still running');
  // Away past the planned end: it ends at the planned end with all its planned minutes.
  const later = T0 + 5 * 60 * MIN;
  assert(!S.settleSession(s, later).changed, 'settle leaves a running session to the end check');
  const endMs = S.sessionEndMs(s)!;
  eq(endMs, T0 + 90 * MIN, 'ends at the planned end');
  assert(S.remainingSeconds(s, later) === 0, 'time is up on reopen');
  const close = S.closeAt(s, endMs);
  eq(close.endMs, T0 + 90 * MIN, 'logged at the planned end, not at the reopen time');
  eq(close.activeMinutes, 90, '90 active min');
  eq(close.points, 7, 'finished 90 alone = 7 (rule 2, no finish bonus)');
  eq(close.milestonesAt.length, 7, 'all 7 milestones');
  eq(close.milestonesAt[0], T0 + 25 * MIN, '25-min mark at start + 25 min');
  eq(close.milestonesAt[6], T0 + 85 * MIN, '85-min mark at start + 85 min (not the reopen time)');
  const log = r1Log('away', T0, 90, 90, { createdAt: iso(later), milestonesAt: close.milestonesAt.map(iso) });
  eq(amount([log]), 10, 'mirror (legacy R1 row): the late upload of a finished 90 earns 10');
  eq(amount([{ ...log, pointsRule: 2 }]), 7, 'mirror (rule 2 row): the late upload of a finished 90 earns 7');
  // After a pause and resume, a later lock still counts and marks skip only the pause.
  let p = S.pauseAt(newSession(50), T0 + 10 * MIN);
  p = S.resumeAt(p, T0 + 20 * MIN); // 10 min paused
  const pc = S.closeAt(p, S.sessionEndMs(p)!);
  eq(pc.endMs, T0 + 60 * MIN, 'planned end moves by the pause only');
  eq(pc.points, 4, 'finished 50 alone = 4 (rule 2)');
  eq(pc.milestonesAt[0], T0 + 35 * MIN, '25-min mark = start + 25 + 10 paused');
}

// --- 6. Logout pauses; the same account resumes; another account never inherits ---
{
  store.clear();
  const s = newSession(90, 'user-a');
  assert(S.writeStoredSession('user-a', s), 'stored under user-a');
  const signOutAt = T0 + 30 * MIN + 5_000;
  S.pauseStoredSessionsForSignOut(signOutAt);
  const afterA = S.readStoredSession('user-a', signOutAt + 5 * MIN);
  assert(afterA !== null && afterA.isPaused, 'logout paused the session and kept it');
  eq(afterA!.pausedAt, signOutAt, 'pause stamped at sign-out');
  eq(S.activeMinutesAt(afterA!, signOutAt + 20 * MIN), 30, 'logged-out time does not count');
  assert(S.readStoredSession('user-b', signOutAt) === null, 'another account on this device sees nothing');
  // user-b starts its own session: user-a's stays.
  S.writeStoredSession('user-b', newSession(25, 'user-b'));
  assert(S.readStoredSession('user-a', signOutAt)?.id === 's1', "user-b's session never replaces user-a's");
  // Same account back within 30 min resumes from where it was.
  const resumed = S.resumeAt(afterA!, signOutAt + 10 * MIN);
  assert(S.canResume(afterA!, signOutAt + 10 * MIN), 'resumable 10 min after logout');
  eq(S.activeMinutesAt(resumed, signOutAt + 20 * MIN), 40, 'resumes from 30 active min');
  // A session stamped for user-a under user-b's key is not shown to user-b.
  store.set(S.focusStorageKey('user-b'), JSON.stringify({ ...s, userId: 'user-a' }));
  assert(S.readStoredSession('user-b', signOutAt) === null, 'a session of another account is never returned');
  // Logout after the app was closed for a while: the time until the sign-out counts.
  store.clear();
  S.writeStoredSession('user-a', newSession(90, 'user-a'));
  S.pauseStoredSessionsForSignOut(T0 + 50 * MIN);
  const late = S.readStoredSession('user-a', T0 + 50 * MIN);
  eq(late?.pausedAt, T0 + 50 * MIN, 'paused at the sign-out');
  eq(S.activeMinutesAt(late!, T0 + 70 * MIN), 50, 'credited up to the sign-out');
  // Logout after the planned end: left running, so the next sign-in ends it at the planned end.
  store.clear();
  S.writeStoredSession('user-a', newSession(25, 'user-a'));
  S.pauseStoredSessionsForSignOut(T0 + 40 * MIN);
  const over = S.readStoredSession('user-a', T0 + 40 * MIN);
  assert(over !== null && !over.isPaused, 'ended before the logout: left running');
  eq(S.closeAt(over!, S.sessionEndMs(over!)!).points, 2, 'ends at 25 min with 2 pts');
  // A break is dropped at logout.
  store.clear();
  S.writeStoredSession('user-a', { ...newSession(90, 'user-a'), id: 's1-break', mode: 'break' });
  S.pauseStoredSessionsForSignOut(T0 + 5 * MIN);
  assert(S.readStoredSession('user-a', T0 + 5 * MIN) === null, 'a break is dropped');
  // A pre-2026-11-04 session under the shared key is adopted by the signed-in account once.
  store.clear();
  store.set(S.FOCUS_STORAGE_KEY, JSON.stringify({ ...newSession(50), userId: undefined }));
  const adopted = S.readStoredSession('user-a', T0 + MIN);
  assert(adopted?.userId === 'user-a', 'legacy session adopted');
  assert(store.get(S.FOCUS_STORAGE_KEY) === undefined, 'legacy key removed');
  assert(S.readStoredSession('user-b', T0 + MIN) === null, 'not visible to another account after adoption');
  // Account deletion drops it.
  S.dropStoredSession('user-a');
  assert(S.readStoredSession('user-a', T0 + MIN) === null, 'account deletion drops the session');
}

console.log('focusPartialPoints: all assertions passed');
