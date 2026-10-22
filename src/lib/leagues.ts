import { LeagueType, LeagueCompetitor, LeagueArchive, PointsEntry, UserProfile, AppState } from '@/types';
import { getRegisteredCompetitors } from './auth';
import {
  getWeekStart,
  getWeekEnd,
  getMonthStart,
  getMonthEnd,
  getSeasonStart,
  getSeasonEnd,
  getSeasonNumber,
  getWeekPeriodId,
  getMonthPeriodId,
  getSeasonStartByNumber,
} from './leagueTime';
import type { LeaguePointsPeriod } from './supabase';

/** Returns formatted Season label (e.g. "Season 1") */
export function getSeasonLabel(now: Date): string {
  return `Season ${getSeasonNumber(now)}`;
}

/**
 * A new season restarts every league from zero: a week or month that began in the previous
 * season counts only from the season's start (its dates and end stay the same).
 */
export function clampToSeasonStart(periodStart: Date, now: Date): Date {
  const seasonStart = getSeasonStart(now);
  return periodStart.getTime() < seasonStart.getTime() ? seasonStart : periodStart;
}

export function getLeaguePeriodStart(type: LeagueType, now: Date): Date {
  switch (type) {
    case 'weekly': return clampToSeasonStart(getWeekStart(now), now);
    case 'monthly': return clampToSeasonStart(getMonthStart(now), now);
    case 'ninetyDay': return getSeasonStart(now);
  }
}

/** Periods a league view or archive can score: this week and month plus the 12 before each. */
const LEAGUE_POINTS_LOOKBACK = 12;

export function getLeaguePointsPeriods(now: Date): LeaguePointsPeriod[] {
  const periods: LeaguePointsPeriod[] = [];
  const kinds = [
    { start: getWeekStart, end: getWeekEnd, id: getWeekPeriodId },
    { start: getMonthStart, end: getMonthEnd, id: getMonthPeriodId },
  ];
  for (const kind of kinds) {
    let ref = now;
    for (let step = 0; step <= LEAGUE_POINTS_LOOKBACK; step++) {
      const start = kind.start(ref);
      periods.push({ id: kind.id(ref), start: clampToSeasonStart(start, ref), end: kind.end(ref) });
      ref = new Date(start.getTime() - 1);
    }
  }
  return periods;
}

/** Only this week and this month: the periods whose points still move. */
export function getLiveLeaguePointsPeriods(now: Date): LeaguePointsPeriod[] {
  const periods = getLeaguePointsPeriods(now);
  return [periods[0], periods[LEAGUE_POINTS_LOOKBACK + 1]];
}

/**
 * When the running period resets: a week or month that a season start cuts short ends at that
 * start, because the new season restarts every league. Not for getLeaguePointsPeriods: the
 * server only accepts true week/month ends there.
 */
export function getLeaguePeriodEnd(type: LeagueType, now: Date): Date {
  switch (type) {
    case 'weekly': return capAtSeasonEnd(getWeekEnd(now), now);
    case 'monthly': return capAtSeasonEnd(getMonthEnd(now), now);
    case 'ninetyDay': return getSeasonEnd(now);
  }
}

function capAtSeasonEnd(periodEnd: Date, now: Date): Date {
  const seasonEnd = getSeasonEnd(now);
  return periodEnd.getTime() < seasonEnd.getTime() ? periodEnd : seasonEnd;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatUtcDay(d: Date, withYear = false): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/**
 * "Oct 12 – Oct 18": first and last day of a half-open period [start, end). The end instant is the
 * next period's first moment, so the last day shown is the one just before it.
 */
function formatUtcRange(start: Date, end: Date, withYear = false): string {
  const last = new Date(end.getTime() - 1);
  const startYear = withYear && start.getUTCFullYear() !== last.getUTCFullYear();
  return `${formatUtcDay(start, startYear)} – ${formatUtcDay(last, withYear)}`;
}

function seasonRangeLabel(seasonNumber: number): string {
  const start = getSeasonStartByNumber(seasonNumber);
  const end = getSeasonStartByNumber(seasonNumber + 1);
  return `Season ${seasonNumber} (${formatUtcRange(start, end, true)})`;
}

/**
 * The running period's dates. A season start cuts a week or month short: before it the period ends
 * the day before the season starts, after it the period begins on the season's first day.
 */
export function getLeaguePeriodLabel(type: LeagueType, now: Date): string {
  switch (type) {
    case 'weekly':
      return formatUtcRange(getLeaguePeriodStart('weekly', now), getLeaguePeriodEnd('weekly', now));
    case 'monthly': {
      const start = getLeaguePeriodStart('monthly', now);
      const end = getLeaguePeriodEnd('monthly', now);
      if (start.getTime() === getMonthStart(now).getTime() && end.getTime() === getMonthEnd(now).getTime()) {
        return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      }
      return formatUtcRange(start, end);
    }
    case 'ninetyDay':
      return seasonRangeLabel(getSeasonNumber(now));
  }
}

/**
 * '<week or month id>@S<n>': the part of that week or month before season n + 1 began. The server
 * archives it as its own record; the plain id is the part inside the new season.
 */
const SEASON_PART_ID = /^(W:\d{4}-W\d{1,2}|M:\d{4}-\d{1,2})@S(\d+)$/;

/**
 * Label for a finished period, built from the archive id (W:/M:/S:, optionally @S<n>) so it shows
 * the period's last day (stored server labels print the next period's first day). Falls back to
 * the stored label.
 */
export function getArchivePeriodLabel(a: LeagueArchive): string {
  const id = a.id ?? '';
  const part = SEASON_PART_ID.exec(id);
  if (part) {
    const range = formatUtcRange(new Date(getArchivePeriodStart(a)), new Date(getArchivePeriodEnd(a)), part[1].startsWith('M:'));
    return `${range} (Season ${parseInt(part[2], 10)})`;
  }
  const start = id ? getArchivePeriodStart(a) : 0;
  if (id.startsWith('W:') && /^W:\d{4}-W\d{1,2}$/.test(id)) {
    const weekStart = new Date(start);
    const weekEnd = new Date(start + 7 * DAY_MS);
    return formatUtcRange(clampToSeasonStart(weekStart, new Date(weekEnd.getTime() - 1)), weekEnd);
  }
  if (id.startsWith('M:') && /^M:\d{4}-\d{1,2}$/.test(id)) {
    // A month a season start cut short counts from that start (as on the server).
    const monthEnd = new Date(getArchivePeriodEnd(a));
    const season = getSeasonNumber(new Date(monthEnd.getTime() - 1));
    if (getSeasonNumber(new Date(start)) < season) {
      return `${formatUtcRange(getSeasonStartByNumber(season), monthEnd, true)} (Season ${season})`;
    }
    return new Date(start).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  if (/^S:\d+$/.test(id)) {
    return seasonRangeLabel(parseInt(id.slice(2), 10));
  }
  return a.periodLabel;
}

/** "1 point", "420 points". */
export function pointsText(n: number): string {
  return `${n.toLocaleString()} ${Math.abs(n) === 1 ? 'point' : 'points'}`;
}

/** Short form for rows and chips: "1 pt", "3 pts"; `signed` adds "+" or "−" ("+2 pts", "−3 pts"). */
/** 'pt' for ±1, else 'pts': the unit beside an animated or separately styled number. */
export function ptUnit(n: number): 'pt' | 'pts' {
  return Math.abs(n) === 1 ? 'pt' : 'pts';
}

export function ptsText(n: number, signed = false): string {
  const unit = ptUnit(n);
  const sign = signed ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toLocaleString()} ${unit}`;
}

/** Newest first by timestamp, then id (sync pulls can leave the stored ledger out of order). */
export function sortPointsNewestFirst(history: PointsEntry[]): PointsEntry[] {
  return [...history].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime() ||
      entryIdOrder.compare(b.id || '', a.id || '')
  );
}

/** Returns milliseconds until the current period ends */
export function getTimeUntilReset(type: LeagueType, now: Date): number {
  const end = getLeaguePeriodEnd(type, now);
  return Math.max(0, end.getTime() - now.getTime());
}

/** Formats a duration in ms as a human-readable countdown string */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Resets soon';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

const entryIdOrder = new Intl.Collator('en-US');

/**
 * Calculate net points earned within a given time range from the points history (including additions and deductions).
 * Same maths as the server's public.ascend_period_points (league boards and archives); change both together.
 */
export function calculatePeriodPoints(
  pointsHistory: PointsEntry[],
  start: Date,
  end: Date,
  currentTotalPoints?: number, // Kept for signature compatibility
  evictedPointsOffset: number = 0 // Kept for signature compatibility
): number {
  if (!pointsHistory || pointsHistory.length === 0) {
    return 0;
  }

  // Sort history ascending by timestamp, then id (the server's order for entries at the same instant)
  const history = [...pointsHistory].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() ||
      entryIdOrder.compare(a.id || '', b.id || '')
  );

  let periodScore = 0;

  for (const entry of history) {
    const ts = new Date(entry.timestamp);
    
    // Only entries inside the half-open period [start, end), as the server counts them
    if (ts >= start && ts < end) {
      // Ignore physical compensating entries used for lifetime debt forgiveness;
      // seasonal scores dynamically floor at 0 on their own timeline.
      if (entry.reason === 'System: Debt Forgiveness' || entry.source === 'system') {
        continue;
      }

      periodScore += (entry.amount || 0);
      
      // Seasonal Debt Forgiveness: Never let the season score fall below zero
      if (periodScore < 0) {
        periodScore = 0;
      }
    }
  }

  return periodScore;
}

/**
 * Sanitizes a pointsHistory array chronologically so that running totals never drop below 0.
 * Replaces any historical over-deductions (phantom negatives) with the actual amount deducted from total points.
 */
export function sanitizePointsHistory(pointsHistory: PointsEntry[]): PointsEntry[] {
  if (!pointsHistory || pointsHistory.length === 0) return [];

  // Sort ascending by timestamp to trace running total chronologically
  const sorted = [...pointsHistory].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let runningTotal = 0;
  const sanitizedAsc: PointsEntry[] = [];

  for (const entry of sorted) {
    const rawAmount = entry.amount || 0;
    const newTotal = Math.max(0, runningTotal + rawAmount);
    const actualAmount = newTotal - runningTotal;
    runningTotal = newTotal;

    sanitizedAsc.push({
      ...entry,
      amount: actualAmount,
    });
  }

  // Preserve reverse chronological order (newest first)
  return sanitizedAsc.reverse();
}

/**
 * Generate full leaderboard competitors: the current user and every other registered user.
 */
export function generateCompetitors(
  type: LeagueType,
  userPoints: number,
  currentUser: UserProfile | null,
  usernameFallback: string,
  totalPoints: number = 0,
  userStats: any | undefined,
  activeHabits: any[] | undefined,
  now: Date
): LeagueCompetitor[] {
  const currentUserId = currentUser?.id;
  const activeUsername = currentUser?.username || usernameFallback || 'Guest User';
  const activeAvatar = currentUser?.avatar || '🧑';

  // 1. Current active user
  const activeUserCompetitor: LeagueCompetitor = {
    id: currentUserId || 'current_user',
    uid: currentUser?.uid,
    name: activeUsername,
    avatar: activeAvatar,
    points: userPoints,
    totalPoints: totalPoints,
    isUser: true,
    isRealUser: true,
    isProfilePublic: currentUser?.isProfilePublic ?? true,
    stats: userStats,
    activeHabits: activeHabits,
    season_history: currentUser?.season_history || userStats?.season_history,
  };

  // 2. All other registered real users
  const otherRealCompetitors = getRegisteredCompetitors(type, currentUserId, now);


  // Merge all competitors
  const allCompetitors: LeagueCompetitor[] = [
    activeUserCompetitor,
    ...otherRealCompetitors,
  ];

  // Sort descending by period points, then lower-cased name, then id (as the server's archives)
  allCompetitors.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    if (aName !== bName) return aName < bName ? -1 : 1;
    const aId = a.id ?? '';
    const bId = b.id ?? '';
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });

  return allCompetitors;
}

export function getUserRank(competitors: LeagueCompetitor[]): number {
  const index = competitors.findIndex((c) => c.isUser);
  return index >= 0 ? index + 1 : competitors.length;
}

/**
 * The fields an archived standing keeps: final standings only. A live competitor also
 * carries that member's stats, habits and season history, which an archive never shows
 * and must not copy into this user's data.
 */
const ARCHIVED_COMPETITOR_FIELDS = ['id', 'uid', 'name', 'avatar', 'points', 'totalPoints', 'isUser', 'isRealUser'] as const;

export function toArchivedCompetitor(competitor: LeagueCompetitor): LeagueCompetitor {
  const archived: Partial<LeagueCompetitor> = {};
  for (const field of ARCHIVED_COMPETITOR_FIELDS) {
    if (competitor[field] !== undefined) Object.assign(archived, { [field]: competitor[field] });
  }
  return archived as LeagueCompetitor;
}

/** Archives the Leagues page lists per league type (newest first); the server keeps every one. */
export const ARCHIVES_SHOWN_PER_TYPE = 12;

/** First instant of an archive's period, from its id (W:/M:/S:, optionally @S<n>), for newest-first ordering. */
export function getArchivePeriodStart(a: LeagueArchive): number {
  const id = a.id ? SEASON_PART_ID.exec(a.id)?.[1] ?? a.id : '';
  if (id) {
    if (id.startsWith('W:')) {
      const parts = id.slice(2).split('-W');
      if (parts.length === 2) {
        const year = parseInt(parts[0], 10);
        const week = parseInt(parts[1], 10);
        const jan4 = new Date(Date.UTC(year, 0, 4, 0, 0, 0, 0));
        const jan4DayNr = (jan4.getUTCDay() + 6) % 7;
        const firstMon = new Date(Date.UTC(year, 0, 4 - jan4DayNr, 0, 0, 0, 0));
        const mon = new Date(firstMon.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
        return mon.getTime();
      }
    } else if (id.startsWith('M:')) {
      const parts = id.slice(2).split('-');
      if (parts.length === 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        return Date.UTC(year, month, 1, 0, 0, 0, 0);
      }
    } else if (id.startsWith('S:')) {
      const sNum = parseInt(id.slice(2), 10);
      if (!isNaN(sNum)) {
        return getSeasonStartByNumber(sNum).getTime();
      }
    }
  }
  if (a.archivedAt) {
    return new Date(a.archivedAt).getTime();
  }
  return 0;
}

/**
 * Instant an archive's period ended (exclusive), from its id; an @S<n> part ends where season
 * n + 1 begins. Ids that are not W:/M:/S: end where they start.
 */
export function getArchivePeriodEnd(a: LeagueArchive): number {
  const start = getArchivePeriodStart(a);
  const part = a.id ? SEASON_PART_ID.exec(a.id) : null;
  const id = part ? part[1] : a.id ?? '';
  let end: number;
  if (/^W:\d{4}-W\d{1,2}$/.test(id)) {
    end = start + 7 * DAY_MS;
  } else if (/^M:\d{4}-\d{1,2}$/.test(id)) {
    const monthStart = new Date(start);
    end = Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1);
  } else if (/^S:\d+$/.test(id)) {
    end = getSeasonStartByNumber(parseInt(id.slice(2), 10) + 1).getTime();
  } else {
    return start;
  }
  return part ? Math.min(end, getSeasonStartByNumber(parseInt(part[2], 10) + 1).getTime()) : end;
}

/** Newest period first; a week or month and its @S<n> part start together, so the later-ending (in-season) one leads. */
export function compareArchivesNewestFirst(a: LeagueArchive, b: LeagueArchive): number {
  return getArchivePeriodStart(b) - getArchivePeriodStart(a) || getArchivePeriodEnd(b) - getArchivePeriodEnd(a);
}

/** "Resets Mon, Oct 19 · 5:00 AM your time": the end instant in the device's own zone, with its date. */
export function getLocalResetDetail(type: LeagueType, now: Date): string {
  const end = getLeaguePeriodEnd(type, now);
  const day = end.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(end.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
  const time = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${type === 'ninetyDay' ? 'Ends' : 'Resets'} ${day} · ${time} your time`;
}

export const LEAGUE_CONFIG: Record<LeagueType, { name: string; icon: string; color: string }> = {
  weekly: {
    name: 'Weekly League',
    icon: 'Calendar',
    color: '#34d399',
  },
  monthly: {
    name: 'Monthly League',
    icon: 'CalendarDays',
    color: '#0ea5e9',
  },
  ninetyDay: {
    name: '90-Day League',
    icon: 'Brain',
    color: '#a855f7',
  },
};

export function calculateSeasonalTotal(history: PointsEntry[], seasonStart: Date): number {
  if (!history || history.length === 0) {
    return 0;
  }

  // Sort chronological
  const sorted = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  let current = 0;

  for (const p of sorted) {
    if (p.reason === 'System: Debt Forgiveness' || p.source === 'system') {
      continue;
    }
    // ONLY process entries inside the active season
    if (new Date(p.timestamp) >= seasonStart) {
      current += (p.amount || 0);
      // Dynamic zero-flooring
      if (current < 0) {
        current = 0;
      }
    }
  }

  return current;
}

/** Live season points for the season `now` falls in, from the complete points ledger. */
export function getEffectiveSeasonPoints(state: AppState, now: Date): number {
  return calculateSeasonalTotal(state.pointsHistory || [], getSeasonStart(now));
}

