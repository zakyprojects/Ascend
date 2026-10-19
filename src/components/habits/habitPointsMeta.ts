import type { Habit } from '@/types';
import { periodKey } from '@/lib/dates';
import { ptsText } from '@/lib/leagues';
import { isReadingLinked } from './HabitCheck';

/**
 * The short points line next to a habit in Dashboard's Today card and Quick log: "+5 pts",
 * "Cap reached" once today's tick earned nothing, "No points" for a habit that earns none (a weekly
 * custom habit), "Reading Hub" for
 * the linked Reading habit. `earns` = the line is a real award (shown in the brand colour).
 * Display only: the server decides the award.
 */
export function habitPointsMeta(habit: Habit, done: boolean): { text: string; earns: boolean } {
  const linked = isReadingLinked(habit);
  const awarded = habit.completions as Habit['completions'] | string[] | undefined;
  const pointsAwarded = Array.isArray(awarded) ? undefined : awarded?.[periodKey(habit.frequency)]?.pointsAwarded;
  const capped = done && pointsAwarded === 0 && habit.points > 0;
  const text = linked ? 'Reading Hub' : !(habit.points > 0) ? 'No points' : capped ? 'Cap reached' : ptsText(habit.points, true);
  const earns = !linked && habit.points > 0 && !capped;
  return { text, earns };
}
