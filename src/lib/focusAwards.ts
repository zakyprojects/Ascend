import type { FocusSessionLog, PointsEntry } from '@/types';
import { PFC_POINTS, calculateFocusPoints } from './pointsConfig';
import { addDays, localDayStartMs, todayKey, localDayOf } from './dates';
import { FOCUS_MILESTONES, FOCUS_MIN_MINUTES, finishBonus, focusDayPoints, milestonePoints, type FocusDayTally } from './focusPoints';

/**
 * Focus points are written by the server (supabase/migrations/20261015200000_server_focus_awards.sql,
 * 20261104140000_focus_partial_points.sql, 20261109140000_focus_points_12min.sql): one row per
 * local day, up to the daily cap of 10.
 * - Rule-2 rows (pointsRule 2: every row the server received since the rule-2 switch) add their
 *   credited minutes to the day; the day earns floor(minutes / 12) (focusPoints.ts). A session
 *   under 25 credited minutes adds nothing. A session that started the day before its end day puts
 *   the minutes done before midnight on that day (focusLogParts). Credited minutes never exceed
 *   the planned length or the time between start and end.
 * Older rows (pointsRule unset) keep their rule:
 * - Rows without a planned length (before 2026-11-04, or old app builds) earn the old tiers on
 *   their day (25 = 2, 50 = 5, 90 = 10).
 * - Rows with one earn rule R1 (focusPoints.ts): each milestone (25 = 2, then +1 at 35 ... 85 active
 *   min) counts on the local day it was crossed, the finish bonus on the day the session ended.
 *   A crossing time that does not fit (missing, too early, after the end, out of order) counts at
 *   the end, and one older than the day before the end day counts on the end day.
 * A day earns min(10, old-rule points + floor(rule-2 minutes / 12)).
 * Only today is recomputed, so an earlier day's points stay when its session is deleted; the one
 * exception is the day before, which a session can only raise (never lower) when some of its
 * points count on it: one that ended today and crossed midnight, or one that ended yesterday and
 * reached the server today (20261104160000_focus_late_day_points.sql). Days before that never move. The app computes the same rows only to show them before the server's copy
 * arrives; it never uploads them, and the server skips any app write to them. Change both sides together.
 */

/** First local day whose focus points come from the server; older app-written rows stay. */
export const FOCUS_AWARDS_SERVER_SINCE = '2026-10-15';

export const focusAwardId = (day: string) => `focus_award_${day}`;

/** Point entry ids only the server writes. */
export const isServerOwnedFocusPointId = (id: string): boolean => id.startsWith('focus_award_');

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

// Not timeMsOr: a null or empty value (milestonesAt comes from JSON) must give Infinity here, timeMsOr(null) gives 0.
const timeOf = (value: string | undefined): number => {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(ms) ? Infinity : ms;
};

const hasPlan = (log: FocusSessionLog): boolean =>
  typeof log.plannedMinutes === 'number' && Number.isFinite(log.plannedMinutes);

/** A row the server stamped with rule 2 (points_rule = 2), or one this app logged under it. */
export const isRule2FocusLog = (log: FocusSessionLog): boolean => log.pointsRule === 2;

/** Rows whose points are not tied to their own date only: R1 and rule-2 rows (both may count on the day before). */
const spansDays = (log: FocusSessionLog): boolean => hasPlan(log) || isRule2FocusLog(log);

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

/** What one old-rule session earns, item by item, with the local day each item counts on (ascend_focus_log_items). */
export function focusLogItems(log: FocusSessionLog): FocusAwardItem[] {
  if (!log || isRule2FocusLog(log)) return [];
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
 * One piece of what a session brings to a day (ascend_focus_log_parts): old-rule points, or
 * rule-2 minutes, with the local day it counts on.
 */
export interface FocusLogPart {
  logId: string;
  points: number;
  minutes: number;
  atMs: number;
  day: string;
  /** Old-rule rows: the item order (0 = a whole legacy session, 1..7 = milestones, 8 = finish bonus). Rule 2: 0 = before midnight, 1 = the rest. */
  order: number;
}

/**
 * The credited minutes of a rule-2 session split over the local days they count on (no part when
 * it has under 25). One part on its end day, unless it started on the day before: then the
 * minutes done before midnight count on that day. They are read from the session's checkpoints
 * (its start, each recorded 25/35 ... 85 crossing that fits, its end): the last checkpoint before
 * midnight plus the whole minutes from it to midnight, at most up to the next checkpoint (so a
 * pause inside that one stretch can move at most its own minutes onto the day before). Mirror of
 * the rule-2 branch of ascend_focus_log_parts.
 */
function rule2Parts(log: FocusSessionLog): FocusLogPart[] {
  const endMs = timeOf(log.createdAt);
  const credited = hasPlan(log) ? creditedFocusMinutes(log) : Math.max(0, Math.floor(Number(log.durationMinutes) || 0));
  if (credited < FOCUS_MIN_MINUTES) return [];
  const whole = (minutes: number, atMs: number, day: string, order: number): FocusLogPart => ({ logId: log.id, points: 0, minutes, atMs, day, order });
  const startMs = timeOf(log.startedAt);
  const prevDay = addDays(log.date, -1);
  if (!hasPlan(log) || !Number.isFinite(startMs) || todayKey(new Date(startMs)) !== prevDay) {
    return [whole(credited, endMs, log.date, 1)];
  }
  const checkpoints: Array<[minutes: number, atMs: number]> = [[0, startMs]];
  let prev = startMs;
  FOCUS_MILESTONES.forEach((minutes, i) => {
    if (minutes > credited) return;
    const at = timeOf(log.milestonesAt?.[i]);
    if (!Number.isFinite(at) || at < startMs + minutes * 60000 || at > endMs || at < prev) return;
    checkpoints.push([minutes, at]);
    prev = at;
  });
  checkpoints.push([credited, endMs]);
  const midnightMs = localDayStartMs(log.date);
  let k = 0;
  while (k + 1 < checkpoints.length && checkpoints[k + 1][1] <= midnightMs) k++;
  const [a, ta] = checkpoints[k];
  const before = k + 1 < checkpoints.length ? a + Math.min(checkpoints[k + 1][0] - a, Math.floor((midnightMs - ta) / 60000)) : a;
  const parts: FocusLogPart[] = [];
  if (before > 0) parts.push(whole(before, startMs + before * 60000, prevDay, 0));
  if (credited - before > 0) parts.push(whole(credited - before, endMs, log.date, 1));
  return parts;
}

/** What one session brings to each day: rule-2 minutes, or old-rule points (focusLogItems). */
export function focusLogParts(log: FocusSessionLog): FocusLogPart[] {
  if (!log) return [];
  if (isRule2FocusLog(log)) return rule2Parts(log);
  return focusLogItems(log).map((item) => ({ ...item, minutes: 0 }));
}

/**
 * The day before `today` when the server raises it for this session (focus_logs_award_points): a
 * planned session dated today or yesterday with at least one point that counts on yesterday.
 * null otherwise (older days are never raised).
 */
export function focusFloorDay(log: FocusSessionLog, today: string): string | null {
  const yesterday = addDays(today, -1);
  if (!log || !spansDays(log) || (log.date !== today && log.date !== yesterday)) return null;
  return focusLogParts(log).some((part) => part.day === yesterday && (part.points > 0 || part.minutes > 0)) ? yesterday : null;
}

/**
 * The parts that count on `day`, in the server's order (time, then id, then order): old-rule rows
 * dated that day, and R1 / rule-2 rows dated that day or the next. `sessions` collects the
 * sessions of the day (each row dated it, and each row of the next day with a part on it).
 */
function focusDayParts(logs: FocusSessionLog[], day: string, sessions?: Set<string>): FocusLogPart[] {
  const nextDay = addDays(day, 1);
  const parts: FocusLogPart[] = [];
  for (const l of logs) {
    if (!l) continue;
    if (!spansDays(l)) {
      if (l.date !== day) continue;
      sessions?.add(l.id);
      parts.push(...focusLogParts(l));
      continue;
    }
    if (l.date !== day && l.date !== nextDay) continue;
    if (l.date === day) sessions?.add(l.id);
    for (const part of focusLogParts(l)) {
      if (part.day !== day) continue;
      sessions?.add(l.id);
      parts.push(part);
    }
  }
  return parts.sort((a, b) => a.atMs - b.atMs || (a.logId < b.logId ? -1 : a.logId > b.logId ? 1 : 0) || a.order - b.order);
}

/** A day's focus so far (old-rule points and rule-2 minutes, before the cap): the timer's preview base. */
export function focusDayTally(logs: FocusSessionLog[], day: string): FocusDayTally {
  return focusDayParts(logs, day).reduce<FocusDayTally>(
    (t, p) => ({ fixedPoints: t.fixedPoints + p.points, minutes: t.minutes + p.minutes }),
    { fixedPoints: 0, minutes: 0 }
  );
}

/**
 * Mirror of ascend_recompute_focus_awards_day: the award entry of one local day (null when the day
 * earns nothing), and each session's share of it (shown on the session): what its parts added to
 * min(10, old-rule points + floor(rule-2 minutes / 12)), walked in time order.
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
  const sessions = new Set<string>();
  const parts = focusDayParts(logs, day, sessions);

  const sessionPoints = new Map<string, number>();
  for (const id of sessions) sessionPoints.set(id, 0);
  const tally: FocusDayTally = { fixedPoints: 0, minutes: 0 };
  let used = 0;
  let firstMs: number | null = null;
  for (const part of parts) {
    tally.fixedPoints += part.points;
    tally.minutes += part.minutes;
    const total = focusDayPoints(tally);
    sessionPoints.set(part.logId, (sessionPoints.get(part.logId) ?? 0) + (total - used));
    used = total;
    if (firstMs === null && used > 0) firstMs = part.atMs;
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
