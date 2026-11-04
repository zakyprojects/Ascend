import type { FocusSessionLog, PointsEntry } from '@/types';
import { PFC_POINTS, calculateFocusPoints } from './pointsConfig';
import { addDays, todayKey } from './dates';
import { FOCUS_MILESTONES, finishBonus, milestonePoints } from './focusPoints';

/**
 * Focus points are written by the server (supabase/migrations/20261015200000_server_focus_awards.sql,
 * 20261104140000_focus_partial_points.sql): one row per local day, up to the daily cap of 10.
 * - Rows without a planned length (before 2026-11-04, or old app builds) earn the old tiers on
 *   their day (25 = 2, 50 = 5, 90 = 10).
 * - Rows with one earn rule R1 (focusPoints.ts): each milestone (25 = 2, then +1 at 35 ... 85 active
 *   min) counts on the local day it was crossed, the finish bonus on the day the session ended.
 *   Credited minutes never exceed the planned length or the time between start and end. A
 *   crossing time that does not fit (missing, too early, after the end, out of order) counts at
 *   the end, and one older than the day before the end day counts on the end day.
 * Only today is recomputed, so an earlier day's points stay when its session is deleted; the one
 * exception is the day before, which a session that ended today and crossed midnight can only
 * raise (never lower). The app computes the same rows only to show them before the server's copy
 * arrives; it never uploads them, and the server skips any app write to them. Change both sides together.
 */

/** First local day whose focus points come from the server; older app-written rows stay. */
export const FOCUS_AWARDS_SERVER_SINCE = '2026-10-15';

export const focusAwardId = (day: string) => `focus_award_${day}`;

/** Point entry ids only the server writes. */
export const isServerOwnedFocusPointId = (id: string): boolean => id.startsWith('focus_award_');

const localDayOf = (timestamp: string): string | null => {
  const at = new Date(timestamp);
  return Number.isNaN(at.getTime()) ? null : todayKey(at);
};

/** A focus row the app wrote itself (award or delete delta), on the local day it was written. */
const appWrittenRowDay = (entry: PointsEntry): string | null =>
  !isServerOwnedFocusPointId(entry.id || '') && entry.source === 'focus' ? localDayOf(entry.timestamp) : null;

/** The day's award row: the server's own, or one the app wrote on a day the server owns. */
export const isFocusDayEntry = (entry: PointsEntry, day: string): boolean =>
  entry.id === focusAwardId(day) || (day >= FOCUS_AWARDS_SERVER_SINCE && appWrittenRowDay(entry) === day);

/** An app-written focus row on a day the server owns: the server retired every such row. */
export const isRetiredAppFocusAward = (entry: PointsEntry): boolean => {
  const day = appWrittenRowDay(entry);
  return day !== null && day >= FOCUS_AWARDS_SERVER_SINCE;
};

const timeOf = (value: string | undefined): number => {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(ms) ? Infinity : ms;
};

const hasPlan = (log: FocusSessionLog): boolean =>
  typeof log.plannedMinutes === 'number' && Number.isFinite(log.plannedMinutes);

/**
 * Minutes of a session that can earn (ascend_focus_credited_minutes): its active minutes, at most
 * its plan and the whole minutes between its start and end; 0 when the times do not fit.
 */
export function creditedFocusMinutes(log: FocusSessionLog): number {
  if (!hasPlan(log)) return 0;
  const startMs = timeOf(log.startedAt);
  const endMs = timeOf(log.createdAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return 0;
  const wall = Math.floor((endMs - startMs) / 60000);
  return Math.max(0, Math.min(Math.floor(Number(log.durationMinutes) || 0), Math.floor(log.plannedMinutes!), wall));
}

export interface FocusAwardItem {
  logId: string;
  points: number;
  atMs: number;
  day: string;
  /** 0 = a whole legacy session, 1..7 = milestones, 8 = finish bonus. */
  order: number;
}

/** What one session earns, item by item, with the local day each item counts on (ascend_focus_log_items). */
export function focusLogItems(log: FocusSessionLog): FocusAwardItem[] {
  if (!log) return [];
  if (!hasPlan(log)) {
    return [{ logId: log.id, points: calculateFocusPoints(log.durationMinutes).rawPoints, atMs: timeOf(log.createdAt), day: log.date, order: 0 }];
  }
  const credited = creditedFocusMinutes(log);
  const startMs = timeOf(log.startedAt);
  const endMs = timeOf(log.createdAt);
  const dayOf = (ms: number): string => {
    const day = todayKey(new Date(ms));
    return day < addDays(log.date, -1) || day > log.date ? log.date : day;
  };
  const items: FocusAwardItem[] = [];
  let prev = -Infinity;
  FOCUS_MILESTONES.forEach((minutes, i) => {
    if (credited < minutes) return;
    let at = timeOf(log.milestonesAt?.[i]);
    if (!Number.isFinite(at) || at < startMs + minutes * 60000 || at > endMs || at < prev) at = endMs;
    prev = at;
    items.push({ logId: log.id, points: milestonePoints(i), atMs: at, day: dayOf(at), order: i + 1 });
  });
  const bonus = credited >= FOCUS_MILESTONES[0] && credited >= log.plannedMinutes! ? finishBonus(log.plannedMinutes!) : 0;
  if (bonus > 0) items.push({ logId: log.id, points: bonus, atMs: endMs, day: dayOf(endMs), order: 8 });
  return items;
}

/**
 * Mirror of ascend_recompute_focus_awards_day: the award entry of one local day (null when the day
 * earns nothing), and each session's share of that day's cap (shown on the session).
 * The row's time follows the server: a day whose row already exists (existing, the live ledger row)
 * keeps that row's time and only the amount changes; a new row is stamped at the day's first
 * earning item, clamped to [dayStartMs, nowMs]. `floor` (the day before today): the amount can
 * only go up, and an existing row is never removed.
 */
export function computeFocusAwards(
  logs: FocusSessionLog[],
  day: string,
  dayStartMs: number,
  nowMs: number,
  existing?: PointsEntry | null,
  opts: { floor?: boolean } = {}
): { entry: PointsEntry | null; sessionPoints: Map<string, number> } {
  const nextDay = addDays(day, 1);
  const sessions = new Set<string>();
  const items: FocusAwardItem[] = [];
  for (const l of logs) {
    if (!l) continue;
    if (!hasPlan(l)) {
      if (l.date !== day) continue;
      sessions.add(l.id);
      items.push(...focusLogItems(l));
      continue;
    }
    if (l.date !== day && l.date !== nextDay) continue;
    if (l.date === day) sessions.add(l.id);
    for (const item of focusLogItems(l)) {
      if (item.day !== day) continue;
      sessions.add(l.id);
      items.push(item);
    }
  }
  items.sort((a, b) => a.atMs - b.atMs || (a.logId < b.logId ? -1 : a.logId > b.logId ? 1 : 0) || a.order - b.order);

  const sessionPoints = new Map<string, number>();
  for (const id of sessions) sessionPoints.set(id, 0);
  let used = 0;
  let firstMs: number | null = null;
  for (const item of items) {
    const got = Math.min(item.points, Math.max(PFC_POINTS.focus.dailyCap - used, 0));
    used += got;
    sessionPoints.set(item.logId, (sessionPoints.get(item.logId) ?? 0) + got);
    if (firstMs === null && used > 0) firstMs = item.atMs;
  }
  const id = focusAwardId(day);
  const kept = existing && existing.id === id ? existing : null;
  if (opts.floor && kept && used <= kept.amount) return { entry: kept, sessionPoints };
  if (used <= 0) return { entry: opts.floor ? kept : null, sessionPoints };

  const at = Math.min(Math.max(firstMs !== null && Number.isFinite(firstMs) ? firstMs : nowMs, dayStartMs), nowMs);
  return {
    entry: {
      id,
      amount: used,
      reason: `Focus sessions (${sessions.size})`,
      source: 'focus',
      timestamp: kept ? kept.timestamp : new Date(at).toISOString(),
      metadata: { date: day, sessions: sessions.size },
    },
    sessionPoints,
  };
}
