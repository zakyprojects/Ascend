import type { Habit, PointsEntry } from '@/types';
import { findPresetHabit } from './presets';
import { PRESET_HABIT_POINTS, recomputeTodayPresetPoints, type PresetHabitCapItem } from './pointsConfig';

/**
 * Habit awards are written by the server (supabase/migrations/20261015120000_server_habit_awards.sql).
 * The app computes the same rows only to show them before the server's copy arrives; it never
 * uploads them, and the server skips any app write to them. Change both sides together.
 */

/** First local day whose habit awards come from the server; older app-written awards stay. */
export const HABIT_AWARDS_SERVER_SINCE = '2026-10-15';

const HABIT_AWARD_ID_PREFIX = 'habit_award_';

/** Point entry ids only the server writes (never uploaded or deleted by the outbox). */
export const isServerOwnedPointId = (id: string): boolean => id.startsWith(HABIT_AWARD_ID_PREFIX);

/** A habit award row, or one of the app-written awards it replaced. */
export const isHabitAwardEntry = (entry: PointsEntry): boolean =>
  isServerOwnedPointId(entry.id || '') ||
  entry.source === 'habit_completed' ||
  entry.source === 'habit_cap_redistribution';

/** An app-written habit award for a day the server owns: the server retired every such row. */
export const isRetiredAppHabitAward = (entry: PointsEntry): boolean =>
  !isServerOwnedPointId(entry.id || '') &&
  (entry.source === 'habit_completed' || entry.source === 'habit_cap_redistribution') &&
  typeof entry.metadata?.periodKey === 'string' &&
  entry.metadata.periodKey >= HABIT_AWARDS_SERVER_SINCE;

/** Catalogue points of a habit (ascend_preset_habit_points): custom and retired habits earn 0. */
export function presetHabitPoints(habit: Pick<Habit, 'isPreset' | 'name'>): number {
  return habit.isPreset === true ? findPresetHabit(habit.name)?.points ?? 0 : 0;
}

const timeOf = (value: string): number => {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Infinity : ms;
};

/**
 * Mirror of ascend_recompute_habit_awards: the award entries of one local day. Checked daily
 * presets, one per preset name (the earliest check), share the daily cap in check order.
 */
export function computeHabitAwards(
  habits: Habit[],
  day: string,
  dayStartMs: number,
  nowMs: number
): { allocation: Record<string, number>; entries: PointsEntry[] } {
  const byName = new Map<string, { habit: Habit; item: PresetHabitCapItem }>();
  for (const habit of habits) {
    if (!habit || habit.frequency !== 'daily') continue;
    const points = presetHabitPoints(habit);
    if (points <= 0) continue;
    const completions = habit.completions as Habit['completions'] | string[] | undefined;
    const done = Array.isArray(completions) ? completions.includes(day) : completions?.[day]?.done === true;
    if (!done) continue;
    const checkedAt =
      (Array.isArray(completions) ? undefined : completions?.[day]?.updatedAt) || habit.updatedAt || habit.createdAt || '';
    const candidate = { habit, item: { id: habit.id, nominalPoints: points, updatedAt: checkedAt } };
    const existing = byName.get(habit.name);
    const earlier =
      !existing ||
      timeOf(checkedAt) < timeOf(existing.item.updatedAt) ||
      (timeOf(checkedAt) === timeOf(existing.item.updatedAt) && habit.id < existing.habit.id);
    if (earlier) byName.set(habit.name, candidate);
  }

  const counted = [...byName.values()];
  const allocation = recomputeTodayPresetPoints(
    counted.map((c) => c.item),
    PRESET_HABIT_POINTS.dailyCap
  );

  const entries: PointsEntry[] = [];
  for (const { habit, item } of counted) {
    const amount = allocation[habit.id] || 0;
    if (amount <= 0) continue;
    const checkedMs = timeOf(item.updatedAt);
    const at = Math.min(Math.max(Number.isFinite(checkedMs) ? checkedMs : nowMs, dayStartMs), nowMs);
    entries.push({
      id: `${HABIT_AWARD_ID_PREFIX}${habit.id}_${day}`,
      amount,
      reason: `Habit completed: ${habit.name}`,
      source: 'habit_completed',
      timestamp: new Date(at).toISOString(),
      metadata: {
        ...(habit.category != null ? { category: habit.category } : {}),
        habitId: habit.id,
        habitName: habit.name,
        periodKey: day,
      },
    });
  }
  return { allocation, entries };
}
