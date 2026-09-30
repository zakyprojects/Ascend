import { CapId } from '@/lib/capStatus';
import {
  WORKOUT_POINTS,
  READING_POINTS,
  SKILLS_POINTS,
  PFC_POINTS,
  PRESET_HABIT_POINTS,
  JOURNAL_POINTS,
  BAD_HABIT_POINTS,
  TIME_TRACKER_POINTS,
  WEEKLY_GOALS_POINTS,
  WEEKLY_REFLECTION_POINTS,
  RECOVERY_POINTS,
} from '@/lib/pointsConfig';

export const capLabels: Record<CapId, string> = {
  exercise: 'Exercise points today',
  reading: 'Reading points today',
  skills: 'Skill points today',
  pfc: 'Focus points today',
  presetHabits: 'Habit points today',
  journal: 'Journal points today',
  badHabitsResisted: 'Resist points today',
};

export function capReachedText(earned: number, cap: number): string {
  return `Daily cap reached (${earned}/${cap}). More activity today won't earn points. Resets at midnight.`;
}

export function recoverySeasonCapNote(): string {
  return `Total recovery points this season are capped at ${RECOVERY_POINTS.seasonCap}; a capped milestone shows "Season cap reached" until the cap is reclaimed via reset/relapse rules.`;
}

export function weeklyGoalsCapNote(cutoff: Date): string {
  const cutoffStr = cutoff.toLocaleString(undefined, {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Each achieved goal = ${WEEKLY_GOALS_POINTS.pointsPerGoal} pts; only the first ${WEEKLY_GOALS_POINTS.maxGoalsCounted} achieved goals (by completion time) count; goals max = ${WEEKLY_GOALS_POINTS.maxWeeklyPoints} pts; the one weekly reflection's +${WEEKLY_REFLECTION_POINTS.awarded} pts is credited only after ${cutoffStr} (your local time) has passed; only the current week earns points.`;
}

export function timeTrackerCapNote(): string {
  const { high, medium, low } = TIME_TRACKER_POINTS.tiers;
  const skipRatioPct = Math.round(TIME_TRACKER_POINTS.skipExclusionRatio * 100);
  return `>=${high.minPercent}% of blocks = ${high.points} pts, ${medium.minPercent}–${high.minPercent - 1}% = ${medium.points}, below ${medium.minPercent}% = ${low.points}; unresolved blocks count as failed; skipped blocks are excluded up to min(skips, ${skipRatioPct}% of total blocks rounded down, ${TIME_TRACKER_POINTS.maxExcludedSkips}); routines of ${TIME_TRACKER_POINTS.smallRoutineThreshold} blocks or fewer exclude no skips; only today's blocks can be completed, past days are read-only.`;
}

export function capNote(capId: CapId | 'timeTracker'): string {
  if (capId === 'timeTracker') {
    return timeTrackerCapNote();
  }

  if (capId === 'exercise') {
    const { minsPerPoint, repsPerPoint } = WORKOUT_POINTS.units;
    return `${minsPerPoint} min, ${repsPerPoint} reps, 1 set or 1 km each earn 1 pt. Only full blocks count. Resets at midnight.`;
  }

  if (capId === 'reading') {
    return `${READING_POINTS.pagesPerPoint} pages = 1 pt. Cap ${READING_POINTS.dailyCap} pts per day. Resets at midnight.`;
  }

  if (capId === 'skills') {
    return `${SKILLS_POINTS.minutesPerPoint} min of practice = 1 pt. Cap ${SKILLS_POINTS.dailyCap} pts per day, shared across all skills. Resets at midnight.`;
  }

  if (capId === 'pfc') {
    const tiersStr = PFC_POINTS.focus.tiers
      .slice()
      .reverse()
      .map((t) => `${t.minMinutes} min = ${t.points} pts`)
      .join(', ');
    return `${tiersStr}. Cap ${PFC_POINTS.focus.dailyCap} pts per day. Resets at midnight.`;
  }

  if (capId === 'presetHabits') {
    return `Preset habits earn points up to ${PRESET_HABIT_POINTS.dailyCap} per day. Custom habits track your streak only and earn 0 points. Resets at midnight.`;
  }

  if (capId === 'journal') {
    return `One journal per day earns ${JOURNAL_POINTS.entryCompleted} pts. Editing today's entry earns nothing extra. Resets at midnight.`;
  }

  if (capId === 'badHabitsResisted') {
    return `Only your first ${BAD_HABIT_POINTS.eligibleSlots} active bad habits are point-eligible (first ${BAD_HABIT_POINTS.maxDailyResists} resists each day earn +${BAD_HABIT_POINTS.resistBase}, max +${BAD_HABIT_POINTS.dailyCap} pts/day). Other habits are tracking-only (0 pts). Occurred and missed days apply penalties to point-eligible habits only. Resets at midnight.`;
  }

  const _exhaustive: never = capId;
  throw new Error(`Unknown capId: ${_exhaustive}`);
}
