import {
  TimeTrackerActivity,
  TimeTrackerBlock,
  TimeTrackerDayMeta,
  TimeTrackerState,
  TimeTrackerTemplate,
  DEFAULT_TIME_TRACKER_ACTIVITIES,
} from '@/types';
import { uid, todayKey, getNow, parseDate, addDays } from './dates';
import { trustedNow } from './clock';

export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type DayOfWeek = typeof DAYS_OF_WEEK[number];

export const AVAILABLE_ACTIVITY_ICONS = [
  'Moon',
  'BrainCircuit',
  'HeartHandshake',
  'Activity',
  'BookOpen',
  'Coffee',
  'Utensils',
  'Dumbbell',
  'Clock',
  'Sun',
  'Briefcase',
  'Code',
  'Sparkles',
  'Zap',
  'Music',
  'Tv',
  'Flame',
  'Gamepad2',
  'Footprints',
  'Smile',
  'Shield',
  'Target',
  'Compass',
  'GraduationCap',
  'Calendar',
  'Layers',
];

// No yellow, amber or gold (brand rule). Categories already saved with one of those keep it.
export const AVAILABLE_ACTIVITY_COLORS = [
  { name: 'Emerald', value: '#10b981' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Slate', value: '#64748b' },
  { name: 'Stone', value: '#a8a29e' },
];

/** A block that ends at midnight stores this end time (minute 1440 of its day). */
export const END_OF_DAY = '24:00';
const MINUTES_PER_DAY = 1440;

/**
 * "HH:mm" (24h) to minutes from midnight, 0-1440. "24:00" is the end of the day; anything that
 * cannot be read is 0.
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length !== 2) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return 0;
  return Math.max(0, Math.min(MINUTES_PER_DAY, hours * 60 + minutes));
}

/** Minutes from midnight (0-1440) to "HH:mm"; 1440 is "24:00". */
export function minutesToTimeString(minutes: number): string {
  const bounded = Math.max(0, Math.min(MINUTES_PER_DAY, Math.floor(minutes)));
  const hours = Math.floor(bounded / 60);
  const mins = bounded % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** End minute of a block: an end of "00:00" after a later start means midnight (1440). */
function endMinutesOf(startTime: string, endTime: string): number {
  const start = timeStringToMinutes(startTime);
  const end = timeStringToMinutes(endTime);
  return end === 0 && start > 0 ? MINUTES_PER_DAY : end;
}

/** "09:30" -> "9:30 AM", "22:00" -> "10:00 PM", "24:00" -> "12:00 AM". */
export function formatTime12h(timeStr: string): string {
  if (!timeStr) return '';
  const mins = timeStringToMinutes(timeStr);
  const hours24 = Math.floor(mins / 60) % 24;
  const minutes = mins % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/** Length of a block in minutes (an end before the start runs past midnight). */
export function calculateBlockDurationMinutes(startTime: string, endTime: string): number {
  const startMins = timeStringToMinutes(startTime);
  const endMins = endMinutesOf(startTime, endTime);
  if (endMins >= startMins) return endMins - startMins;
  return MINUTES_PER_DAY - startMins + endMins;
}

/** Minutes as "1h 30m", "45m" or "2h". */
export function formatDurationHuman(minutes: number): string {
  if (minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** How a start/end pair is stored: one block, or two halves when it runs past midnight. */
export function describeBlockSpan(
  startTime: string,
  endTime: string
): { valid: boolean; crossesMidnight: boolean; first: { startTime: string; endTime: string }; second?: { startTime: string; endTime: string } } {
  const start = timeStringToMinutes(startTime);
  const end = endMinutesOf(startTime, endTime);
  if (start === end) return { valid: false, crossesMidnight: false, first: { startTime, endTime } };
  if (start < end) {
    return { valid: true, crossesMidnight: false, first: { startTime: minutesToTimeString(start), endTime: minutesToTimeString(end) } };
  }
  return {
    valid: true,
    crossesMidnight: true,
    first: { startTime: minutesToTimeString(start), endTime: END_OF_DAY },
    second: { startTime: '00:00', endTime: minutesToTimeString(end) },
  };
}

/**
 * Blocks never span midnight in storage. A block that ends at midnight is stored as one block
 * ending "24:00". One that runs past it (22:00 to 05:00) becomes two halves that share a
 * `splitPairId`: start to 24:00 on its day, and 00:00 to the end on the next day. The second half
 * starts clean (not done, not skipped, no break or pull-forward bookkeeping).
 */
export function normalizeOrSplitMidnightBlock(
  block: Omit<TimeTrackerBlock, 'id'> | TimeTrackerBlock,
  baseId?: string
): Array<TimeTrackerBlock> {
  const span = describeBlockSpan(block.startTime, block.endTime);
  if (!span.valid) {
    throw new Error('End time can’t be the same as the start.');
  }

  const first: TimeTrackerBlock = {
    ...block,
    id: (block as TimeTrackerBlock).id || baseId || uid(),
    createdAt: (block as TimeTrackerBlock).createdAt || trustedNow().toISOString(),
    startTime: span.first.startTime,
    endTime: span.first.endTime,
  };
  if (!span.second) {
    return [first];
  }

  const pairId = block.splitPairId || uid();
  const second: TimeTrackerBlock = {
    id: uid(),
    createdAt: trustedNow().toISOString(),
    activityId: block.activityId,
    ...(block.secondaryActivityIds?.length ? { secondaryActivityIds: block.secondaryActivityIds } : {}),
    ...(block.customTitle ? { customTitle: block.customTitle } : {}),
    ...(block.notes ? { notes: block.notes } : {}),
    startTime: span.second.startTime,
    endTime: span.second.endTime,
    splitPairId: pairId,
  };
  return [{ ...first, splitPairId: pairId }, second];
}

export interface CollisionCheckResult {
  hasCollision: boolean;
  collidingBlock?: TimeTrackerBlock;
  message?: string;
}

/** The first existing block a candidate overlaps (back-to-back is fine). */
export function checkTimeCollision(
  candidate: { id?: string; startTime: string; endTime: string },
  existingBlocks: TimeTrackerBlock[],
  ignoreBlockId?: string
): CollisionCheckResult {
  const newStart = timeStringToMinutes(candidate.startTime);
  const newEnd = endMinutesOf(candidate.startTime, candidate.endTime);

  if (newStart >= newEnd) {
    return { hasCollision: true, message: 'End time must be after the start.' };
  }

  for (const block of existingBlocks) {
    if (!block) continue;
    if (ignoreBlockId && block.id === ignoreBlockId) continue;
    if (candidate.id && block.id === candidate.id) continue;

    const existStart = timeStringToMinutes(block.startTime);
    const existEnd = endMinutesOf(block.startTime, block.endTime);
    if (Math.max(newStart, existStart) < Math.min(newEnd, existEnd)) {
      return {
        hasCollision: true,
        collidingBlock: block,
        message: `Overlaps ${formatTime12h(block.startTime)}–${formatTime12h(block.endTime)}.`,
      };
    }
  }

  return { hasCollision: false };
}

export type BlockTiming = 'upcoming' | 'current' | 'over';

/**
 * Start and end of a block on its own day (`dateKey`, device-local wall clock) as epoch ms.
 * "24:00" ends at the next local midnight; a legacy block stored with its end before its start
 * (never split) ends on the next day.
 */
export function blockIntervalMs(block: Pick<TimeTrackerBlock, 'startTime' | 'endTime'>, dateKey: string): { startMs: number; endMs: number } {
  const [y, m, d] = dateKey.split('-').map(Number);
  const start = timeStringToMinutes(block.startTime);
  let end = endMinutesOf(block.startTime, block.endTime);
  if (end < start) end += MINUTES_PER_DAY;
  // Date fills minute overflow into the next day and follows DST, unlike adding ms.
  return {
    startMs: new Date(y, m - 1, d, 0, start).getTime(),
    endMs: new Date(y, m - 1, d, 0, end).getTime(),
  };
}

/**
 * Where a block of day `dateKey` stands at instant `at`: 'upcoming' before its start, 'current'
 * from its start until (not including) its end, 'over' from its end.
 *
 * Works with the stored halves of a block that crosses midnight, because each half is judged on
 * its own date: a 22:00–24:00 half on Monday is current from Mon 22:00 to Tue 00:00 and over at
 * Tue 00:00 (not at 23:59); its 00:00–07:00 half on Tuesday is current from Tue 00:00. Pass the
 * date the block is stored under, never today's date for a block of another day. Completion and
 * skips are not looked at; callers decide what a resolved block means.
 */
export function getBlockTimingAt(
  block: Pick<TimeTrackerBlock, 'startTime' | 'endTime'>,
  dateKey: string,
  at: Date | number
): BlockTiming {
  const atMs = typeof at === 'number' ? at : at.getTime();
  const { startMs, endMs } = blockIntervalMs(block, dateKey);
  if (atMs < startMs) return 'upcoming';
  return atMs < endMs ? 'current' : 'over';
}

/** True while `at` is inside the block (see getBlockTimingAt). */
export function isBlockCurrentAt(block: Pick<TimeTrackerBlock, 'startTime' | 'endTime'>, dateKey: string, at: Date | number): boolean {
  return getBlockTimingAt(block, dateKey, at) === 'current';
}

/** True once `at` has reached the block's end (see getBlockTimingAt). */
export function isBlockOverAt(block: Pick<TimeTrackerBlock, 'startTime' | 'endTime'>, dateKey: string, at: Date | number): boolean {
  return getBlockTimingAt(block, dateKey, at) === 'over';
}

/** Returns the day of week name (e.g. 'Wednesday') for a given dateKey (YYYY-MM-DD) or Date. */
export function getDayOfWeekName(dateKeyOrDate: string | Date): DayOfWeek {
  let d: Date;
  if (typeof dateKeyOrDate === 'string') {
    d = parseDate(dateKeyOrDate) || trustedNow();
  } else {
    d = dateKeyOrDate;
  }
  const map: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return map[d.getDay()] || 'Monday';
}

/** A template's weekdays (older rows keep them in autoApplyDays). */
export function templateDays(template: Pick<TimeTrackerTemplate, 'activeDays' | 'autoApplyDays'>): string[] {
  if (Array.isArray(template.activeDays) && template.activeDays.length > 0) return template.activeDays;
  if (Array.isArray(template.autoApplyDays) && template.autoApplyDays.length > 0) return template.autoApplyDays;
  return [];
}

/** The template set to fill this date's weekday, if any. */
export function templateForDate(timeTracker: TimeTrackerState, dateKey: string): TimeTrackerTemplate | undefined {
  const dayName = getDayOfWeekName(dateKey).toLowerCase();
  return (timeTracker.templates || []).find(
    (tpl) => (tpl.blocks?.length ?? 0) > 0 && templateDays(tpl).some((d) => d.toLowerCase() === dayName)
  );
}

/**
 * Created time of blocks filled in from a template. Older than any real edit, so a day filled on
 * one device never beats another device's ticks on the same blocks.
 */
const AUTO_FILLED_AT = new Date(0).toISOString();

/**
 * A template's blocks as they land on a date, under ids fixed by date, template and template
 * block, so two devices that fill the same empty day produce the same blocks.
 */
export function templateBlocksForDate(template: TimeTrackerTemplate, dateKey: string): TimeTrackerBlock[] {
  return (template.blocks || []).map((b) => ({
    id: b.id ? `auto_${dateKey}_${template.id}_${b.id}` : uid(),
    createdAt: AUTO_FILLED_AT,
    startTime: b.startTime,
    endTime: b.endTime,
    activityId: b.activityId,
    ...(b.secondaryActivityIds?.length ? { secondaryActivityIds: b.secondaryActivityIds } : {}),
    ...(b.customTitle ? { customTitle: b.customTitle } : {}),
    ...(b.notes ? { notes: b.notes } : {}),
  }));
}

/**
 * What a date holds: its saved blocks; otherwise, for today and later, the blocks its weekday's
 * template would put there (`source: 'template'`, not saved); otherwise nothing.
 */
export function plannedBlocksForDate(
  timeTracker: TimeTrackerState,
  dateKey: string,
  today: string = todayKey()
): { blocks: TimeTrackerBlock[]; source: 'saved' | 'template' | 'none'; template?: TimeTrackerTemplate } {
  const saved = timeTracker.dailyLogs?.[dateKey];
  if (saved !== undefined) return { blocks: saved, source: 'saved' };
  if (dateKey < today || timeTracker.clearedDates?.includes(dateKey)) return { blocks: [], source: 'none' };
  const template = templateForDate(timeTracker, dateKey);
  if (!template) return { blocks: [], source: 'none' };
  return { blocks: templateBlocksForDate(template, dateKey), source: 'template', template };
}

/**
 * Fills an untouched date (never set up, not cleared) from its weekday's template. Callers fill
 * only today; other dates show the template as a preview until the user changes them.
 */
export function autoHydrateDailyLog(
  timeTracker: TimeTrackerState,
  targetDateKey: string = todayKey()
): { updatedState: TimeTrackerState; hydrated: boolean; appliedTemplateTitle?: string } {
  if (timeTracker.clearedDates?.includes(targetDateKey) || timeTracker.dailyLogs?.[targetDateKey] !== undefined) {
    return { updatedState: timeTracker, hydrated: false };
  }
  const template = templateForDate(timeTracker, targetDateKey);
  if (!template) {
    return { updatedState: timeTracker, hydrated: false };
  }
  return {
    updatedState: {
      ...timeTracker,
      dailyLogs: { ...(timeTracker.dailyLogs || {}), [targetDateKey]: templateBlocksForDate(template, targetDateKey) },
    },
    hydrated: true,
    appliedTemplateTitle: template.title,
  };
}

const byStart = (a: TimeTrackerBlock, b: TimeTrackerBlock) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime);

/** Block fields without updatedAt, in a fixed order: equal keys = nothing the user changed. */
function blockContentKey(block: TimeTrackerBlock): string {
  const record = block as unknown as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(record)
      .filter((k) => k !== 'updatedAt' && record[k] !== undefined)
      .sort()
      .map((k) => [k, record[k]])
  );
}

/** Removed block ids kept per day; plenty for one day's history. */
const MAX_DELETED_BLOCK_IDS = 300;

/**
 * Writes changed days into the time tracker the way every user edit must: blocks sorted, each
 * changed block stamped with the edit time, removed block ids remembered in the day's
 * `deletedBlockIds` (so merging with another device's copy never brings them back), and the day
 * stamped with the edit time (uploaded as its updated_at instead of the time it reaches the server).
 */
export function commitTimeTrackerDays(
  timeTracker: TimeTrackerState,
  days: Record<string, TimeTrackerBlock[]>,
  nowIso: string
): TimeTrackerState {
  const dailyLogs = { ...(timeTracker.dailyLogs || {}) };
  const dayMeta = { ...(timeTracker.dayMeta || {}) };

  for (const [dateKey, blocks] of Object.entries(days)) {
    const previous = timeTracker.dailyLogs?.[dateKey] || [];
    const previousById = new Map(previous.map((b) => [b.id, b]));
    const next = blocks
      .map((b) => {
        const before = previousById.get(b.id);
        if (!before) return b.createdAt ? b : { ...b, createdAt: nowIso };
        return blockContentKey(before) === blockContentKey(b) ? b : { ...b, updatedAt: nowIso };
      })
      .sort(byStart);
    const keptIds = new Set(next.map((b) => b.id));
    const removed = previous.filter((b) => !keptIds.has(b.id)).map((b) => b.id);
    const meta: TimeTrackerDayMeta = { ...(dayMeta[dateKey] || {}), updatedAt: nowIso };
    if (removed.length > 0) {
      const kept = (meta.deletedBlockIds || []).filter((id) => !keptIds.has(id));
      meta.deletedBlockIds = Array.from(new Set([...kept, ...removed])).slice(-MAX_DELETED_BLOCK_IDS);
    }
    dailyLogs[dateKey] = next;
    dayMeta[dateKey] = meta;
  }

  return { ...timeTracker, dailyLogs, dayMeta };
}

/** One day as stored in its sync row: blocks (absent = never set up), cleared flag and meta. */
export interface TimeTrackerDayDoc extends TimeTrackerDayMeta {
  date: string;
  blocks?: TimeTrackerBlock[];
  cleared?: boolean;
}

const isoOf = (value: unknown): string => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
};
const blockTime = (b: TimeTrackerBlock): string => isoOf(b.updatedAt) || isoOf(b.createdAt);

/** A day filled from a template on this device and never touched since. */
export function isUntouchedAutoDay(day: TimeTrackerDayDoc): boolean {
  if (day.updatedAt || day.cleared || !day.blocks || day.blocks.length === 0) return false;
  return day.blocks.every((b) => b.id.startsWith('auto_') && !b.updatedAt && !b.completed && !b.skipped);
}

/**
 * Merges two copies of one day block by block, so edits made on two devices (or offline) both
 * survive: a block removed on either side stays removed, a block on one side only is kept, and
 * a block changed on both sides keeps the newer edit (ties go to `a`). A day only filled from a
 * template loses to a real one. Returns `a` itself when nothing changes.
 */
export function mergeTimeTrackerDays(a: TimeTrackerDayDoc, b: TimeTrackerDayDoc): TimeTrackerDayDoc {
  if (isUntouchedAutoDay(a) && !isUntouchedAutoDay(b)) return b;
  if (isUntouchedAutoDay(b) && !isUntouchedAutoDay(a)) return a;

  const deleted = Array.from(new Set([...(a.deletedBlockIds || []), ...(b.deletedBlockIds || [])])).slice(-MAX_DELETED_BLOCK_IDS);
  const deletedSet = new Set(deleted);

  let blocks: TimeTrackerBlock[] | undefined;
  if (a.blocks !== undefined || b.blocks !== undefined) {
    const byId = new Map<string, TimeTrackerBlock>();
    for (const block of a.blocks || []) byId.set(block.id, block);
    for (const block of b.blocks || []) {
      const mine = byId.get(block.id);
      if (!mine || blockTime(block) > blockTime(mine)) byId.set(block.id, block);
    }
    blocks = Array.from(byId.values()).filter((block) => !deletedSet.has(block.id)).sort(byStart);
  }

  const aTime = isoOf(a.updatedAt);
  const bTime = isoOf(b.updatedAt);
  const newer = bTime > aTime ? b : a;
  const merged: TimeTrackerDayDoc = { date: a.date };
  if (blocks !== undefined) merged.blocks = blocks;
  if (newer.cleared) merged.cleared = true;
  const updatedAt = bTime > aTime ? b.updatedAt : a.updatedAt;
  if (updatedAt) merged.updatedAt = updatedAt;
  if (deleted.length > 0) merged.deletedBlockIds = deleted;
  return stableStringify(merged) === stableStringify(a) ? a : merged;
}

/** JSON with keys sorted and undefined left out, so equal content compares equal. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  );
}

/** The other half of a block that crosses midnight (on the day before or after), if any. */
export function findSplitPartner(
  timeTracker: TimeTrackerState,
  dateKey: string,
  block: TimeTrackerBlock
): { dateKey: string; block: TimeTrackerBlock } | null {
  if (!block.splitPairId) return null;
  const otherDate = block.startTime === '00:00' ? addDays(dateKey, -1) : addDays(dateKey, 1);
  const partner = (timeTracker.dailyLogs?.[otherDate] || []).find((b) => b.id !== block.id && b.splitPairId === block.splitPairId);
  return partner ? { dateKey: otherDate, block: partner } : null;
}

/** Done / skipped / open counts of a day's blocks: one answer for the sidebar, Dashboard and page. */
export function dayProgress(blocks: TimeTrackerBlock[] = []): { total: number; done: number; skipped: number; open: number } {
  const done = blocks.filter((b) => b.completed).length;
  const skipped = blocks.filter((b) => !b.completed && b.skipped).length;
  return { total: blocks.length, done, skipped, open: blocks.length - done - skipped };
}

/** "07:00-08:00 act-x" lines in order: equal strings = the same day plan. */
export function templateSignature(blocks: Pick<TimeTrackerBlock, 'startTime' | 'endTime' | 'activityId'>[]): string {
  return [...blocks]
    .map((b) => `${minutesToTimeString(timeStringToMinutes(b.startTime))}-${minutesToTimeString(endMinutesOf(b.startTime, b.endTime))} ${b.activityId}`)
    .sort()
    .join('|');
}

export interface LiveBlocks {
  /** The first unresolved block (by start) that is current at `at`. */
  activeBlock: TimeTrackerBlock | null;
  /** The first unresolved block (by start) that hasn't started yet. */
  nextBlock: TimeTrackerBlock | null;
  /** The first unresolved block (by start) whose end has passed. */
  overdueBlock: TimeTrackerBlock | null;
}

/**
 * The one rule for "which block is now / next / overdue", shared by the Time Tracker page
 * (computeLiveSchedule) and PFC Follow schedule (currentScheduleBlock). Done and skipped blocks
 * are left out. Each block is judged by getBlockTimingAt on its own day `dateKey`, so blocks ending
 * at 24:00, split halves and old unsplit overnight blocks (23:00–07:00) are read the same way on
 * both pages.
 */
export function liveBlocksAt(blocks: TimeTrackerBlock[], dateKey: string, at: Date | number): LiveBlocks {
  const unresolved = blocks.filter((b) => !b.completed && !b.skipped).sort(byStart);
  const timing = (b: TimeTrackerBlock) => getBlockTimingAt(b, dateKey, at);
  return {
    activeBlock: unresolved.find((b) => timing(b) === 'current') ?? null,
    nextBlock: unresolved.find((b) => timing(b) === 'upcoming') ?? null,
    overdueBlock: unresolved.find((b) => timing(b) === 'over') ?? null,
  };
}

/**
 * Live UI Computations:
 * Calculates active block, remaining time, progress percentage, etc.
 * Always computed against the given time (default getNow()) for blocks of day `dateKey`
 * (default: the local day of `now`).
 */
export interface LiveScheduleComputation {
  currentMinutes: number;
  currentTimeString: string;
  activeBlock: TimeTrackerBlock | null;
  nextBlock: TimeTrackerBlock | null;
  activeBlockActivity: TimeTrackerActivity | null;
  /** Real end instant of the active block (an old overnight block ends the next morning); 0 when none. */
  activeBlockEndMs: number;
  remainingMinutesInActiveBlock: number;
  elapsedMinutesInActiveBlock: number;
  activeBlockProgressPercent: number;
  totalScheduledMinutesToday: number;
  completedScheduledMinutesToday: number;
  dayScheduledProgressPercent: number;
  deepWorkMinutesToday: number;
  exerciseMinutesToday: number;
  readingMinutesToday: number;
}

export function computeLiveSchedule(
  blocks: TimeTrackerBlock[] = [],
  activities: TimeTrackerActivity[] = [],
  now: Date = getNow(),
  dateKey: string = todayKey(now)
): LiveScheduleComputation {
  const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const currentTimeString = minutesToTimeString(Math.floor(currentMinutes));

  const sortedBlocks = [...blocks].sort(byStart);

  const { activeBlock, nextBlock } = liveBlocksAt(blocks, dateKey, now);

  const activityMap = new Map<string, TimeTrackerActivity>();
  for (const act of activities) activityMap.set(act.id, act);

  const activeBlockActivity = activeBlock ? activityMap.get(activeBlock.activityId) || null : null;

  let remainingMinutesInActiveBlock = 0;
  let elapsedMinutesInActiveBlock = 0;
  let activeBlockProgressPercent = 0;
  let activeBlockEndMs = 0;

  if (activeBlock) {
    // Real instants, so a block that runs past midnight (old unsplit 23:00–07:00) counts right.
    const { startMs, endMs } = blockIntervalMs(activeBlock, dateKey);
    const nowMs = now.getTime();
    const duration = Math.max(1, (endMs - startMs) / 60_000);
    activeBlockEndMs = endMs;
    elapsedMinutesInActiveBlock = Math.max(0, (nowMs - startMs) / 60_000);
    remainingMinutesInActiveBlock = Math.max(0, Math.ceil((endMs - nowMs) / 60_000));
    activeBlockProgressPercent = Math.min(100, Math.max(0, (elapsedMinutesInActiveBlock / duration) * 100));
  }

  let totalScheduledMinutesToday = 0;
  let completedScheduledMinutesToday = 0;
  let deepWorkMinutesToday = 0;
  let exerciseMinutesToday = 0;
  let readingMinutesToday = 0;

  for (const block of sortedBlocks) {
    const dur = calculateBlockDurationMinutes(block.startTime, block.endTime);
    totalScheduledMinutesToday += dur;
    if (block.completed) completedScheduledMinutesToday += dur;

    // By linked section only: a name like "Proofreading" is not reading.
    const module = activityMap.get(block.activityId)?.ascendModule;
    if (module === 'Deep Focus') deepWorkMinutesToday += dur;
    else if (module === 'Exercise') exerciseMinutesToday += dur;
    else if (module === 'Reading') readingMinutesToday += dur;
  }

  const dayScheduledProgressPercent =
    totalScheduledMinutesToday > 0
      ? Math.min(100, Math.round((completedScheduledMinutesToday / totalScheduledMinutesToday) * 100))
      : 0;

  return {
    currentMinutes,
    currentTimeString,
    activeBlock,
    nextBlock,
    activeBlockActivity,
    activeBlockEndMs,
    remainingMinutesInActiveBlock,
    elapsedMinutesInActiveBlock,
    activeBlockProgressPercent,
    totalScheduledMinutesToday,
    completedScheduledMinutesToday,
    dayScheduledProgressPercent,
    deepWorkMinutesToday,
    exerciseMinutesToday,
    readingMinutesToday,
  };
}

/**
 * Maps an Ascend module name or activity metadata to its corresponding application view route.
 */
export function getAscendViewForModule(
  ascendModule?: string,
  activityName?: string
): 'prefrontal' | 'exercise' | 'reading' | 'skills' | 'habits' | 'recovery' | null {
  const mod = ascendModule?.trim();
  const actNameLower = activityName?.toLowerCase() || '';

  if (
    mod === 'Deep Focus' ||
    mod === 'Prefrontal Cortex' ||
    (!mod && (actNameLower.includes('deep work') || actNameLower.includes('focus')))
  ) {
    return 'prefrontal';
  }
  if (
    mod === 'Exercise' ||
    (!mod && actNameLower.includes('exercise'))
  ) {
    return 'exercise';
  }
  if (
    mod === 'Reading' ||
    (!mod && actNameLower.includes('reading'))
  ) {
    return 'reading';
  }
  if (
    mod === 'Skills' ||
    mod === 'Skill Mastery' ||
    (!mod && actNameLower.includes('skill'))
  ) {
    return 'skills';
  }
  if (
    mod === 'Habits' ||
    (!mod && actNameLower.includes('habit'))
  ) {
    return 'habits';
  }
  if (
    mod === 'Recovery' ||
    mod === 'Addiction Recovery' ||
    (!mod && (actNameLower.includes('recovery') || actNameLower.includes('dopamine') || actNameLower.includes('addiction')))
  ) {
    return 'recovery';
  }

  return null;
}

/**
 * Category colours: the dark-mode hex is stored; light mode swaps it for a darker shade of the
 * same hue that passes WCAG AA on the light surface. Custom colours not listed stay as they are.
 */
export const DARK_TO_LIGHT_ACTIVITY_COLORS: Record<string, string> = {
  '#6366f1': '#4338ca', // Indigo
  '#06b6d4': '#0e7490', // Cyan
  '#eab308': '#a16207', // Amber (no longer offered; old custom colours only)
  '#facc15': '#a16207', // Yellow (no longer offered; old custom colours only)
  '#ef4444': '#dc2626', // Red
  '#3b82f6': '#2563eb', // Blue
  '#8b5cf6': '#7c3aed', // Violet
  '#10b981': '#047857', // Emerald
  '#22c55e': '#15803d', // Green
  '#f97316': '#c2410c', // Orange
  '#a855f7': '#9333ea', // Purple
  '#14b8a6': '#0f766e', // Teal
  '#f43f5e': '#be123c', // Rose
  '#64748b': '#475569', // Slate
  '#a8a29e': '#78716c', // Stone
  '#84cc16': '#4d7c0f', // Lime (no longer offered)
  '#ec4899': '#be185d', // Pink
  '#0ea5e9': '#0369a1', // Sky
};

/**
 * Colours the built-in categories used to ship with (each earlier palette). A built-in category
 * whose saved colour is still one of these was never recoloured by the user, so it shows the
 * current default; a colour the user picked is left alone. Display only: nothing is rewritten.
 */
const PREVIOUS_DEFAULT_ACTIVITY_COLORS: Record<string, string[]> = {
  'act-sleep': ['#6366f1', '#64748b'],
  'act-deep-work': ['#06b6d4', '#0ea5e9'],
  'act-praying': ['#eab308'],
  'act-exercise': [],
  'act-reading': ['#3b82f6', '#14b8a6'],
  'act-skills': ['#8b5cf6', '#ec4899'],
  'act-break': ['#10b981'],
  'act-meals': [],
  'act-entertainment': ['#a855f7', '#84cc16'],
  'act-walking': ['#14b8a6', '#a8a29e'],
};

const CURRENT_DEFAULT_ACTIVITY_COLORS: Record<string, string> = Object.fromEntries(
  DEFAULT_TIME_TRACKER_ACTIVITIES.map((a) => [a.id, a.color])
);

/** The colour a category shows: the current default for an un-recoloured built-in, else its own. */
export function resolveActivityColor(
  activity: Pick<TimeTrackerActivity, 'id' | 'color' | 'isSystemDefault'> | undefined | null
): string | undefined {
  if (activity?.isSystemDefault && activity.id && activity.color) {
    const saved = activity.color.trim().toLowerCase();
    if ((PREVIOUS_DEFAULT_ACTIVITY_COLORS[activity.id] || []).includes(saved)) {
      return CURRENT_DEFAULT_ACTIVITY_COLORS[activity.id] || activity.color;
    }
  }
  return activity?.color;
}

export function getActivityDisplayColor(
  activity: Pick<TimeTrackerActivity, 'id' | 'color' | 'isSystemDefault'> | undefined | null,
  theme: 'dark' | 'light' = 'dark',
  fallback?: string
): string {
  return getActivityThemeColor(resolveActivityColor(activity) || fallback, theme);
}

export function categoryTintStyle(color: string): { backgroundColor: string; color: string; border: string } {
  return { backgroundColor: `${color}20`, color, border: `1px solid ${color}40` };
}

/**
 * Resolves an activity color hex string based on the active theme ('dark' | 'light').
 * - In 'dark' mode: returns the canonical raw color unchanged.
 * - In 'light' mode: looks up case-insensitively in the map; returns mapped light hex if found,
 *   otherwise returns the raw custom color unchanged.
 */
export function getActivityThemeColor(rawColor: string | undefined | null, theme: 'dark' | 'light' = 'dark'): string {
  // No colour (a deleted category): neutral slate rather than the brand colour.
  if (!rawColor) return theme === 'light' ? '#475569' : '#64748b';
  if (theme === 'dark') return rawColor;

  const normalized = rawColor.trim().toLowerCase();
  return DARK_TO_LIGHT_ACTIVITY_COLORS[normalized] || rawColor;
}

/**
 * Ensures system default activities are present and merged in state.
 */
export function ensureDefaultActivities(
  existingActivities: TimeTrackerActivity[] = []
): TimeTrackerActivity[] {
  const map = new Map<string, TimeTrackerActivity>();

  // Add system defaults first
  for (const def of DEFAULT_TIME_TRACKER_ACTIVITIES) {
    map.set(def.id, def);
  }

  // Overlay user activities / custom activities
  for (const act of existingActivities) {
    if (act && act.id) {
      const existing = map.get(act.id);
      if (existing && existing.isSystemDefault) {
        // Keep system default flag and metadata, allow custom color/icon
        map.set(act.id, { ...existing, ...act, isSystemDefault: true });
      } else {
        map.set(act.id, act);
      }
    }
  }

  return Array.from(map.values());
}
