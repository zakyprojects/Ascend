import type { FocusSessionLog, PointsEntry } from '@/types';
import { PFC_POINTS, calculateFocusPoints } from './pointsConfig';
import { todayKey } from './dates';

/**
 * Focus points are written by the server (supabase/migrations/20261015200000_server_focus_awards.sql):
 * one row per local day, the day's sessions' tiered points up to the daily cap. Only today is
 * recomputed, so an earlier day's points stay when its session is deleted. The app computes the
 * same row only to show it before the server's copy arrives; it never uploads it, and the server
 * skips any app write to it. Change both sides together.
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

const timeOf = (value: string): number => {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Infinity : ms;
};

/**
 * Mirror of ascend_recompute_focus_awards: the award entry of one local day (null when the day
 * earns nothing), and each session's share of the cap in log order (shown on the session).
 * The row's time follows the server: a day whose row already exists (existing, the live ledger row)
 * keeps that row's time and only the amount changes; a new row is stamped at the day's first
 * earning log, clamped to [dayStartMs, nowMs].
 */
export function computeFocusAwards(
  logs: FocusSessionLog[],
  day: string,
  dayStartMs: number,
  nowMs: number,
  existing?: PointsEntry | null
): { entry: PointsEntry | null; sessionPoints: Map<string, number> } {
  const daySessions = logs
    .filter((l) => l && l.date === day)
    .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const sessionPoints = new Map<string, number>();
  let used = 0;
  let firstMs: number | null = null;
  for (const l of daySessions) {
    const { pointsToAward } = calculateFocusPoints(l.durationMinutes, PFC_POINTS.focus.dailyCap - used);
    sessionPoints.set(l.id, pointsToAward);
    used += pointsToAward;
    if (firstMs === null && used > 0) firstMs = timeOf(l.createdAt);
  }
  if (used <= 0) return { entry: null, sessionPoints };

  const at = Math.min(Math.max(firstMs !== null && Number.isFinite(firstMs) ? firstMs : nowMs, dayStartMs), nowMs);
  const id = focusAwardId(day);
  return {
    entry: {
      id,
      amount: used,
      reason: `Focus sessions (${daySessions.length})`,
      source: 'focus',
      timestamp: existing && existing.id === id ? existing.timestamp : new Date(at).toISOString(),
      metadata: { date: day, sessions: daySessions.length },
    },
    sessionPoints,
  };
}
