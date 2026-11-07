import type { TimeTrackerBlock, TimeTrackerState, TimeTrackerTemplate } from '@/types';
import { commitTimeTrackerDays, mergeTimeTrackerDays, templateBlocksForDate } from '../timeTracker';
import {
  linkedTemplateBlockId,
  newLinkedBlockId,
  planTemplateEditReach,
  templateEditReachDays,
  type TemplateEditReachDay,
} from '../timeTrackerTemplateReach';

let failures = 0;
function check(cond: boolean, msg: string, detail?: unknown) {
  if (!cond) {
    failures++;
    console.error(`✗ ${msg}`, detail === undefined ? '' : JSON.stringify(detail));
  } else console.log(`✓ ${msg}`);
}

const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TODAY = '2026-11-09'; // a Monday
const TOMORROW = '2026-11-10';
const at = (h: number, m = 0, day = 9) => new Date(2026, 10, day, h, m).getTime();
const tb = (id: string, startTime: string, endTime: string, activityId = `act-${id}`, extra: Partial<TimeTrackerBlock> = {}): TimeTrackerBlock => ({
  id,
  startTime,
  endTime,
  activityId,
  ...extra,
});
const tpl = (blocks: TimeTrackerBlock[], extra: Partial<TimeTrackerTemplate> = {}): TimeTrackerTemplate => ({
  id: 'T',
  title: 'Weekday',
  blocks,
  activeDays: ALL,
  ...extra,
});
const BASE = [
  tb('a', '00:00', '07:00'),
  tb('b', '07:00', '09:00'),
  tb('c', '09:00', '11:00'),
  tb('d', '11:00', '13:00'),
  tb('e', '13:00', '15:00'),
  tb('f', '15:00', '18:00'),
];
const tt = (templates: TimeTrackerTemplate[], dailyLogs: Record<string, TimeTrackerBlock[]>, extra: Partial<TimeTrackerState> = {}): TimeTrackerState => ({
  activities: [],
  templates,
  dailyLogs,
  ...extra,
});
/** Today filled from the template; a and b done, c running at 10:30. */
const hydratedToday = (template = tpl(BASE)) =>
  templateBlocksForDate(template, TODAY).map((b) =>
    b.id.endsWith('_a') || b.id.endsWith('_b') ? { ...b, completed: true, completedAt: '2026-11-09T04:00:00.000Z' } : b
  );
let saltN = 0;
const salt = () => `s${++saltN}`;
const plan = (before: TimeTrackerState, after: TimeTrackerState, now = at(10, 30)) => planTemplateEditReach(before, after, 'T', TODAY, now, salt);
const day = (plans: TemplateEditReachDay[], dateKey = TODAY) => plans.find((p) => p.dateKey === dateKey);
const times = (blocks: TimeTrackerBlock[]) => blocks.map((b) => `${b.startTime}-${b.endTime} ${b.activityId}`);
const overlaps = (blocks: TimeTrackerBlock[]) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const s = [...blocks].sort((x, y) => m(x.startTime) - m(y.startTime));
  return s.some((b, i) => i > 0 && m(b.startTime) < m(s[i - 1].endTime));
};

// --- ids ---
check(linkedTemplateBlockId(`auto_${TODAY}_T_c`, TODAY, 'T') === 'c', 'plain linked id parses');
check(linkedTemplateBlockId(newLinkedBlockId(TODAY, 'T', 'tpl-rec-1', 'xyz'), TODAY, 'T') === 'tpl-rec-1', 'salted linked id parses');
check(linkedTemplateBlockId(`auto_${TODAY}_U_c`, TODAY, 'T') === null, 'another template is not linked');
check(linkedTemplateBlockId(`auto_${TOMORROW}_T_c`, TODAY, 'T') === null, 'another date is not linked');
check(linkedTemplateBlockId('lmk3abc', TODAY, 'T') === null, 'a hand id is not linked');

// --- 1. untouched today: later blocks follow, done + running stay ---
{
  const today = hydratedToday();
  const before = tt([tpl(BASE)], { [TODAY]: today });
  const edited = [BASE[0], BASE[1], BASE[2], tb('d', '11:00', '12:00'), tb('e', '13:00', '15:00', 'act-new'), tb('g', '18:00', '20:00')];
  const after = tt([tpl(edited)], { [TODAY]: today });
  const plans = plan(before, after);
  const p = day(plans);
  check(plans.length === 1 && p?.kind === 'auto', 'untouched today updates on its own', plans.map((x) => [x.dateKey, x.kind]));
  check(!!p && p.blocks.slice(0, 3).every((b, i) => b === today[i]), 'done and running blocks are the same objects');
  check(JSON.stringify(times(p!.blocks)) === JSON.stringify(['00:00-07:00 act-a', '07:00-09:00 act-b', '09:00-11:00 act-c', '11:00-12:00 act-d', '13:00-15:00 act-new', '18:00-20:00 act-g']), 'later blocks match the template', times(p!.blocks));
  check(p!.blocks[3].id === `auto_${TODAY}_T_d` && p!.blocks[4].id === `auto_${TODAY}_T_e`, 'changed template blocks keep their day id (update in place)');
  check(p!.blocks[5].id === `auto_${TODAY}_T_g~s${saltN}`, 'a new template block gets a salted linked id', p!.blocks[5].id);
  check(p!.removed.map((b) => b.id).join() === `auto_${TODAY}_T_f`, 'only the dropped template block is removed');
  check(!overlaps(p!.blocks), 'no overlaps');
  const days = templateEditReachDays(before, plans, false, TODAY);
  const committed = commitTimeTrackerDays(after, days, '2026-11-09T05:30:00.000Z');
  check(committed.dayMeta?.[TODAY]?.deletedBlockIds?.join() === `auto_${TODAY}_T_f`, 'deletedBlockIds holds only the removed id');
  check(committed.dailyLogs[TODAY][0] === today[0] && !committed.dailyLogs[TODAY][1].updatedAt, 'commit leaves kept blocks unstamped');

  // --- two devices: B still has the old day; merging keeps A's result, nothing comes back ---
  const deviceA = { date: TODAY, blocks: committed.dailyLogs[TODAY], ...committed.dayMeta![TODAY] };
  const deviceB = { date: TODAY, blocks: today };
  const merged = mergeTimeTrackerDays(deviceB, deviceA);
  check(JSON.stringify(times(merged.blocks!)) === JSON.stringify(times(committed.dailyLogs[TODAY])), 'two devices: merge gives the updated day, no duplicate or resurrected block', times(merged.blocks!));
  const mergedOther = mergeTimeTrackerDays(deviceA, deviceB);
  check(JSON.stringify(times(mergedOther.blocks!)) === JSON.stringify(times(committed.dailyLogs[TODAY])), 'two devices: merge either way round gives the same day');
}

// --- 2. running block changed in the template: kept, nothing to reach ---
{
  const today = hydratedToday();
  const before = tt([tpl(BASE)], { [TODAY]: today });
  const edited = BASE.map((b) => (b.id === 'c' ? { ...b, activityId: 'act-reading' } : b));
  check(plan(before, tt([tpl(edited)], { [TODAY]: today })).length === 0, 'editing only the running block reaches nothing (it keeps running)');
}

// --- 3. a new block straddles now, nothing running ---
{
  const base = [tb('a', '00:00', '07:00'), tb('c', '09:00', '10:00'), tb('d', '12:00', '13:00')];
  const today = templateBlocksForDate(tpl(base), TODAY);
  const before = tt([tpl(base)], { [TODAY]: today });
  const after = tt([tpl([...base, tb('h', '10:00', '12:00')])], { [TODAY]: today });
  const p = day(plan(before, after, at(10, 40)));
  check(!!p && times(p.blocks).includes('10:40-12:00 act-h'), 'a block straddling now starts at now', p && times(p.blocks));
}

// --- 4 + 5. new block overlapping the running block's end; tiny pieces dropped ---
{
  const today = hydratedToday();
  const before = tt([tpl(BASE)], { [TODAY]: today });
  const edited = [...BASE.filter((b) => b.id !== 'd'), tb('x', '10:45', '11:45')];
  const p = day(plan(before, tt([tpl(edited)], { [TODAY]: today })));
  check(!!p && times(p.blocks).includes('11:00-11:45 act-x'), 'overlap with the running block starts when it ends', p && times(p.blocks));
  check(!!p && !overlaps(p.blocks), 'still no overlaps');
}
{
  const today = hydratedToday();
  const before = tt([tpl(BASE)], { [TODAY]: today });
  const edited = [BASE[0], BASE[1], tb('c', '09:00', '10:57'), tb('z', '10:57', '11:03'), tb('d', '11:03', '13:00'), BASE[4], BASE[5]];
  const p = day(plan(before, tt([tpl(edited)], { [TODAY]: today })));
  check(!!p && !times(p.blocks).some((t) => t.includes('act-z')), 'a free part under 5 minutes (3 left after the running block) is dropped', p && times(p.blocks));
  check(!!p && times(p.blocks).includes('11:03-13:00 act-d') && p.blocks[2] === today[2], 'the running block keeps its own times');
}

// --- 6. overdue unticked block is kept ---
{
  const today = templateBlocksForDate(tpl(BASE), TODAY); // nothing ticked
  const before = tt([tpl(BASE)], { [TODAY]: today });
  const p = day(plan(before, tt([tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')])], { [TODAY]: today })));
  check(!!p && p.blocks[1] === today[1] && !p.blocks[1].completed, 'an overdue unticked block stays (still counts as not done)');
}

// --- 7. upcoming block with pull/trim bookkeeping: kept, and the day is asked about ---
{
  const today = hydratedToday().map((b) => (b.id.endsWith('_d') ? { ...b, startTime: '11:30', trimmedDueToPullId: 'q' } : b));
  const before = tt([tpl(BASE)], { [TODAY]: today });
  const p = day(plan(before, tt([tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')])], { [TODAY]: today })));
  check(p?.kind === 'ask', 'a trimmed upcoming block makes the day hand-touched');
  check(!!p && p.blocks.some((b) => b.trimmedDueToPullId === 'q'), 'the trimmed block stays');
}

// --- 8. undone tick (updatedAt set, content the same) is still untouched ---
{
  const today = hydratedToday().map((b) => (b.id.endsWith('_e') ? { ...b, completed: false, updatedAt: '2026-11-09T05:00:00.000Z' } : b));
  const before = tt([tpl(BASE)], { [TODAY]: today });
  const p = day(plan(before, tt([tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')])], { [TODAY]: today })));
  check(p?.kind === 'auto', 'an undone tick does not count as a hand edit');
}

// --- 9. hand-added block later today: ask; Save only leaves the day, Update removes it ---
{
  const hand = tb('lmk3hand', '19:00', '20:00', 'act-hand', { createdAt: '2026-11-09T03:00:00.000Z' });
  const today = [...hydratedToday(), hand];
  const before = tt([tpl(BASE)], { [TODAY]: today });
  const after = tt([tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')])], { [TODAY]: today });
  const plans = plan(before, after);
  check(day(plans)?.kind === 'ask', 'a hand-added later block asks');
  check(Object.keys(templateEditReachDays(before, plans, false, TODAY)).length === 0, 'Save only: the day is not written');
  const days = templateEditReachDays(before, plans, true, TODAY);
  check(!!days[TODAY] && !days[TODAY].some((b) => b.id === hand.id) && times(days[TODAY]).includes('16:00-18:00 act-f'), 'Update: the template wins, the hand block is gone');
}

// --- 9b. moved / deleted template block by hand = ask; edit that only touches the past = nothing ---
{
  const moved = hydratedToday().map((b) => (b.id.endsWith('_e') ? { ...b, startTime: '13:30' } : b));
  const before = tt([tpl(BASE)], { [TODAY]: moved });
  check(day(plan(before, tt([tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')])], { [TODAY]: moved })))?.kind === 'ask', 'a block moved by hand asks');
  const deleted = hydratedToday().filter((b) => !b.id.endsWith('_e'));
  const before2 = tt([tpl(BASE)], { [TODAY]: deleted });
  check(day(plan(before2, tt([tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')])], { [TODAY]: deleted })))?.kind === 'ask', 'a template block deleted by hand asks');
  const pastOnly = BASE.map((b) => (b.id === 'b' ? { ...b, activityId: 'act-other' } : b));
  check(plan(before, tt([tpl(pastOnly)], { [TODAY]: moved })).length === 0, 'an edit to a block already past reaches nothing (no question)');
}

// --- 10. midnight split: a hand half removed on Update unlinks its partner tomorrow ---
{
  const pair = 'pair1';
  const eveningHalf = tb('h1', '23:00', '24:00', 'act-sleep2', { splitPairId: pair });
  const morningHalf = tb('h2', '00:00', '02:00', 'act-sleep2', { splitPairId: pair });
  const today = [...hydratedToday(), eveningHalf];
  const before = tt([tpl(BASE)], { [TODAY]: today, [TOMORROW]: [morningHalf] });
  const after = tt([tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')])], before.dailyLogs);
  const plans = plan(before, after);
  check(!day(plans, TOMORROW), 'tomorrow holds no template block, so it is not reached');
  const days = templateEditReachDays(before, plans, true, TODAY);
  check(!days[TODAY].some((b) => b.id === 'h1'), 'Update removes the evening half');
  check(!!days[TOMORROW] && days[TOMORROW][0].id === 'h2' && days[TOMORROW][0].splitPairId === undefined, 'its morning half stays as a plain block');
  // yesterday's partner of today's 00:00 half is never written
  const todayWithNight = [tb('n2', '00:00', '01:00', 'act-n', { splitPairId: 'p0' }), ...hydratedToday().slice(1)];
  const yBefore = tt([tpl(BASE)], { ['2026-11-08']: [tb('n1', '23:00', '24:00', 'act-n', { splitPairId: 'p0' })], [TODAY]: todayWithNight });
  const yDays = templateEditReachDays(yBefore, plan(yBefore, tt([tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')])], yBefore.dailyLogs)), true, TODAY);
  check(!yDays['2026-11-08'], 'yesterday is never written');
}

// --- 11. cleared today, preview later day, saved later day ---
{
  const editedTpl = tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')]);
  const cleared = tt([tpl(BASE)], { [TODAY]: [] }, { clearedDates: [TODAY] });
  check(plan(cleared, { ...cleared, templates: [editedTpl] }).length === 0, 'a cleared today is not touched');
  const preview = tt([tpl(BASE)], {});
  check(plan(preview, { ...preview, templates: [editedTpl] }).length === 0, 'unsaved days are previews (nothing written)');
  const later = templateBlocksForDate(tpl(BASE), TOMORROW);
  const savedLater = tt([tpl(BASE)], { [TOMORROW]: later });
  const p = day(plan(savedLater, { ...savedLater, templates: [editedTpl] }), TOMORROW);
  check(p?.kind === 'auto' && times(p.blocks).includes('16:00-18:00 act-f') && p.blocks[0] === later[0], 'a saved later day that is untouched updates on its own, all blocks upcoming');
  const pastDay = tt([tpl(BASE)], { ['2026-11-08']: templateBlocksForDate(tpl(BASE), '2026-11-08') });
  check(plan(pastDay, { ...pastDay, templates: [editedTpl] }).length === 0, 'past days are never touched');
}

// --- 12-15. weekday removed, template deleted, other template owns the day, name/weekday-only edit ---
{
  const today = hydratedToday();
  const before = tt([tpl(BASE)], { [TODAY]: today });
  const edited = [...BASE.slice(0, 5), tb('f', '16:00', '18:00')];
  check(plan(before, tt([tpl(edited, { activeDays: ALL.filter((d) => d !== 'Monday') })], { [TODAY]: today })).length === 0, 'removing today’s weekday in the same save leaves today');
  check(plan(before, tt([], { [TODAY]: today })).length === 0, 'a deleted template reaches nothing');
  const other = tpl([tb('o', '08:00', '09:00')], { id: 'U', title: 'Other', activeDays: ['Monday'] });
  check(plan(before, tt([other, tpl(edited, { activeDays: ALL.filter((d) => d !== 'Monday') })], { [TODAY]: today })).length === 0, 'another template taking today’s weekday leaves today');
  check(plan(before, tt([tpl(BASE, { title: 'Renamed', activeDays: ['Monday'] })], { [TODAY]: today })).length === 0, 'a name- or weekday-only edit reaches nothing');
}

// --- 16. day filled by Clear + Apply (salted linked ids) reaches like a hydrated day ---
{
  const applied = hydratedToday().map((b) => ({ ...b, id: `${b.id}~ap${b.id.slice(-1)}`, createdAt: '2026-11-09T02:00:00.000Z' }));
  const before = tt([tpl(BASE)], { [TODAY]: applied });
  const p = day(plan(before, tt([tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')])], { [TODAY]: applied })));
  check(p?.kind === 'auto', 'Clear + Apply ids are linked: no question');
  check(!!p && p.blocks.some((b) => b.id === `auto_${TODAY}_T_d~apd`), 'an unchanged applied block keeps its id');
}

// --- 16b. a manual Apply is reached even when the template doesn't own the weekday ---
{
  const applied = hydratedToday().map((b) => ({ ...b, id: `${b.id}~ap`, createdAt: 'Mon 2026-11-09 7:00 AM PKT (UTC+05:00)' }));
  const edited = [...BASE.slice(0, 5), tb('f', '16:00', '18:00')];
  // No weekdays at all (applied by hand to today).
  const before = tt([tpl(BASE, { activeDays: [] })], { [TODAY]: applied });
  const p = day(plan(before, tt([tpl(edited, { activeDays: [] })], { [TODAY]: applied })));
  check(p?.kind === 'auto' && times(p.blocks).includes('16:00-18:00 act-f'), 'a template with no weekdays applied by hand reaches today', p && times(p.blocks));
  // Another template owns today's weekday; T was applied by hand (Replace).
  const other = tpl([tb('o', '08:00', '09:00')], { id: 'U', title: 'Other', activeDays: ['Monday'] });
  const tNoMon = tpl(BASE, { activeDays: ALL.filter((d) => d !== 'Monday') });
  const before2 = tt([other, tNoMon], { [TODAY]: applied });
  const p2 = day(plan(before2, tt([other, { ...tNoMon, blocks: edited }], { [TODAY]: applied })));
  check(p2?.kind === 'auto' && times(p2.blocks).includes('16:00-18:00 act-f'), 'applied on a weekday another template owns: reached', p2 && times(p2.blocks));
  // The other template's edit does not reach a day that holds only T's blocks.
  const p3 = planTemplateEditReach(before2, tt([{ ...other, blocks: [tb('o', '08:00', '09:30')] }, tNoMon], { [TODAY]: applied }), 'U', TODAY, at(7), salt);
  check(p3.length === 0, 'the weekday owner’s edit leaves a day applied from another template');
  // Weekday removed in the same save: still left as it is (even with applied ids).
  const before4 = tt([tpl(BASE)], { [TODAY]: applied });
  check(plan(before4, tt([tpl(edited, { activeDays: ALL.filter((d) => d !== 'Monday') })], { [TODAY]: applied })).length === 0, 'weekday removed in the same save: applied day left');
  // Move day: another template takes Monday in the same save (T loses it): T's edit leaves today.
  check(plan(before4, tt([other, tpl(edited, { activeDays: ALL.filter((d) => d !== 'Monday') })], { [TODAY]: applied })).length === 0, 'Monday moved to another template in the same save: applied day left');
  // Move day the other way: T takes Monday from U; today holds U's blocks only, so nothing reaches.
  const uDay = templateBlocksForDate(other, TODAY);
  const beforeMove = tt([other, tNoMon], { [TODAY]: uDay });
  const afterMove = tt([{ ...other, activeDays: [] }, { ...tNoMon, activeDays: ALL, blocks: edited }], { [TODAY]: uDay });
  check(plan(beforeMove, afterMove).length === 0, 'T taking Monday from another template leaves a day filled by that template');
}

// --- 17. a deleted id is never reused (Update after a hand delete gives a salted id) ---
{
  const deleted = hydratedToday().filter((b) => !b.id.endsWith('_f'));
  const before = tt([tpl(BASE)], { [TODAY]: deleted }, { dayMeta: { [TODAY]: { deletedBlockIds: [`auto_${TODAY}_T_f`] } } });
  const plans = plan(before, tt([tpl([...BASE.slice(0, 5), tb('f', '15:00', '18:00', 'act-f2')])], { [TODAY]: deleted }));
  const p = day(plans);
  const f = p?.blocks.find((b) => b.activityId === 'act-f2');
  check(p?.kind === 'ask' && !!f && f.id !== `auto_${TODAY}_T_f` && linkedTemplateBlockId(f.id, TODAY, 'T') === 'f', 'a block deleted earlier comes back under a new linked id', f?.id);
  const merged = mergeTimeTrackerDays({ date: TODAY, blocks: p!.blocks, updatedAt: 'z' }, { date: TODAY, blocks: deleted, deletedBlockIds: [`auto_${TODAY}_T_f`] });
  check(merged.blocks!.some((b) => b.id === f!.id), 'merge with the other device’s tombstones keeps it');
}

// --- 18. day from an older template version, or mixed with another template = ask ---
{
  const older = templateBlocksForDate(tpl([...BASE.slice(0, 3), tb('d', '11:00', '12:30'), ...BASE.slice(4)]), TODAY);
  const before = tt([tpl(BASE)], { [TODAY]: older });
  check(day(plan(before, tt([tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')])], { [TODAY]: older })))?.kind === 'ask', 'a day from an older template version asks');
  const mixed = [...hydratedToday(), { ...tb('m', '19:00', '20:00'), id: `auto_${TODAY}_U_m~x` }];
  const before2 = tt([tpl(BASE)], { [TODAY]: mixed });
  check(day(plan(before2, tt([tpl([...BASE.slice(0, 5), tb('f', '16:00', '18:00')])], { [TODAY]: mixed })))?.kind === 'ask', 'a block merged in from another template asks');
}

// --- 19. legacy unsplit overnight template block (23:00–07:00) ---
{
  const base = [tb('w', '09:00', '17:00'), tb('n', '23:00', '07:00')];
  const today = templateBlocksForDate(tpl(base), TODAY);
  const before = tt([tpl(base)], { [TODAY]: today });
  const p = day(plan(before, tt([tpl([tb('w', '09:00', '17:00'), tb('n', '22:00', '07:00')])], { [TODAY]: today }), at(12)));
  check(!!p && times(p.blocks).includes('22:00-07:00 act-n') && p.blocks.find((b) => b.activityId === 'act-n')!.id === `auto_${TODAY}_T_n`, 'an old overnight block is updated in place', p && times(p.blocks));
  check(!!p && p.blocks[0] === today[0], 'the running day block stays');
}

if (failures > 0) {
  throw new Error(`${failures} check(s) failed`);
}
console.log('timeTrackerTemplateReach: all checks passed');
