import { DEFAULT_TIME_TRACKER_STATE, type TimeTrackerBlock, type TimeTrackerState } from '@/types';
import {
  blockPillState,
  EMPTY_HIDDEN,
  hasPlan,
  hideHint,
  hideState,
  nextWakeMs,
  pairKey,
  parseHidden,
  parsePrefs,
  PLAN_PILL_MAX_HIDES,
  spokenTimeLeft,
  wakeAfterMs,
  type BlockPillHidden,
  type BlockPillInput,
} from '../blockPill';
import { formatTimeLeft, getDayOfWeekName, liveBlocksAt } from '../timeTracker';

function assert(condition: unknown, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
function equal<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) throw new Error(`Assertion failed: ${msg} (got ${String(actual)}, want ${String(expected)})`);
}

const TODAY = '2026-11-05';
const YESTERDAY = '2026-11-04';
const TOMORROW = '2026-11-06';
/** Device-local wall time on a date key, the same way blockIntervalMs reads blocks. */
const at = (dateKey: string, hh: number, mm = 0, ss = 0) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss).getTime();
};

const block = (id: string, startTime: string, endTime: string, extra: Partial<TimeTrackerBlock> = {}): TimeTrackerBlock => ({
  id,
  startTime,
  endTime,
  activityId: 'deep-work',
  ...extra,
});

const tt = (dailyLogs: Record<string, TimeTrackerBlock[]>, extra: Partial<TimeTrackerState> = {}): TimeTrackerState => ({
  activities: [{ id: 'deep-work', name: 'Deep work', color: '#10B981', icon: 'Brain', isSystemDefault: false }],
  templates: DEFAULT_TIME_TRACKER_STATE.templates,
  dailyLogs,
  clearedDates: [],
  ...extra,
});

const input = (timeTracker: TimeTrackerState, nowMs: number, hidden: BlockPillHidden = EMPTY_HIDDEN, more: Partial<BlockPillInput> = {}): BlockPillInput => ({
  timeTracker,
  today: TODAY,
  nowMs,
  hidden,
  enabled: true,
  onTimeTrackerPage: false,
  ...more,
});

// --- hasPlan --------------------------------------------------------------------------------------
equal(hasPlan(DEFAULT_TIME_TRACKER_STATE), false, 'the built-in template without weekdays is not a plan');
equal(hasPlan(tt({ [YESTERDAY]: [] })), false, 'an empty saved day is not a plan');
equal(hasPlan(tt({ [YESTERDAY]: [block('a', '09:00', '10:00')] })), true, 'a saved block on any day is a plan');
equal(
  hasPlan(tt({}, { templates: [{ ...DEFAULT_TIME_TRACKER_STATE.templates[0], activeDays: ['Monday'] }] })),
  true,
  'a template with blocks and a weekday is a plan'
);
equal(hasPlan(tt({}, { templates: [{ id: 't', title: 'x', blocks: [], activeDays: ['Monday'] }] })), false, 'an empty template is not a plan');

// --- Off / Time Tracker page ----------------------------------------------------------------------
const day = tt({ [TODAY]: [block('a', '09:00', '10:00'), block('b', '13:00', '14:30')] });
equal(blockPillState(input(day, at(TODAY, 9, 30), EMPTY_HIDDEN, { enabled: false })).kind, 'none', 'switched off shows nothing');
equal(blockPillState(input(day, at(TODAY, 9, 30), EMPTY_HIDDEN, { onTimeTrackerPage: true })).kind, 'none', 'hidden on the Time Tracker page');

// --- Row 1: running block -------------------------------------------------------------------------
{
  const s = blockPillState(input(day, at(TODAY, 9, 30)));
  assert(s.kind === 'block', 'a running block shows');
  if (s.kind === 'block') {
    equal(s.block.id, 'a', 'the running block');
    equal(s.next?.id, 'b', 'the next block');
    equal(s.endMs, at(TODAY, 10), 'ends at its end');
    equal(s.dismissKey, 'block:a', 'dismissed by its id');
    equal(s.activity?.name, 'Deep work', 'with its category');
  }
  // Same rule as the Time Tracker page.
  const live = liveBlocksAt(day.dailyLogs[TODAY], TODAY, at(TODAY, 9, 30));
  equal(live.activeBlock?.id, 'a', 'liveBlocksAt agrees');
}
equal(
  blockPillState(input(tt({ [TODAY]: [block('a', '09:00', '10:00', { completed: true }), block('b', '13:00', '14:30')] }), at(TODAY, 9, 30))).kind,
  'free',
  'a done block is not running: free time'
);
equal(
  blockPillState(input(tt({ [TODAY]: [block('a', '09:00', '10:00', { skipped: true })] }), at(TODAY, 9, 30))).kind,
  'free',
  'a skipped block is not running'
);
{
  const s = blockPillState(input(day, at(TODAY, 10)));
  equal(s.kind, 'free', 'a block is over at its end (end is exclusive)');
}

// --- Row 2: hidden running block does not fall through to free time ---------------------------------
{
  const s = blockPillState(input(day, at(TODAY, 9, 30)));
  const hidden = hideState(EMPTY_HIDDEN, s, TODAY);
  equal(hidden.keys['block:a'], TODAY, 'X remembers the block on today');
  equal(blockPillState(input(day, at(TODAY, 9, 45), hidden)).kind, 'none', 'stays hidden while it runs');
  equal(blockPillState(input(day, at(TODAY, 10, 0, 1), hidden)).kind, 'free', 'after it ends the next state shows');
  equal(blockPillState(input(day, at(TODAY, 13, 5), hidden)).kind, 'block', 'the next block shows');
  equal(hidden.planHides, 0, 'a block hide is not a newcomer hide');
  // An edit keeps the id: still hidden.
  const edited = tt({ [TODAY]: [block('a', '09:00', '11:00', { customTitle: 'Writing' }), block('b', '13:00', '14:30')] });
  equal(blockPillState(input(edited, at(TODAY, 10, 30), hidden)).kind, 'none', 'an edited block stays hidden');
}

// --- Row 3: free until the next block ---------------------------------------------------------------
{
  const s = blockPillState(input(day, at(TODAY, 11)));
  assert(s.kind === 'free', 'between blocks: free');
  if (s.kind === 'free') {
    equal(s.next?.id, 'b', 'until the next block');
    equal(s.nextStartMs, at(TODAY, 13), 'its start');
    equal(s.dismissKey, `free:${TODAY}:block:b`, 'free key names the next block');
    const hidden = hideState(EMPTY_HIDDEN, s, TODAY);
    equal(blockPillState(input(day, at(TODAY, 12), hidden)).kind, 'none', 'X hides free time until the next block');
    equal(blockPillState(input(day, at(TODAY, 13), hidden)).kind, 'block', 'the next block brings it back');
    const hint = hideHint(s, day.activities);
    equal(hint?.title, 'Hidden until 1:00 PM', 'free hint title');
    assert(hint?.message.startsWith('It comes back when Deep work starts.'), 'free hint names the block');
  }
}

// --- Row 4: free, nothing else today -----------------------------------------------------------------
{
  const s = blockPillState(input(day, at(TODAY, 15)));
  assert(s.kind === 'free' && s.next === null, 'after the last block: free time');
  if (s.kind === 'free') {
    equal(s.dismissKey, `free:${TODAY}:end`, 'end-of-day key');
    equal(hideHint(s)?.title, 'Hidden for today', 'end-of-day hint');
    const hidden = hideState(EMPTY_HIDDEN, s, TODAY);
    equal(blockPillState(input(day, at(TODAY, 20), hidden)).kind, 'none', 'hidden for the rest of today');
    const tomorrow = tt({ [TOMORROW]: [block('c', '09:00', '10:00')], [TODAY]: day.dailyLogs[TODAY] });
    equal(blockPillState(input(tomorrow, at(TOMORROW, 8), hidden, { today: TOMORROW })).kind, 'free', 'tomorrow it is back');
  }
  // A plan on other days but nothing today: free time, not "Plan your day".
  equal(blockPillState(input(tt({ [YESTERDAY]: [block('y', '09:00', '10:00')] }), at(TODAY, 9))).kind, 'free', 'planner with an empty today: free time');
}

// --- Rows 5–6: newcomer ------------------------------------------------------------------------------
{
  const fresh = tt({});
  let hidden: BlockPillHidden = EMPTY_HIDDEN;
  const days = ['2026-11-05', '2026-11-06', '2026-11-07'];
  days.forEach((d, i) => {
    const s = blockPillState(input(fresh, at(d, 9), hidden, { today: d }));
    assert(s.kind === 'plan', `newcomer day ${i + 1}: Plan your day`);
    if (s.kind !== 'plan') return;
    equal(s.dismissKey, `plan:${d}`, 'plan key per day');
    const hint = hideHint(s);
    equal(hint?.title, i + 1 >= PLAN_PILL_MAX_HIDES ? 'Hidden until you plan a block' : 'Hidden for today', `newcomer hint ${i + 1}`);
    hidden = hideState(hidden, s, d);
    equal(blockPillState(input(fresh, at(d, 18), hidden, { today: d })).kind, 'none', `hidden for the rest of day ${i + 1}`);
  });
  equal(hidden.planHides, 3, 'three hides counted');
  equal(blockPillState(input(fresh, at('2026-11-08', 9), hidden, { today: '2026-11-08' })).kind, 'none', 'after 3 hides it stops');
  const planned = tt({ '2026-11-08': [block('n', '09:00', '10:00')] });
  equal(blockPillState(input(planned, at('2026-11-08', 9, 10), hidden, { today: '2026-11-08' })).kind, 'block', 'a real block brings it back');
  // The built-in template (no weekdays) never counts as a plan, even on a weekday.
  equal(blockPillState(input(tt({}), at(TODAY, 7))).kind, 'plan', 'starter template is ignored');
}

// --- Template preview ids are stable (dismiss survives hydration) ----------------------------------
{
  const weekday = getDayOfWeekName(TODAY);
  const template = { id: 'tpl', title: 'Week', activeDays: [weekday], blocks: [block('t1', '09:00', '10:00')] };
  const preview = tt({}, { templates: [template] });
  const s = blockPillState(input(preview, at(TODAY, 9, 30)));
  assert(s.kind === 'block', 'a weekday template block runs before today is saved');
  if (s.kind === 'block') {
    equal(s.dismissKey, `block:auto_${TODAY}_tpl_t1`, 'preview id is deterministic');
    const hidden = hideState(EMPTY_HIDDEN, s, TODAY);
    const hydrated = tt({ [TODAY]: [block(`auto_${TODAY}_tpl_t1`, '09:00', '10:00')] }, { templates: [template] });
    equal(blockPillState(input(hydrated, at(TODAY, 9, 40), hidden)).kind, 'none', 'still hidden once today is filled');
  }
}

// --- Split pair: X before midnight holds after it -----------------------------------------------------
{
  const pair = tt({
    [TODAY]: [block('s1', '22:00', '24:00', { splitPairId: 'p1' })],
    [TOMORROW]: [block('s2', '00:00', '07:00', { splitPairId: 'p1' })],
  });
  const before = blockPillState(input(pair, at(TODAY, 23)));
  assert(before.kind === 'block' && before.dismissKey === 'pair:p1', 'split half keyed by its pair');
  equal(before.kind === 'block' ? before.endMs : 0, at(TOMORROW, 0), '24:00 ends at midnight');
  const hidden = hideState(EMPTY_HIDDEN, before, TODAY);
  equal(blockPillState(input(pair, at(TOMORROW, 0, 30), hidden, { today: TOMORROW })).kind, 'none', 'other half stays hidden after midnight');
  equal(blockPillState(input(pair, at(TOMORROW, 7), hidden, { today: TOMORROW })).kind, 'free', 'shows again when the pair ends');
  equal(pairKey({ id: 'x' }), 'block:x', 'unsplit key');
  // Pruning keeps yesterday's key (the pair), drops older ones.
  const later = hideState({ keys: { 'pair:p1': TODAY, 'block:old': YESTERDAY }, planHides: 1 }, { kind: 'plan', dismissKey: `plan:${TOMORROW}`, hidesSoFar: 1 }, TOMORROW);
  equal(later.keys['pair:p1'], TODAY, 'yesterday key kept');
  equal(later.keys['block:old'], undefined, 'older key pruned');
  equal(later.planHides, 2, 'plan hides counted');
}

// --- Overlap: earliest-starting current block wins ---------------------------------------------------
{
  const overlap = tt({ [TODAY]: [block('late', '09:30', '11:00'), block('early', '09:00', '10:00')] });
  const s = blockPillState(input(overlap, at(TODAY, 9, 45)));
  equal(s.kind === 'block' ? s.block.id : '', 'early', 'earliest start wins');
}

// --- Time-left text and wake times --------------------------------------------------------------------
equal(formatTimeLeft(0), 'ending now', 'ending now');
equal(formatTimeLeft(38), '38s left', 'seconds in the last minute');
equal(formatTimeLeft(60), '1m left', 'one minute');
equal(formatTimeLeft(42 * 60), '42m left', 'minutes');
equal(formatTimeLeft(72 * 60 + 5), '1h 12m left', 'hours');
equal(spokenTimeLeft(72 * 60), '1 hour 12 minutes left', 'spoken hours');
equal(spokenTimeLeft(60), '1 minute left', 'spoken singular');
equal(spokenTimeLeft(5), '5 seconds left', 'spoken seconds');
{
  // 09:30:00 → 30 min (1800 s) left; "30m" turns "29m" at 1799 s left = 09:30:01.
  const s = blockPillState(input(day, at(TODAY, 9, 30)));
  equal(nextWakeMs(s, at(TODAY, 9, 30), TODAY), 1000, 'wakes when the minute value drops');
  // 09:30:20 → 1780 s left; next drop at 1739 s → 41 s later.
  equal(nextWakeMs(s, at(TODAY, 9, 30, 20), TODAY), 41_000, 'wakes at the next minute drop');
  // Last minute: every second.
  equal(nextWakeMs(s, at(TODAY, 9, 59, 30), TODAY), 1000, 'every second in the last minute');
  // Free: at the next block's start (clamped to 60 s).
  const free = blockPillState(input(day, at(TODAY, 12, 59, 50)));
  equal(nextWakeMs(free, at(TODAY, 12, 59, 50), TODAY), 10_000, 'free wakes at the next start');
  equal(nextWakeMs(free, at(TODAY, 11), TODAY), 60_000, 'never sleeps past 60 s');
  // Midnight.
  const none = { kind: 'none' } as const;
  equal(nextWakeMs(none, at(TODAY, 23, 59, 59), TODAY), 1000, 'wakes at local midnight');
  // A hidden running block still wakes at its end.
  const hidden = hideState(EMPTY_HIDDEN, s, TODAY);
  equal(wakeAfterMs(input(day, at(TODAY, 9, 59, 58), hidden)), 1000, 'hidden block keeps waking');
  assert(wakeAfterMs(input(day, at(TODAY, 9, 59, 59), hidden)) >= 250, 'minimum wake 250 ms');
}

// --- Hints for a running block ------------------------------------------------------------------------
{
  const s = blockPillState(input(day, at(TODAY, 9, 30)));
  const hint = hideHint(s, day.activities);
  equal(hint?.title, 'Hidden until your next block', 'running hint with a next block');
  assert(hint?.message.includes('Deep work starts at 1:00 PM'), 'names the next block and time');
  assert(hint?.message.endsWith('You can turn it off in Settings › Appearance.'), 'mentions the setting');
  const last = blockPillState(input(day, at(TODAY, 13, 30)));
  equal(hideHint(last)?.title, 'Hidden for today', 'last block of the day');
}

// --- Storage parsing ------------------------------------------------------------------------------------
equal(parsePrefs(null).enabled, true, 'on by default');
equal(parsePrefs('not json').enabled, true, 'corrupt prefs = defaults');
equal(parsePrefs('{"v":1,"enabled":false}').enabled, false, 'off is kept');
equal(parsePrefs('{"v":1,"enabled":true,"pos":{"phone":{"side":"left","bottom":200},"desktop":{"side":"up","bottom":1}}}').pos.phone?.side, 'left', 'valid position');
equal(parsePrefs('{"v":1,"pos":{"desktop":{"side":"up","bottom":1}}}').pos.desktop, undefined, 'invalid position dropped');
equal(parseHidden('{"v":1,"keys":{"block:a":"2026-11-05","x":3},"planHides":2}').keys.x, undefined, 'non-string key dropped');
equal(parseHidden('{"v":1,"keys":{},"planHides":2}').planHides, 2, 'plan hides kept');
equal(parseHidden('[').planHides, 0, 'corrupt hides = none');

console.log('blockPill tests passed');
