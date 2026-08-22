import {
  TimeTrackerActivity,
  TimeTrackerBlock,
  TimeTrackerTemplate,
  TimeTrackerState,
  DEFAULT_TIME_TRACKER_ACTIVITIES,
} from '@/types';
import { uid, todayKey, getNow } from './dates';

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

/**
 * Converts "HH:mm" 24h time string into minutes from midnight (0 - 1439).
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length !== 2) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return 0;
  return Math.max(0, Math.min(1439, hours * 60 + minutes));
}

/**
 * Converts total minutes from midnight into 24h "HH:mm" format.
 */
export function minutesToTimeString(minutes: number): string {
  const bounded = Math.max(0, Math.min(1439, Math.floor(minutes)));
  const hours = Math.floor(bounded / 60);
  const mins = bounded % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Formats "HH:mm" string into 12-hour format with AM/PM (e.g. "09:30" -> "9:30 AM", "22:00" -> "10:00 PM").
 */
export function formatTime12h(timeStr: string): string {
  if (!timeStr) return '';
  const mins = timeStringToMinutes(timeStr);
  const hours24 = Math.floor(mins / 60);
  const minutes = mins % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Calculates duration in minutes between startTime and endTime.
 */
export function calculateBlockDurationMinutes(startTime: string, endTime: string): number {
  const startMins = timeStringToMinutes(startTime);
  const endMins = timeStringToMinutes(endTime);
  if (endMins >= startMins) {
    return endMins - startMins;
  }
  // Span midnight calculation if raw:
  return 1440 - startMins + endMins;
}

/**
 * Formats minutes into human-readable duration (e.g. "1h 30m" or "45m").
 */
export function formatDurationHuman(minutes: number): string {
  if (minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * The Midnight Boundary Engine (24h Trap):
 * Blocks CANNOT span across midnight. If a user sets a block where startTime > endTime
 * (e.g. 22:00 to 05:00), this function splits it into:
 * Block 1: startTime to 23:59
 * Block 2: 00:00 to endTime
 */
export function normalizeOrSplitMidnightBlock(
  block: Omit<TimeTrackerBlock, 'id'> | TimeTrackerBlock,
  baseId?: string
): Array<TimeTrackerBlock> {
  const startMins = timeStringToMinutes(block.startTime);
  const endMins = timeStringToMinutes(block.endTime);

  // Normal block within the same day
  if (startMins < endMins) {
    return [
      {
        ...block,
        id: (block as TimeTrackerBlock).id || baseId || uid(),
        createdAt: (block as TimeTrackerBlock).createdAt || new Date().toISOString(),
        startTime: minutesToTimeString(startMins),
        endTime: minutesToTimeString(endMins),
      },
    ];
  }

  // Equal times: invalid zero-length block
  if (startMins === endMins) {
    throw new Error('Start time and end time cannot be identical.');
  }

  // Midnight span: startMins > endMins
  // Split into Block 1 (startTime -> 23:59) and Block 2 (00:00 -> endTime)
  const block1: TimeTrackerBlock = {
    ...block,
    id: (block as TimeTrackerBlock).id || baseId || uid(),
    createdAt: (block as TimeTrackerBlock).createdAt || new Date().toISOString(),
    startTime: minutesToTimeString(startMins),
    endTime: '23:59',
    customTitle: block.customTitle ? `${block.customTitle} (Part 1)` : undefined,
  };

  const block2: TimeTrackerBlock = {
    ...block,
    id: uid(),
    createdAt: new Date().toISOString(),
    startTime: '00:00',
    endTime: minutesToTimeString(endMins),
    customTitle: block.customTitle ? `${block.customTitle} (Part 2)` : undefined,
  };

  return [block1, block2];
}

/**
 * Collision & Overlap Detection Engine:
 * Compares a candidate block with existing blocks.
 * Returns collision details if any interval overlaps.
 */
export interface CollisionCheckResult {
  hasCollision: boolean;
  collidingBlock?: TimeTrackerBlock;
  message?: string;
}

export function checkTimeCollision(
  candidate: { id?: string; startTime: string; endTime: string },
  existingBlocks: TimeTrackerBlock[],
  ignoreBlockId?: string
): CollisionCheckResult {
  const newStart = timeStringToMinutes(candidate.startTime);
  const newEnd = timeStringToMinutes(candidate.endTime);

  if (newStart >= newEnd) {
    return {
      hasCollision: true,
      message: 'End time must be strictly after start time.',
    };
  }

  for (const block of existingBlocks) {
    if (!block) continue;
    if (ignoreBlockId && block.id === ignoreBlockId) continue;
    if (candidate.id && block.id === candidate.id) continue;

    const existStart = timeStringToMinutes(block.startTime);
    const existEnd = timeStringToMinutes(block.endTime);

    // Back-to-back blocks or non-overlapping intervals safely continue
    if (existStart >= newEnd || existEnd <= newStart) {
      continue;
    }

    // Overlap condition: max(start1, start2) < min(end1, end2)
    if (Math.max(newStart, existStart) < Math.min(newEnd, existEnd)) {
      return {
        hasCollision: true,
        collidingBlock: block,
        message: `Overlaps with existing scheduled block (${formatTime12h(block.startTime)} - ${formatTime12h(block.endTime)}).`,
      };
    }
  }

  return { hasCollision: false };
}

/**
 * Returns the day of week name (e.g. 'Wednesday') for a given dateKey (YYYY-MM-DD) or Date.
 */
export function getDayOfWeekName(dateKeyOrDate: string | Date): DayOfWeek {
  let d: Date;
  if (typeof dateKeyOrDate === 'string') {
    const parts = dateKeyOrDate.split('-').map(Number);
    if (parts.length === 3) {
      d = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      d = new Date(dateKeyOrDate);
    }
  } else {
    d = dateKeyOrDate;
  }
  const dayIndex = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const map: DayOfWeek[] = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return map[dayIndex] || 'Monday';
}

/**
 * Auto-Assignment & Hydration:
 * On app load / date view, if `dailyLogs[dateKey]` is empty,
 * looks for a template where `activeDays` includes the current day name.
 * If found, copies the template blocks with new unique IDs into `dailyLogs[dateKey]`.
 */
export function autoHydrateDailyLog(
  timeTracker: TimeTrackerState,
  targetDateKey: string = todayKey()
): { updatedState: TimeTrackerState; hydrated: boolean; appliedTemplateTitle?: string } {
  if (timeTracker.clearedDates?.includes(targetDateKey)) {
    return { updatedState: timeTracker, hydrated: false };
  }

  const currentLogs = timeTracker.dailyLogs?.[targetDateKey];
  if (currentLogs !== undefined) {
    // Already defined (even if empty array [] from user clearing their schedule); do not overwrite
    return { updatedState: timeTracker, hydrated: false };
  }

  const dayName = getDayOfWeekName(targetDateKey);
  const matchingTemplate = (timeTracker.templates || []).find((tpl) =>
    (tpl.activeDays || tpl.autoApplyDays || []).some((d) => d.toLowerCase() === dayName.toLowerCase())
  );

  if (!matchingTemplate || !matchingTemplate.blocks || matchingTemplate.blocks.length === 0) {
    return { updatedState: timeTracker, hydrated: false };
  }

  // Clone blocks with new unique IDs
  const clonedBlocks: TimeTrackerBlock[] = matchingTemplate.blocks.map((b) => ({
    ...b,
    id: uid(),
    createdAt: new Date().toISOString(),
    completed: false,
    completedAt: undefined,
    skipped: false,
    skippedAt: undefined,
  }));

  const nextDailyLogs = {
    ...(timeTracker.dailyLogs || {}),
    [targetDateKey]: clonedBlocks,
  };

  return {
    updatedState: {
      ...timeTracker,
      dailyLogs: nextDailyLogs,
    },
    hydrated: true,
    appliedTemplateTitle: matchingTemplate.title,
  };
}

/**
 * Live UI Computations:
 * Calculates active block, remaining time, progress percentage, etc.
 * Always computed dynamically against current system time (getNow()).
 */
export interface LiveScheduleComputation {
  currentMinutes: number;
  currentTimeString: string;
  activeBlock: TimeTrackerBlock | null;
  nextBlock: TimeTrackerBlock | null;
  activeBlockActivity: TimeTrackerActivity | null;
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
  now: Date = getNow()
): LiveScheduleComputation {
  const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const currentTimeString = minutesToTimeString(Math.floor(currentMinutes));

  const sortedBlocks = [...blocks].sort(
    (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
  );

  let activeBlock: TimeTrackerBlock | null = null;
  let nextBlock: TimeTrackerBlock | null = null;

  for (const block of sortedBlocks) {
    const start = timeStringToMinutes(block.startTime);
    const end = timeStringToMinutes(block.endTime);

    if (currentMinutes >= start && currentMinutes < end) {
      if (!block.completed && !block.skipped) {
        activeBlock = block;
      }
    } else if (currentMinutes < start && (!nextBlock || start < timeStringToMinutes(nextBlock.startTime))) {
      if (!block.completed && !block.skipped) {
        nextBlock = block;
      }
    }
  }

  const activityMap = new Map<string, TimeTrackerActivity>();
  for (const act of activities) {
    activityMap.set(act.id, act);
  }

  const activeBlockActivity = activeBlock ? activityMap.get(activeBlock.activityId) || null : null;

  let remainingMinutesInActiveBlock = 0;
  let elapsedMinutesInActiveBlock = 0;
  let activeBlockProgressPercent = 0;

  if (activeBlock) {
    const start = timeStringToMinutes(activeBlock.startTime);
    const end = timeStringToMinutes(activeBlock.endTime);
    const duration = Math.max(1, end - start);
    elapsedMinutesInActiveBlock = Math.max(0, currentMinutes - start);
    remainingMinutesInActiveBlock = Math.max(0, Math.ceil(end - currentMinutes));
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

    if (block.completed) {
      completedScheduledMinutesToday += dur;
    }

    const act = activityMap.get(block.activityId);
    if (act) {
      if (act.ascendModule === 'Deep Focus' || act.name.toLowerCase().includes('deep work')) {
        deepWorkMinutesToday += dur;
      } else if (act.ascendModule === 'Exercise' || act.name.toLowerCase().includes('exercise')) {
        exerciseMinutesToday += dur;
      } else if (act.ascendModule === 'Reading' || act.name.toLowerCase().includes('reading')) {
        readingMinutesToday += dur;
      }
    }
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
