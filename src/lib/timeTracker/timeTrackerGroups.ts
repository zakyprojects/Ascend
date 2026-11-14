import type { TimeTrackerActivity, TimeTrackerBlock } from '@/types';
import { calculateBlockDurationMinutes } from './timeTracker';

/**
 * Where a day's time goes, from Time Tracker blocks only (never Focus, Skills, Exercise or Reading
 * logs). Each block counts once, its whole stored length, in the group of its main category:
 * extra categories on a block never split its time. A block's stored times are already its real
 * ones (finished early = trimmed end, pulled forward = new start), a break inside a block stays
 * part of it, and each half of a block that runs past midnight counts on its own day.
 */
export type TimeGroupId = 'productive' | 'sleep' | 'rest' | 'other';

export const TIME_GROUPS: { id: TimeGroupId; label: string }[] = [
  { id: 'productive', label: 'Productive' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'rest', label: 'Rest' },
  { id: 'other', label: 'Other' },
];

/** Built-in categories keep their group whatever section they link to (Walking links to Exercise but is rest). */
const BUILT_IN_GROUPS: Record<string, TimeGroupId> = {
  'act-deep-work': 'productive',
  'act-skills': 'productive',
  'act-reading': 'productive',
  'act-exercise': 'productive',
  'act-sleep': 'sleep',
  'act-break': 'rest',
  'act-meals': 'rest',
  'act-entertainment': 'rest',
  'act-walking': 'rest',
  'act-praying': 'other',
};

/** Sections that make a custom category productive (older saved names included). */
const PRODUCTIVE_SECTIONS = new Set(['Deep Focus', 'Prefrontal Cortex', 'Skills', 'Skill Mastery', 'Reading', 'Exercise']);

/** A category's group: built-ins by id, custom ones Productive when linked to a working section, else Other. */
export function activityGroup(activityId: string, activity?: Pick<TimeTrackerActivity, 'ascendModule'>): TimeGroupId {
  const builtIn = BUILT_IN_GROUPS[activityId];
  if (builtIn) return builtIn;
  const section = activity?.ascendModule?.trim();
  return section && PRODUCTIVE_SECTIONS.has(section) ? 'productive' : 'other';
}

/**
 * A block's group. All its categories in one group = that group; mixed = its main category's group.
 * Both cases come down to the main category. A deleted main category falls back to Other.
 */
export function blockGroup(
  block: Pick<TimeTrackerBlock, 'activityId'>,
  activityMap: ReadonlyMap<string, Pick<TimeTrackerActivity, 'ascendModule'>>
): TimeGroupId {
  const main = activityMap.get(block.activityId);
  if (!main && !BUILT_IN_GROUPS[block.activityId]) return 'other';
  return activityGroup(block.activityId, main);
}

export type GroupMinutes = Record<TimeGroupId, { planned: number; done: number }>;

/**
 * Minutes per group for a day's (or a template's) blocks. Planned = every block, skipped ones
 * included at their stored length, so the groups add up to the page's Planned figure. Done = done
 * blocks only. Gaps and unplanned time are not counted anywhere.
 */
export function groupMinutes(
  blocks: Pick<TimeTrackerBlock, 'activityId' | 'startTime' | 'endTime' | 'completed'>[],
  activityMap: ReadonlyMap<string, Pick<TimeTrackerActivity, 'ascendModule'>>
): GroupMinutes {
  const out: GroupMinutes = {
    productive: { planned: 0, done: 0 },
    sleep: { planned: 0, done: 0 },
    rest: { planned: 0, done: 0 },
    other: { planned: 0, done: 0 },
  };
  for (const block of blocks) {
    const minutes = calculateBlockDurationMinutes(block.startTime, block.endTime);
    const bucket = out[blockGroup(block, activityMap)];
    bucket.planned += minutes;
    if (block.completed) bucket.done += minutes;
  }
  return out;
}
