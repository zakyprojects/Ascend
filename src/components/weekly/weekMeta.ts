import type { AppState, WeeklyGoalItem } from '@/types';
import type { GoalProgressResult } from '@/lib/linkedGoalMetrics';
import { formatWeekRange, offsetWeekKey } from '@/lib/dates';
import { calculateWeeklyGoalsPoints } from '@/lib/pointsConfig';

/** "This week", "Last week", "Next week", or the week's dates, never the raw week key. */
export function weekLabel(targetWeekKey: string, currentWeekKey: string): string {
  if (targetWeekKey === currentWeekKey) return 'This week';
  if (targetWeekKey === offsetWeekKey(currentWeekKey, -1)) return 'Last week';
  if (targetWeekKey === offsetWeekKey(currentWeekKey, 1)) return 'Next week';
  return formatWeekRange(targetWeekKey);
}

/** The same label inside a sentence ("From last week", "From Oct 5 – 11, 2026"). */
export function weekLabelInline(targetWeekKey: string, currentWeekKey: string): string {
  const label = weekLabel(targetWeekKey, currentWeekKey);
  return label.endsWith(' week') ? label.toLowerCase() : label;
}

export function isLinkedGoal(item: WeeklyGoalItem): boolean {
  return Boolean(item.linkedModule && item.linkedModule !== 'none');
}

/**
 * Whether a goal shows as achieved, matching what its points use (the achieved flag the server
 * scores). A manual goal is its flag. A linked goal follows its live progress in the current and
 * future weeks (the app sets the flag from it within a minute); a past week shows what was
 * recorded when it closed (Zakria 2026-10-18: closed weeks are not re-checked).
 */
export function isGoalAchieved(item: WeeklyGoalItem, prog: GoalProgressResult, isPastWeek: boolean): boolean {
  const flagged = Boolean(item.completed || item.done);
  if (!isLinkedGoal(item) || isPastWeek) return flagged;
  return !prog.needsMetricSelection && prog.percent >= 100;
}

/** "1 time", "3 times", "12 pages": a count with its unit. */
export function formatAmount(n: number, unit: string): string {
  const trimmed = unit.trim();
  if (!trimmed) return String(n);
  if (n === 1 && trimmed.endsWith('s') && !trimmed.endsWith('ss')) return `${n} ${trimmed.slice(0, -1)}`;
  return `${n} ${trimmed}`;
}

/**
 * The week's points as the ledger holds them: goal points (weekly_goal_<week>, plus the season
 * split row weekly_goal_<week>_s<N>) and the reflection's award and take-back.
 */
export function weekPointsFromLedger(state: Pick<AppState, 'pointsHistory'>, targetWeekKey: string): { goals: number; reflection: number } {
  const goalId = `weekly_goal_${targetWeekKey}`;
  const reflectionIds = new Set([`weekly_review_${targetWeekKey}`, `weekly_review_rev_${targetWeekKey}`]);
  let goals = 0;
  let reflection = 0;
  for (const e of state.pointsHistory || []) {
    if (!e?.id) continue;
    if (e.id === goalId || e.id.startsWith(`${goalId}_s`)) goals += e.amount || 0;
    else if (reflectionIds.has(e.id)) reflection += e.amount || 0;
  }
  return { goals, reflection };
}

/** Points that deleting this goal takes off the week (0 when it is not one of the counted three). */
export function pointsLostOnDelete(goals: WeeklyGoalItem[], goalId: string): number {
  const before = calculateWeeklyGoalsPoints(goals).pointsAwarded;
  const after = calculateWeeklyGoalsPoints(goals.filter((g) => g.id !== goalId)).pointsAwarded;
  return Math.max(0, before - after);
}
