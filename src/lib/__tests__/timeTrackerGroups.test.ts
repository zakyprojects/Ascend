import { ASCEND_RECOMMENDED_DAY_BLOCKS, DEFAULT_TIME_TRACKER_ACTIVITIES } from '@/types';
import { activityGroup, blockGroup, groupMinutes } from '../timeTrackerGroups';

function eq<T>(actual: T, want: T, msg: string) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(want);
  if (a !== w) throw new Error(`Assertion failed: ${msg} (got ${a}, want ${w})`);
}

const custom = [
  { id: 'c-code', name: 'Coding', ascendModule: 'Deep Focus' },
  { id: 'c-guitar', name: 'Guitar', ascendModule: 'Skill Mastery' },
  { id: 'c-habits', name: 'Habit check', ascendModule: 'Habits' },
  { id: 'c-chores', name: 'Chores' },
];
const map = new Map<string, { ascendModule?: string }>([
  ...DEFAULT_TIME_TRACKER_ACTIVITIES.map((a) => [a.id, a] as const),
  ...custom.map((a) => [a.id, a] as const),
]);

// Built-ins
eq(activityGroup('act-deep-work', map.get('act-deep-work')), 'productive', 'deep work is productive');
eq(activityGroup('act-skills', map.get('act-skills')), 'productive', 'skills is productive');
eq(activityGroup('act-reading', map.get('act-reading')), 'productive', 'reading is productive');
eq(activityGroup('act-exercise', map.get('act-exercise')), 'productive', 'exercise is productive');
eq(activityGroup('act-sleep', map.get('act-sleep')), 'sleep', 'sleep');
for (const id of ['act-break', 'act-meals', 'act-entertainment']) eq(activityGroup(id, map.get(id)), 'rest', `${id} is rest`);
eq(activityGroup('act-walking', map.get('act-walking')), 'rest', 'walking is rest though it links to Exercise');
eq(activityGroup('act-praying', map.get('act-praying')), 'other', 'praying is other');
eq(activityGroup('act-praying', { ascendModule: 'Reading' }), 'other', 'a built-in keeps its group when its link changes');

// Custom
eq(activityGroup('c-code', map.get('c-code')), 'productive', 'custom linked to Deep Focus');
eq(activityGroup('c-guitar', map.get('c-guitar')), 'productive', 'old Skill Mastery link');
eq(activityGroup('c-habits', map.get('c-habits')), 'other', 'custom linked to Habits');
eq(activityGroup('c-chores', map.get('c-chores')), 'other', 'custom with no link');

// Blocks
eq(blockGroup({ activityId: 'gone' }, map), 'other', 'deleted category');
eq(blockGroup({ activityId: 'act-meals' }, new Map()), 'rest', 'built-in id without its row still maps');

const blocks = [
  { activityId: 'act-sleep', startTime: '00:00', endTime: '07:00', completed: true },
  // Mixed groups: main is Deep Work, extras Meals + Entertainment; whole 90 min to Productive.
  { activityId: 'act-deep-work', secondaryActivityIds: ['act-meals', 'act-entertainment'], startTime: '09:00', endTime: '10:30', completed: true },
  // Finished early: stored end is already trimmed (10:45-11:20 = 35 min).
  { activityId: 'act-reading', startTime: '10:45', endTime: '11:20', completed: true },
  // Skipped: planned only.
  { activityId: 'act-meals', startTime: '13:00', endTime: '13:30', skipped: true },
  // Open: planned only.
  { activityId: 'c-chores', startTime: '18:00', endTime: '18:20' },
  // First half of a midnight block: 23:00-24:00 on this day only.
  { activityId: 'act-sleep', startTime: '23:00', endTime: '24:00', splitPairId: 'p1' },
];
eq(
  groupMinutes(blocks, map),
  {
    productive: { planned: 125, done: 125 },
    sleep: { planned: 480, done: 420 },
    rest: { planned: 30, done: 0 },
    other: { planned: 20, done: 0 },
  },
  'day totals'
);
eq(groupMinutes([], map).productive, { planned: 0, done: 0 }, 'empty day');

const rec = groupMinutes(ASCEND_RECOMMENDED_DAY_BLOCKS, map);
eq(
  [rec.productive.planned, rec.sleep.planned, rec.rest.planned, rec.other.planned],
  [420, 480, 270, 60],
  'recommended day template: 7h / 8h / 4h 30m / 1h'
);

console.log('timeTrackerGroups: ok');
