import { AppState } from '@/types';
import { todayKey } from '@/lib/dates';
import {
  WORKOUT_POINTS,
  READING_POINTS,
  SKILLS_POINTS,
  PFC_POINTS,
  BAD_HABIT_POINTS,
  PRESET_HABIT_POINTS,
  JOURNAL_POINTS,
} from '@/lib/pointsConfig';

export type CapId =
  | 'exercise'
  | 'reading'
  | 'skills'
  | 'pfc'
  | 'badHabitsResisted'
  | 'presetHabits'
  | 'journal';
export type CapPeriod = 'daily';

export interface CapStatus {
  capId: CapId;
  period: CapPeriod;
  periodKey: string;
  earned: number;
  cap: number;
  remaining: number;
  isCapped: boolean;
  slotsUsed?: number;
  slotsTotal?: number;
}

export function getCapStatus(
  state: Pick<
    AppState,
    | 'workouts'
    | 'readingLogs'
    | 'skillLogs'
    | 'focusLogs'
    | 'badHabitLogs'
    | 'habits'
    | 'journalEntries'
  >,
  capId: CapId,
  now: Date
): CapStatus {
  const periodKey = todayKey(now);
  const period: CapPeriod = 'daily';

  if (capId === 'exercise') {
    const cap = WORKOUT_POINTS.dailyCap;
    const earned = (state.workouts || [])
      .filter((w) => w.date === periodKey)
      .reduce((sum, w) => sum + (w.pointsAwarded || 0), 0);
    const remaining = Math.max(0, cap - earned);
    const isCapped = earned >= cap;
    return { capId, period, periodKey, earned, cap, remaining, isCapped };
  }

  if (capId === 'reading') {
    const cap = READING_POINTS.dailyCap;
    const earned = (state.readingLogs || [])
      .filter((l) => l.date === periodKey)
      .reduce((sum, l) => sum + (l.pointsAwarded || 0), 0);
    const remaining = Math.max(0, cap - earned);
    const isCapped = earned >= cap;
    return { capId, period, periodKey, earned, cap, remaining, isCapped };
  }

  if (capId === 'skills') {
    const cap = SKILLS_POINTS.dailyCap;
    const earned = (state.skillLogs || [])
      .filter((l) => l.date === periodKey)
      .reduce((sum, l) => sum + (l.pointsAwarded || 0), 0);
    const remaining = Math.max(0, cap - earned);
    const isCapped = earned >= cap;
    return { capId, period, periodKey, earned, cap, remaining, isCapped };
  }

  if (capId === 'pfc') {
    const cap = PFC_POINTS.focus.dailyCap;
    const earned = (state.focusLogs || [])
      .filter((l) => l.date === periodKey)
      .reduce((sum, l) => sum + (l.pointsAwarded || 0), 0);
    const remaining = Math.max(0, cap - earned);
    const isCapped = earned >= cap;
    return { capId, period, periodKey, earned, cap, remaining, isCapped };
  }

  if (capId === 'badHabitsResisted') {
    const cap = BAD_HABIT_POINTS.dailyCap;
    const slotsTotal = BAD_HABIT_POINTS.maxDailyResists;
    const resistLogs = (state.badHabitLogs || [])
      .filter((l) => l.date === periodKey && l.status === 'resisted');
    const earned = resistLogs.reduce((sum, l) => {
      const val = l.pointsAwardedOrDeducted || 0;
      return val > 0 ? sum + val : sum;
    }, 0);
    const slotsUsed = resistLogs.filter((l) => (l.pointsAwardedOrDeducted || 0) > 0).length;
    const remaining = Math.max(0, cap - earned);
    const isCapped = earned >= cap;
    return { capId, period, periodKey, earned, cap, remaining, isCapped, slotsUsed, slotsTotal };
  }

  if (capId === 'presetHabits') {
    const cap = PRESET_HABIT_POINTS.dailyCap;
    let earned = 0;
    for (const h of state.habits || []) {
      if (!h || !h.isPreset || h.frequency !== 'daily' || Array.isArray(h.completions)) continue;
      const comp = h.completions?.[periodKey];
      if (comp?.done) {
        earned += typeof comp.pointsAwarded === 'number' ? comp.pointsAwarded : (h.points || 0);
      }
    }
    const remaining = Math.max(0, cap - earned);
    const isCapped = earned >= cap;
    return { capId, period, periodKey, earned, cap, remaining, isCapped };
  }

  if (capId === 'journal') {
    const cap = JOURNAL_POINTS.entryCompleted;
    const entries = (state.journalEntries || []).filter(
      (e) => e.date === periodKey && e.pointsAwarded === true
    );
    const earned = entries.length * JOURNAL_POINTS.entryCompleted;
    const slotsUsed = entries.length;
    const slotsTotal = 1;
    const remaining = Math.max(0, cap - earned);
    const isCapped = earned >= cap;
    return { capId, period, periodKey, earned, cap, remaining, isCapped, slotsUsed, slotsTotal };
  }

  const _exhaustive: never = capId;
  throw new Error(`Unknown capId: ${_exhaustive}`);
}
