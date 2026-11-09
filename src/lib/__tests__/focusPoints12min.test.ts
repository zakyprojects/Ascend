// Focus points rule 2 (Zakria 2026-11-09): 12 active minutes = 1 pt, the minutes of all of a day's
// rule-2 sessions added up, sessions from 25 min, cap 10, no finish bonus. Old rows (pointsRule
// unset) keep R1 / the old tiers inside the same day total. Mirror of
// supabase/migrations/20261109140000_focus_points_12min.sql (work/f12/pglite-test.mjs runs the same cases).
import type { FocusSessionLog, PointsEntry } from '@/types';

const P = await import('../focusPoints');
const A = await import('../focusAwards');
const S = await import('../focusSession');
const { focusSkillLogFor } = await import('../focusSkillLog');

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(a === b, `${msg} (got ${String(a)}, want ${String(b)})`);

const MIN = 60_000;
const DAY = '2026-11-09';
const PREV = '2026-11-08';
const at = (day: string, h: number, m = 0) => new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = at(DAY, 23, 59);
const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const MARKS = [25, 35, 45, 55, 65, 75, 85];

/** A rule-2 log: started at startMs, `active` minutes with no pause, planned `planned`. */
function r2(id: string, startMs: number, active: number, planned = active, extra: Partial<FocusSessionLog> = {}): FocusSessionLog {
  const endMs = startMs + active * MIN;
  return {
    id,
    date: localDay(endMs),
    taskName: 'Work',
    durationMinutes: active,
    pointsAwarded: 0,
    createdAt: iso(endMs),
    plannedMinutes: planned,
    startedAt: iso(startMs),
    milestonesAt: MARKS.filter((m) => m <= Math.min(active, planned)).map((m) => iso(startMs + m * MIN)),
    pointsRule: 2,
    ...extra,
  };
}
/** An R1 row (logged before the switch): the same shape without pointsRule. */
const r1 = (id: string, startMs: number, active: number, planned = active): FocusSessionLog => {
  const { pointsRule: _rule, ...log } = r2(id, startMs, active, planned);
  return log;
};
const legacy = (id: string, minutes: number, h: number, day = DAY): FocusSessionLog => ({
  id, date: day, taskName: 'Old', durationMinutes: minutes, pointsAwarded: 0, createdAt: iso(at(day, h)),
});
const award = (logs: FocusSessionLog[], day = DAY, existing?: PointsEntry | null, floor = false) =>
  A.computeFocusAwards(logs, day, at(day, 0), NOW, existing, { floor });
const amount = (logs: FocusSessionLog[], day = DAY, existing?: PointsEntry | null, floor = false) =>
  award(logs, day, existing, floor).entry?.amount ?? 0;

// --- 1. Constants and one session alone ---
eq(P.FOCUS_MINUTES_PER_POINT, 12, '12 min per point');
eq(P.FOCUS_DAILY_CAP, 10, 'cap 10');
eq(P.FOCUS_MIN_MINUTES, 25, 'sessions from 25 min');
const alone: Array<[number, number]> = [[24, 0], [25, 2], [36, 3], [50, 4], [60, 5], [75, 6], [90, 7], [100, 8], [120, 10], [130, 10], [600, 10]];
for (const [m, p] of alone) {
  eq(P.focusSessionAlonePoints(m), p, `alone ${m} min`);
  eq(amount([r2('a', at(DAY, 9), m)]), p, `mirror: one session of ${m} min`);
}
// Presets: 25 / 50 / 90 / 120 with their breaks; the chips show what each earns on its own.
eq(S.FOCUS_PRESETS.map((p) => `${p.focus}/${p.break}`).join(' '), '25/5 50/10 90/15 120/20', 'presets');
eq(S.FOCUS_PRESETS.map((p) => S.focusFinishedPoints(p.focus)).join(' '), '2 4 7 10', 'preset chips 2 / 4 / 7 / 10');
eq(P.FOCUS_RULE_SHORT, '1 pt per 12 min of focus, from 25 min, up to 10 a day', 'rule line');

// --- 2. Minutes add up across the day's sessions ---
eq(amount([r2('a', at(DAY, 9), 30), r2('b', at(DAY, 14), 30)]), 5, '30 + 30 = 60 min = 5 (not 2 + 2)');
eq(amount([r2('a', at(DAY, 9), 25), r2('b', at(DAY, 14), 25)]), 4, '25 + 25 = 50 min = 4');
eq(amount([r2('a', at(DAY, 9), 20), r2('b', at(DAY, 11), 20), r2('c', at(DAY, 14), 20)]), 0, '3 × 20: each under 25, nothing');
eq(amount([r2('a', at(DAY, 9), 20), r2('b', at(DAY, 14), 40)]), 3, 'a forged 20 adds nothing; 40 alone = 3');
eq(amount([r2('a', at(DAY, 9), 50), r2('b', at(DAY, 11), 25)]), 6, '50 + 25 = 75 min = 6');
{
  const five = [9, 10, 11, 12, 13].map((h, i) => r2(`s${i}`, at(DAY, h), 25));
  const res = award(five);
  eq(res.entry?.amount, 10, '5 × 25 = 125 min: capped at 10');
  eq([...res.sessionPoints.values()].join(' '), '2 2 2 2 2', 'shares in time order: 25→2, 50→4, 75→6, 100→8, 125→10');
  const six = award([...five, r2('s5', at(DAY, 15), 25)]);
  eq(six.entry?.amount, 10, 'a 6th session: still 10');
  eq(six.sessionPoints.get('s5'), 0, 'the 6th session gets 0');
  eq(res.entry?.reason, 'Focus sessions (5)', 'session count');
}
{
  // Shares follow the remainder: 30 → 2, then 30 more → 5 total, so the second gets 3.
  const res = award([r2('a', at(DAY, 9), 30), r2('b', at(DAY, 14), 30)]);
  eq(res.sessionPoints.get('a'), 2, 'first 30 = 2');
  eq(res.sessionPoints.get('b'), 3, 'second 30 carries the 6 leftover minutes: +3');
  eq(res.entry?.timestamp, iso(at(DAY, 9, 30)), 'row stamped at the first earning part (the end of the first session)');
}

// --- 3. Credited minutes: paused time never counts, wall clock and plan bound it ---
eq(amount([r2('f', at(DAY, 9), 90, 90, { createdAt: iso(at(DAY, 9, 30)) })]), 2, 'forged 90 in 30 wall min = 30 credited = 2');
eq(amount([r2('g', at(DAY, 9), 90, 90, { startedAt: iso(at(DAY, 11)) })]), 0, 'start after end = 0');
eq(amount([r2('h', at(DAY, 9), 200, 90)]), 7, 'active above the plan is capped at the plan (90 = 7)');
eq(amount([r2('e', at(DAY, 9), 40, 90)]), 3, 'completed early: 40 of 90 = 40 min = 3, no bonus');
{
  // No plan (only very old builds): duration on its date.
  const { plannedMinutes: _p, startedAt: _s, milestonesAt: _m, ...noPlan } = r2('np', at(DAY, 9), 60);
  eq(amount([noPlan]), 5, 'rule-2 row without a plan: 60 = 5 on its date');
}
// Custom lengths under 25 can never earn; the chip shows 0.
eq(S.focusFinishedPoints(20), 0, 'custom 20: 0 pts');
eq(S.focusFinishedPoints(75), 6, 'custom 75: 6 pts');

// --- 4. Mixed day: old-rule rows keep their points inside the total ---
eq(amount([r1('o', at(DAY, 8), 50, 50), r1('p', at(DAY, 10), 50, 50), r2('n', at(DAY, 14), 30)]), 10, 'R1 10 today + new 30 = still 10');
eq(amount([r1('o', at(DAY, 8), 45, 50), r2('n', at(DAY, 14), 30)]), 6, 'R1 45/50 (4) + new 30 (2) = 6');
eq(amount([legacy('l', 50, 8), r2('n', at(DAY, 14), 36)]), 8, 'old tier 50 (5) + new 36 (3) = 8');
eq(amount([r1('o', at(DAY, 8), 90, 90)]), 10, 'an R1 finished 90 stays 10');
eq(amount([r1('o', at(DAY, 8), 90, 90), r2('n', at(DAY, 14), 50)]), 10, 'R1 10 + more sessions: cap');
{
  const res = award([r1('o', at(DAY, 8), 45, 50), r2('n', at(DAY, 14), 30), r2('m', at(DAY, 16), 30)]);
  eq(res.entry?.amount, 9, 'R1 4 + floor(60/12) 5 = 9');
  eq(res.sessionPoints.get('o'), 4, 'R1 share 4');
  eq(res.sessionPoints.get('n'), 2, 'first new 30 = 2');
  eq(res.sessionPoints.get('m'), 3, 'second new 30 = 3');
}
// Tally (the timer's base).
{
  const t = A.focusDayTally([r1('o', at(DAY, 8), 45, 50), r2('n', at(DAY, 14), 30), r2('x', at(DAY, 16), 20), legacy('l', 25, 7, PREV)], DAY);
  eq(t.fixedPoints, 4, 'tally: R1 points');
  eq(t.minutes, 30, 'tally: rule-2 minutes (the 20 adds none, yesterday not counted)');
}

// --- 5. Timer preview: gain, next point, cap ---
{
  const empty = { fixedPoints: 0, minutes: 0 };
  eq(P.focusDayGain(24, empty), 0, 'gain under 25 = 0');
  eq(P.focusDayGain(25, empty), 2, 'gain at 25 = 2');
  eq(P.nextFocusReward(10, 90, empty)?.atMinutes, 25, 'next at 25 before the minimum');
  eq(P.nextFocusReward(10, 90, empty)?.points, 2, '+2 at 25');
  eq(P.nextFocusReward(25, 90, empty)?.atMinutes, 36, 'after 25: next at 36');
  eq(P.nextFocusReward(25, 90, empty)?.points, 1, '+1 at 36');
  eq(P.nextFocusReward(84, 120, empty)?.atMinutes, 96, 'at 84 (7 pts): next point at 96');
  assert(P.nextFocusReward(84, 90, empty) === null, '96 is past the 90 plan: no next point');
  eq(P.nextFocusReward(10, 20, empty), null, 'a 20-min plan never earns');
  // S10: today 30 min done, the new session at 25 min: "+2 so far · next +1 at 30 min".
  const t30 = { fixedPoints: 0, minutes: 30 };
  eq(P.focusDayGain(25, t30), 2, 'S10: 30 + 25 = 55 → 4, gain 2');
  eq(P.nextFocusReward(25, 50, t30)?.atMinutes, 30, 'S10: next at 30 (30 + 30 = 60)');
  eq(P.focusDayGain(25, { fixedPoints: 0, minutes: 11 }), 3, 'leftover minutes: 11 + 25 = 36 → +3');
  // Cap.
  eq(P.focusDayGain(50, { fixedPoints: 0, minutes: 120 }), 0, 'at the cap: gain 0');
  eq(P.nextFocusReward(30, 90, { fixedPoints: 0, minutes: 120 }), null, 'at the cap: no next point');
  eq(P.focusDayGain(90, { fixedPoints: 9, minutes: 0 }), 1, 'room 1: gain 1 (Today’s max)');
  eq(P.focusDayGain(120, { fixedPoints: 4, minutes: 30 }), 4, 'R1 4 + 30 min (2) → +120 min: up to 10, gain 4');
}

// --- 6. Midnight: minutes before midnight count on the day before ---
{
  const cross = r2('m', at(PREV, 23, 40), 40); // 23:40 → 00:20, no pause: 20 + 20
  eq(cross.date, DAY, 'dated the end day');
  eq(A.focusLogParts(cross).map((p) => `${p.day}:${p.minutes}`).join(' '), `${PREV}:20 ${DAY}:20`, 'split 20 / 20');
  eq(amount([cross], DAY), 1, 'today: 20 min = 1 (the 25-min minimum is checked on the whole session)');
  eq(amount([cross], PREV, null, true), 1, 'yesterday (floor): 20 min = 1');
  eq(A.focusFloorDay(cross, DAY), PREV, 'raises yesterday');
  // With marks: 23:20 start, 90 min, no pause: 40 min before midnight (between the 35 and 45 marks).
  const long = r2('l', at(PREV, 23, 20), 90);
  eq(A.focusLogParts(long).map((p) => `${p.day}:${p.minutes}`).join(' '), `${PREV}:40 ${DAY}:50`, 'split 40 / 50');
  // A pause inside the stretch before midnight: start 23:50, 5 min, pause 23:55 → 00:10, end 00:45
  // (5 + 35 = 40 active, 25-min mark at 00:30). Last checkpoint before midnight = the start; the
  // next is the 25-min mark, so the 10 wall minutes to midnight count (the 5 paused ones included).
  const paused = r2('p', at(PREV, 23, 50), 40, 90, { createdAt: iso(at(DAY, 0, 45)), milestonesAt: [iso(at(DAY, 0, 30))] });
  eq(A.creditedFocusMinutes(paused), 40, 'paused session: 40 credited');
  eq(A.focusLogParts(paused).map((p) => `${p.day}:${p.minutes}`).join(' '), `${PREV}:10 ${DAY}:30`, 'interpolated split 10 / 30');
  const total = A.focusLogParts(paused).reduce((n, p) => n + p.minutes, 0);
  eq(total, 40, 'parts add up to the credited minutes');
  // Bad marks are skipped (not moved to the end): split from the start and the end only.
  const bad = r2('b', at(PREV, 23, 20), 90, 90, { milestonesAt: [iso(at(PREV, 23, 21)), iso(at(PREV, 23, 22))] });
  eq(A.focusLogParts(bad).map((p) => `${p.day}:${p.minutes}`).join(' '), `${PREV}:40 ${DAY}:50`, 'too-early marks ignored; start → end gives 40 / 50');
  // Floor never lowers yesterday; adds to its live rows up to the cap.
  const high: PointsEntry = { id: `focus_award_${PREV}`, amount: 9, reason: 'x', source: 'focus', timestamp: iso(at(PREV, 10)) };
  eq(amount([cross], PREV, high, true), 9, 'floor: 1 < stored 9, kept');
  eq(amount([long, r1('y', at(PREV, 9), 50, 50)], PREV, high, true), 9, 'R1 5 + 40 min (3) = 8 < 9: kept at 9');
  eq(amount([long, r1('y', at(PREV, 9), 90, 90)], PREV, high, true), 10, 'R1 10 + 40 min: raised to the cap 10');
  // Started two days before the end: one part on the end day (never an older day).
  const old = r2('o', at('2026-11-07', 23, 0), 90, 90, { date: DAY, createdAt: iso(at(DAY, 0, 30)) });
  eq(A.focusLogParts(old).map((p) => p.day).join(' '), DAY, 'start older than yesterday: all on the end day');
}
// Late arrival: a session that ended yesterday raises yesterday only (floor), older days never.
{
  const late = r2('late', at(PREV, 21), 90);
  eq(late.date, PREV, 'dated yesterday');
  eq(A.focusFloorDay(late, DAY), PREV, 'raises yesterday');
  eq(amount([late], PREV, null, true), 7, 'yesterday gets 7 (floor)');
  eq(amount([late], DAY), 0, 'today nothing');
  eq(A.focusFloorDay(r2('o2', at('2026-11-07', 21), 90), DAY), null, 'two days old: never raised');
  eq(A.focusFloorDay(r2('t', at(DAY, 9), 90), DAY), null, 'a session of today alone: no floor');
  eq(A.focusFloorDay(r2('u', at(PREV, 21), 20, 30), DAY), null, 'under 25: nothing to raise');
}

// --- 7. Delete today's session recounts today ---
{
  const a = r2('a', at(DAY, 9), 30);
  const b = r2('b', at(DAY, 14), 30);
  eq(amount([a, b]), 5, 'both: 5');
  eq(amount([b]), 2, 'after deleting one: 30 min = 2');
}

// --- 8. Session close and skill log stay the same ---
{
  const s = { id: 's1', mode: 'focus' as const, taskName: 'Work', focusMinutes: 90, breakMinutes: 15, isCustom: false, startTime: at(DAY, 9),
    plannedDurationSeconds: 90 * 60, isPaused: false, pausedRemainingSeconds: 90 * 60, userId: 'u', startedAt: at(DAY, 9), pausedAt: null, marksAt: [] };
  const close = S.closeAt(s, at(DAY, 10, 30));
  eq(close.activeMinutes, 90, 'finished 90');
  eq(close.points, 7, 'closeAt: 90 alone = 7');
  eq(close.milestonesAt.length, 7, 'marks still recorded (25..85)');
  const s120 = { ...s, focusMinutes: 120, plannedDurationSeconds: 120 * 60, pausedRemainingSeconds: 120 * 60 };
  eq(S.closeAt(s120, at(DAY, 11)).points, 10, 'closeAt: 120 alone = 10');
  // The tagged skill still gets its practice log from the credited minutes (focusSkillLog unchanged).
  const log = r2('focus_x', at(DAY, 9), 50, 50, { skillId: 'sk1' });
  const skill = { id: 'sk1', name: 'Python', createdAt: iso(at(PREV, 9)) } as unknown as Parameters<typeof focusSkillLogFor>[1][number];
  const sl = focusSkillLogFor(log, [skill], [], []);
  eq(sl?.durationMinutes, 50, 'skill log gets the 50 credited minutes');
  eq(A.creditedFocusMinutes(log), 50, 'creditedFocusMinutes unchanged');
}

// --- 9. pointsRule from the server; never uploaded ---
{
  const { SYNCED_COLLECTIONS } = await import('../sync/syncedCollections');
  const focus = SYNCED_COLLECTIONS.find((c) => c.table === 'focus_logs')!;
  const base = { id: 'f', log_date: DAY, task_name: 'W', duration_minutes: 30, points_awarded: 2, created_at: iso(at(DAY, 9)) };
  eq((focus.fromRow({ ...base, points_rule: 2 }) as FocusSessionLog).pointsRule, 2, 'points_rule 2 → pointsRule 2');
  eq((focus.fromRow({ ...base, points_rule: null }) as FocusSessionLog).pointsRule, undefined, 'points_rule null → unset (old rule)');
  const row = focus.toRow(r2('f', at(DAY, 9), 30) as never) as Record<string, unknown>;
  assert(!('points_rule' in row), 'points_rule is never uploaded');
}

console.log('focusPoints12min: all assertions passed');
