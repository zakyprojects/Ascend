// Fixtures for skill drills (Zakria 2026-11-04): counts on practice logs per named drill, minutes
// stay required and are the only thing that earns points, a weekly goal counts one drill through
// linkedMetricKey 'drill_count:<drillId>' (linkedItemId = the skill).
import { DEFAULT_STATE, type AppState, type Skill, type SkillSessionLog, type WeeklyGoal, type WeeklyGoalItem } from '@/types';
import {
  DRILL_COUNT_MAX,
  DRILLS_PER_SKILL_MAX,
  cleanDrillCounts,
  drillCountInLogs,
  drillMetricKey,
  drillNameProblem,
  drillTotal,
  foldClearedCounts,
  isDrillGoal,
  isValidDrillCount,
  keepValidDrillCounts,
  logDrillCount,
  normalizeDrillUnit,
  parseDrillMetricKey,
  addLogDrills,
  prepareLogDrills,
} from '../content/skillDrills';
import { LINKED_GOAL_METRICS, computeLinkedGoalProgress, linkedGoalCrossing, linkedGoalUnit, linkedItemExists } from '../items/linkedGoalMetrics';
import { computeSkillAwards } from '../points/skillAwards';
import { mergeAppState } from '../store/stateMerger';
import { getWeekDates, weekKey } from '../time/dates';
import { reconcileLinkedWeeklyGoals } from '../points/weeklyGoalPoints';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// A Wednesday at noon, local time (the tests run in two time zones).
const NOW = new Date(2026, 10, 4, 12, 0, 0);
const WEEK = weekKey(NOW);
const { dateStrings: DAYS } = getWeekDates(WEEK);
const MON = DAYS[0];
const TUE = DAYS[1];
const WED = DAYS[2];
const LAST_WEEK_SUN = getWeekDates(weekKey(new Date(2026, 10, 1, 12, 0, 0))).dateStrings[6];
const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString();

const T0 = '2026-10-20T10:00:00.000Z';
const guitar = (extra: Partial<Skill> = {}): Skill => ({
  id: 'g',
  name: 'Guitar',
  createdAt: T0,
  drills: [
    { id: 'scales', name: 'Scales', unit: 'reps', createdAt: T0 },
    { id: 'chords', name: 'Chords', unit: 'times', createdAt: T0 },
    { id: 'old', name: 'Arpeggios', unit: 'reps', createdAt: T0, deletedAt: T0 },
  ],
  ...extra,
});
const log = (id: string, date: string, hour: number, counts?: SkillSessionLog['counts'], skillId = 'g', minutes = 30): SkillSessionLog => ({
  id,
  skillId,
  date,
  durationMinutes: minutes,
  note: '',
  pointsAwarded: 0,
  ...(counts ? { counts } : {}),
  createdAt: at(date, hour),
});
const goal = (extra: Partial<WeeklyGoalItem> = {}): WeeklyGoalItem => ({
  id: 'goal1',
  title: 'Guitar: Scales',
  priority: 'medium',
  linkedModule: 'skill',
  linkedItemId: 'g',
  linkedMetricKey: drillMetricKey('scales'),
  targetValue: 50,
  completed: false,
  createdAt: at(MON, 1),
  ...extra,
});
const state = (overrides: Partial<AppState>): AppState => ({ ...DEFAULT_STATE, ...overrides }) as AppState;

// 1. Metric key: 'drill_count:<id>' round trip; anything else is not a drill metric.
{
  assert(drillMetricKey('abc') === 'drill_count:abc', 'key format');
  assert(parseDrillMetricKey('drill_count:abc') === 'abc', 'parse id');
  assert(parseDrillMetricKey('drill_count:') === null, 'empty id is not a drill');
  assert(parseDrillMetricKey('minutes_practiced') === null, 'other metric');
  assert(parseDrillMetricKey(undefined) === null, 'no key');
  // Old builds look the stored key up in this list; it must never match one of them.
  assert(!LINKED_GOAL_METRICS.skill.some((m) => m.key.startsWith('drill_count')), 'drill metric is not a static skill metric');
}

// 2. Counts: whole numbers 1–9,999 per drill per log.
{
  assert(DRILL_COUNT_MAX === 9999, 'config: 9,999 per drill per log');
  for (const ok of [1, 50, 9999]) assert(isValidDrillCount(ok), `${ok} is valid`);
  for (const bad of [0, -1, 2.5, 10000, NaN, Infinity, '5', null]) assert(!isValidDrillCount(bad), `${String(bad)} is not valid`);
}

// 3. Log form rows: live drills of the skill, one row per drill, valid counts.
{
  const skill = guitar();
  const ok = cleanDrillCounts([{ drillId: 'scales', count: 50 }, { drillId: 'chords', count: 20 }], skill);
  assert(ok.counts?.length === 2 && ok.counts[0].count === 50, 'two drills in one session');
  const unknown = cleanDrillCounts([{ drillId: 'nope', count: 5 }], skill);
  assert(unknown.problem?.field === 'drill' && unknown.problem.index === 0, 'unknown drill refused on the drill field');
  const deleted = cleanDrillCounts([{ drillId: 'old', count: 5 }], skill);
  assert(deleted.problem?.field === 'drill', 'deleted drill refused');
  const dup = cleanDrillCounts([{ drillId: 'scales', count: 5 }, { drillId: 'scales', count: 6 }], skill);
  assert(dup.problem?.field === 'drill' && dup.problem.index === 1, 'same drill twice refused on the second row');
  for (const count of [0, 10000, 2.5, null]) {
    const r = cleanDrillCounts([{ drillId: 'scales', count }], skill);
    assert(r.problem?.field === 'count', `count ${String(count)} refused on the count field`);
  }
  assert(cleanDrillCounts([], skill).counts?.length === 0, 'no rows = no counts (counts are optional)');
  // The store's own filter (a writer that can't show a problem) keeps the same rules.
  const kept = keepValidDrillCounts(
    [{ drillId: 'scales', count: 5 }, { drillId: 'scales', count: 7 }, { drillId: 'old', count: 3 }, { drillId: 'chords', count: 0 }],
    skill
  );
  assert(kept.length === 1 && kept[0].drillId === 'scales' && kept[0].count === 5, 'store keeps first valid row of live drills');
}

// 4. Drill names: unique per skill among live drills (case and spaces ignored); a deleted drill's name is free.
{
  const skill = guitar();
  assert(drillNameProblem('   ', skill) === 'Fill in this field.', 'empty name');
  assert(drillNameProblem('  scales ', skill) === 'You already have a count with this name.', 'duplicate (case, spaces)');
  assert(drillNameProblem('Scales', skill, 'scales') === null, 'a drill keeps its own name');
  assert(drillNameProblem('Chords', skill, 'scales') !== null, 'rename onto another drill refused');
  assert(drillNameProblem('Arpeggios', skill) === null, "deleted drill's name is free again");
  const full: Skill = guitar({
    drills: Array.from({ length: DRILLS_PER_SKILL_MAX }, (_, i) => ({ id: `d${i}`, name: `D${i}`, unit: 'reps', createdAt: T0 })),
  });
  assert(drillNameProblem('One more', full) !== null, 'cap on live drills');
  assert(drillNameProblem('D0 renamed', full, 'd0') === null, 'renaming at the cap is fine');
  assert(normalizeDrillUnit('') === 'reps' && normalizeDrillUnit('  times ') === 'times', 'unit default + trim');
  assert(normalizeDrillUnit('x'.repeat(30)).length === 16, 'unit cut to 16');
}

// 5. Totals: this week's logs, all-time logs + clearedCount; bad entries and other skills ignored.
{
  const skill = guitar({ drills: [{ id: 'scales', name: 'Scales', unit: 'reps', createdAt: T0, clearedCount: 20 }] });
  const logs = [
    log('a', MON, 9, [{ drillId: 'scales', count: 30 }]),
    log('b', TUE, 9, [{ drillId: 'scales', count: 25 }, { drillId: 'scales', count: 99 }]),
    log('c', TUE, 10, [{ drillId: 'scales', count: -3 }]),
    log('d', TUE, 11, [{ drillId: 'scales', count: 40 }], 'other-skill'),
    log('e', LAST_WEEK_SUN, 9, [{ drillId: 'scales', count: 7 }]),
  ];
  assert(logDrillCount(logs[1], 'scales') === 25, 'first valid row of a drill counts');
  assert(logDrillCount(logs[2], 'scales') === 0, 'negative count ignored');
  const week = logs.filter((l) => DAYS.includes(l.date));
  assert(drillCountInLogs(week, 'g', 'scales') === 55, 'week count = this week, this skill');
  assert(drillTotal(skill, logs, 'scales') === 20 + 30 + 25 + 7, 'total = cleared + every log of the skill');
}

// 6. Deleting / clearing earlier-day logs: counts move to clearedCount, so totals never drop.
{
  const skill = guitar();
  const logs = [log('a', LAST_WEEK_SUN, 9, [{ drillId: 'scales', count: 30 }, { drillId: 'chords', count: 4 }]), log('b', LAST_WEEK_SUN, 10, [{ drillId: 'scales', count: 5 }])];
  const before = drillTotal(skill, logs, 'scales');
  const folded = foldClearedCounts([skill], logs, '2026-11-04T07:00:00.000Z');
  const after = drillTotal(folded[0], [], 'scales');
  assert(before === 35 && after === 35, 'scales total holds after clearing');
  assert(drillTotal(folded[0], [], 'chords') === 4, 'chords total holds');
  assert(folded[0].updatedAt === '2026-11-04T07:00:00.000Z', 'skill doc stamped (merges on real edit time)');
  const plain: Skill = { id: 'p', name: 'Piano', createdAt: T0 };
  const same = foldClearedCounts([plain], [log('x', LAST_WEEK_SUN, 9, undefined, 'p')], '2026-11-04T07:00:00.000Z');
  assert(same[0] === plain, 'skill without counts unchanged (same object)');
}

// 7. Points: only minutes count. A log with counts earns exactly what the same minutes earn.
{
  const dayStart = new Date(`${WED}T00:00:00`).getTime();
  const nowMs = dayStart + 20 * 3600_000;
  const plain = computeSkillAwards([log('p', WED, 9)], [guitar()], WED, dayStart, nowMs);
  const counted = computeSkillAwards([log('p', WED, 9, [{ drillId: 'scales', count: 9999 }])], [guitar()], WED, dayStart, nowMs);
  assert(plain.entry?.amount === 2 && counted.entry?.amount === 2, '30 min = 2 pts with or without counts');
}

// 8. Weekly goal on a drill: progress, unit, crossing; the other drill and other weeks don't move it.
{
  const logs = [
    log('l1', MON, 9, [{ drillId: 'scales', count: 30 }]),
    log('l2', TUE, 9, [{ drillId: 'chords', count: 100 }]),
    log('l3', WED, 9, [{ drillId: 'scales', count: 25 }, { drillId: 'chords', count: 5 }]),
    log('l4', LAST_WEEK_SUN, 9, [{ drillId: 'scales', count: 500 }]),
    log('l5', TUE, 10, [{ drillId: 'scales', count: 500 }], 'other-skill'),
  ];
  const st = state({ skills: [guitar()], skillLogs: logs });
  const g = goal();
  const prog = computeLinkedGoalProgress(g, st, DAYS);
  assert(!prog.needsMetricSelection && prog.current === 55 && prog.percent === 100 && prog.unit === 'reps', 'scales 55/50 reps = done');
  assert(linkedGoalCrossing(g, st, DAYS)?.id === 'l3', 'crossing = the log whose running total reached 50');
  const chordsGoal = goal({ linkedMetricKey: drillMetricKey('chords'), targetValue: 200 });
  const chords = computeLinkedGoalProgress(chordsGoal, st, DAYS);
  assert(chords.current === 105 && chords.unit === 'times' && chords.percent === 53, 'chords counts only chords, in its unit');
  assert(linkedGoalCrossing(chordsGoal, st, DAYS) === undefined, 'not reached = no crossing');
  // Unit reads live: a renamed unit shows at once.
  const renamed = state({ skills: [guitar({ drills: [{ id: 'scales', name: 'Major scales', unit: 'runs', createdAt: T0 }] })] });
  assert(linkedGoalUnit(g, renamed) === 'runs', 'unit follows the drill by id');
}

// 9. Unknown / missing / deleted drill.
{
  const st = state({ skills: [guitar()], skillLogs: [log('l1', MON, 9, [{ drillId: 'old', count: 60 }])] });
  const unknown = computeLinkedGoalProgress(goal({ linkedMetricKey: drillMetricKey('not-synced-yet') }), st, DAYS);
  assert(unknown.needsMetricSelection === true, 'drill not on this device = metric not known (never reconciled)');
  const noSkill = computeLinkedGoalProgress(goal({ linkedItemId: 'gone' }), st, DAYS);
  assert(noSkill.needsMetricSelection === true, 'skill missing = metric not known');
  assert(!linkedItemExists(goal({ linkedItemId: 'gone' }), st), 'skill missing = dead link');
  const deletedGoal = goal({ linkedMetricKey: drillMetricKey('old') });
  assert(!linkedItemExists(deletedGoal, st), 'deleted drill = dead link');
  assert(computeLinkedGoalProgress(deletedGoal, st, DAYS).current === 60, 'deleted drill still shows its recorded counts');
  assert(linkedItemExists(goal(), st), 'live drill = live link');
  assert(linkedItemExists(goal({ linkedMetricKey: 'minutes_practiced' }), st), 'plain skill goals unchanged');
  assert(isDrillGoal(goal(), 'g', 'scales') && !isDrillGoal(goal(), 'g', 'chords') && !isDrillGoal(goal({ linkedModule: 'habit' }), 'g', 'scales'), 'isDrillGoal');
}

// 10. Auto-complete through the store's reconcile: ticks at the crossing log, unticks when it is deleted here.
{
  const doc: WeeklyGoal = { id: 'w', weekKey: WEEK, goals: [goal()], createdAt: at(MON, 1) };
  const logs = [log('l1', MON, 9, [{ drillId: 'scales', count: 30 }]), log('l2', TUE, 9, [{ drillId: 'scales', count: 20 }])];
  const ticked = reconcileLinkedWeeklyGoals(state({ skills: [guitar()], skillLogs: logs, weeklyGoals: [doc] }), NOW);
  const g = ticked.weeklyGoals[0].goals[0];
  assert(g.completed === true && g.completedByLogId === 'l2', 'reaches 50 at l2 and ticks');
  assert(g.completedAt === at(TUE, 9), 'achieved at the crossing log');

  // Deleted here (tombstoned): unticks.
  const deleted = reconcileLinkedWeeklyGoals({ ...ticked, skillLogs: [logs[0]], deletedEntityIds: ['l2'] }, NOW);
  assert(deleted.weeklyGoals[0].goals[0].completed === false, 'deleting the crossing log unticks');

  // Not on this device and not deleted here (another device's log not pulled yet): stays ticked.
  const notPulled = reconcileLinkedWeeklyGoals({ ...ticked, skillLogs: [logs[0]], deletedEntityIds: [] }, NOW);
  assert(notPulled.weeklyGoals[0].goals[0].completed === true, 'a log this device never had does not untick');

  // A drill goal this device can't resolve is never touched.
  const unknownDoc: WeeklyGoal = { ...doc, goals: [goal({ linkedMetricKey: drillMetricKey('later'), completed: true })] };
  const untouched = reconcileLinkedWeeklyGoals(state({ skills: [guitar()], skillLogs: [], weeklyGoals: [unknownDoc] }), NOW);
  assert(untouched.weeklyGoals[0].goals[0].completed === true, 'unknown drill goal left as it is');
}

// 11. Merge keeps drills and counts; a stale skill copy without drills loses to the newer doc.
{
  const newer = guitar({ updatedAt: '2026-11-04T06:00:00.000Z' });
  const stale: Skill = { id: 'g', name: 'Guitar', createdAt: T0 };
  const counted = log('l1', WED, 9, [{ drillId: 'scales', count: 50 }]);
  const local = state({ skills: [newer], skillLogs: [counted] });
  const remote = state({ skills: [stale], skillLogs: [{ ...counted }] });
  for (const [base, incoming, label] of [
    [local, remote, 'local newer'],
    [remote, local, 'incoming newer'],
  ] as const) {
    const merged = mergeAppState(base, incoming);
    const skill = merged.skills.find((s) => s.id === 'g');
    assert((skill?.drills?.length ?? 0) === 3, `${label}: drills kept`);
    assert(logDrillCount(merged.skillLogs.find((l) => l.id === 'l1')!, 'scales') === 50, `${label}: log counts kept`);
  }
  // An old app spreads the skill when it writes it ({ ...s, manualLevel }), so drills ride along.
  const oldClientWrite = { ...newer, manualLevel: 'advanced' as const, updatedAt: '2026-11-04T07:00:00.000Z' };
  const merged = mergeAppState(local, state({ skills: [oldClientWrite], skillLogs: [counted] }));
  assert(merged.skills[0].manualLevel === 'advanced' && merged.skills[0].drills?.length === 3, 'spread write keeps drills');
}

// 12. New drills while logging practice (Zakria 2026-11-04 rework): the Log practice form names a
// new drill and its count in one save; the drill joins the skill and the count goes on the log.
{
  const skill = guitar();
  const bare: Skill = { id: 'p', name: 'Piano', createdAt: T0 };
  const range = 'Enter a whole number from 1 to 9,999.';

  // Empty rows (no count, no name) = a minutes-only log.
  const none = prepareLogDrills([{ drillId: null, name: '  ', unit: 'reps', count: null }], bare);
  assert(none.counts?.length === 0 && none.newDrills?.length === 0, 'empty new row = no drill');
  const noneExisting = prepareLogDrills([{ drillId: 'scales', count: null }], skill);
  assert(noneExisting.counts?.length === 0, 'existing drill without count = not logged');

  // A new drill on a skill without drills: trimmed name, unit default, count kept.
  const one = prepareLogDrills([{ drillId: null, name: '  Hanon   exercises ', unit: '  ', count: 30 }], bare);
  assert(one.newDrills?.length === 1 && one.newDrills[0].name === 'Hanon exercises', 'new name trimmed');
  assert(one.newDrills?.[0].unit === 'reps' && one.newDrills[0].count === 30, 'empty unit = reps, count kept');

  // Name without count / count without name: errors on the missing field.
  const noCount = prepareLogDrills([{ drillId: null, name: 'Scales', unit: 'reps', count: null }], bare);
  assert(noCount.problem?.field === 'count' && noCount.problem.message === 'Enter 1 or more.', 'name without count refused on count');
  const noName = prepareLogDrills([{ drillId: null, name: '', unit: 'reps', count: 5 }], bare);
  assert(noName.problem?.field === 'name' && noName.problem.message === 'Fill in this field.', 'count without name refused on name');
  for (const count of [0, 10000, 2.5]) {
    const r = prepareLogDrills([{ drillId: null, name: 'Scales', unit: 'reps', count }], bare);
    assert(r.problem?.field === 'count' && r.problem.message === range, `new drill count ${count} refused`);
  }

  // Names: unique among live drills (case/spaces ignored) and among the new rows; deleted names free.
  const dupLive = prepareLogDrills([{ drillId: null, name: ' scales ', unit: 'reps', count: 5 }], skill);
  assert(dupLive.problem?.field === 'name' && dupLive.problem.message === 'You already have a count with this name.', 'new name of a live drill refused');
  const dupNew = prepareLogDrills(
    [
      { drillId: null, name: 'Riffs', unit: 'reps', count: 5 },
      { drillId: null, name: ' RIFFS', unit: 'times', count: 6 },
    ],
    skill
  );
  assert(dupNew.problem?.field === 'name' && dupNew.problem.index === 1, 'two new rows with one name refused on the second');
  const reuse = prepareLogDrills([{ drillId: null, name: 'Arpeggios', unit: 'reps', count: 5 }], skill);
  assert(reuse.newDrills?.length === 1, "a deleted drill's name can be a new drill");
  const long = prepareLogDrills([{ drillId: null, name: 'x'.repeat(60), unit: 'y'.repeat(30), count: 5 }], bare);
  assert(long.newDrills?.[0].name.length === 40 && long.newDrills[0].unit.length === 16, 'name and unit cut to their lengths');
  const nearFull: Skill = guitar({
    drills: Array.from({ length: DRILLS_PER_SKILL_MAX - 1 }, (_, i) => ({ id: `d${i}`, name: `D${i}`, unit: 'reps', createdAt: T0 })),
  });
  const overCap = prepareLogDrills(
    [
      { drillId: null, name: 'Last one', unit: 'reps', count: 1 },
      { drillId: null, name: 'Too many', unit: 'reps', count: 1 },
    ],
    nearFull
  );
  assert(overCap.problem?.field === 'name' && overCap.problem.index === 1, 'cap counts the new rows above');

  // Existing and new rows mix; the same existing drill twice is still refused.
  const mixed = prepareLogDrills(
    [
      { drillId: 'scales', count: 50 },
      { drillId: null, name: 'Riffs', unit: 'times', count: 12 },
      { drillId: 'chords', count: null },
    ],
    skill
  );
  assert(mixed.counts?.length === 1 && mixed.counts[0].drillId === 'scales' && mixed.newDrills?.length === 1, 'existing + new rows');
  const twice = prepareLogDrills([{ drillId: 'scales', count: 5 }, { drillId: 'scales', count: 6 }], skill);
  assert(twice.problem?.field === 'drill' && twice.problem.index === 1, 'same existing drill twice refused');

  // The store's step: the new drill joins the skill with its id, the count goes on the log with that id.
  const nowIso = '2026-11-04T07:00:00.000Z';
  const made = [{ drill: { id: 'riffs', name: 'Riffs', unit: 'times', createdAt: nowIso }, count: 12 }];
  const grown = addLogDrills(skill, made, nowIso);
  assert(grown.skill?.drills?.some((d) => d.id === 'riffs' && d.name === 'Riffs' && d.unit === 'times') === true, 'drill added to the skill');
  assert(grown.skill?.updatedAt === nowIso && grown.skill.drills?.length === 4, 'skill stamped, old drills kept');
  assert(grown.counts?.length === 1 && grown.counts[0].drillId === 'riffs' && grown.counts[0].count === 12, 'count saved with the new drill id');
  const kept = keepValidDrillCounts([...(mixed.counts || []), ...(grown.counts || [])], grown.skill!);
  assert(kept.length === 2 && kept[1].drillId === 'riffs', "the log keeps both counts against the grown skill");
  const logged = log('l-new', WED, 10, kept);
  assert(drillTotal(grown.skill!, [logged], 'riffs') === 12 && logDrillCount(logged, 'scales') === 50, 'totals read the new drill');
  // A name another write took in between: the store refuses it instead of making a duplicate.
  const raced = addLogDrills(guitar({ drills: [...(skill.drills || []), { id: 'other', name: 'riffs', unit: 'reps', createdAt: T0 }] }), made, nowIso);
  assert(raced.problem === 'You already have a count with this name.', 'raced duplicate refused');
  assert(addLogDrills(skill, [], nowIso).skill === skill, 'no new drills = same skill object');
  // Points stay minutes only: the new drill's count changes nothing.
  const dayStart = new Date(`${WED}T00:00:00`).getTime();
  const nowMs = dayStart + 20 * 3600_000;
  const withCount = computeSkillAwards([log('a', WED, 9, [{ drillId: 'riffs', count: 9999 }])], [grown.skill!], WED, dayStart, nowMs);
  const without = computeSkillAwards([log('a', WED, 9)], [grown.skill!], WED, dayStart, nowMs);
  assert(withCount.entry?.amount === 2 && without.entry?.amount === 2, 'new drill counts earn no points (30 min = 2 pts)');
}

console.log('skillDrills fixtures: all passed');
