import type { DecisionLog, EmotionLog } from '@/types';
import { parseDate, todayKey } from '@/lib/dates';

/** Earlier days shown per "Show older days" tap. */
export const DAYS_PAGE = 7;

/** Comparator: newer day first, then newer timestamp (array order from sync is not by time). */
export function byNewest<T>(day: (item: T) => string, stamp: (item: T) => string | undefined) {
  return (a: T, b: T): number => day(b).localeCompare(day(a)) || (stamp(b) || '').localeCompare(stamp(a) || '');
}

/** Groups an already sorted list by day, keeping the order. */
export function groupByDay<T>(items: T[], day: (item: T) => string): [string, T[]][] {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const key = day(item);
    const list = byDay.get(key);
    if (list) list.push(item);
    else byDay.set(key, [item]);
  }
  return Array.from(byDay.entries());
}

/** Local day of an ISO timestamp ('' when it can't be read). */
export function localDayOf(iso: string | undefined): string {
  const at = parseDate(iso);
  return at ? todayKey(at) : '';
}

/** "2:05 PM" for a timestamp, '' when it can't be read. */
export function timeOfDay(iso: string | undefined): string {
  const at = parseDate(iso);
  return at ? at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
}

export const COMMON_EMOTIONS = ['Anxiety', 'Frustration', 'Joy', 'Overwhelm', 'Anger', 'Pride', 'Sadness', 'Calm'];

/** Decisions waiting for their revisit day (or past it), oldest first. */
export function dueDecisions(logs: DecisionLog[], today: string): DecisionLog[] {
  return logs.filter((d) => !d.isReflected && d.revisitDate <= today).sort((a, b) => a.revisitDate.localeCompare(b.revisitDate));
}

/** Emotions labelled since `fromDay`: counts by name (case ignored), average intensity. */
export function emotionSummary(logs: EmotionLog[], fromDay: string) {
  const recent = logs.filter((l) => localDayOf(l.date) >= fromDay);
  const counts = new Map<string, { name: string; count: number }>();
  for (const l of recent) {
    const key = l.emotion.trim().toLowerCase();
    if (!key) continue;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { name: l.emotion.trim(), count: 1 });
  }
  const average = recent.length ? recent.reduce((sum, l) => sum + (Number(l.intensity) || 0), 0) / recent.length : 0;
  return {
    total: recent.length,
    average,
    top: Array.from(counts.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}
