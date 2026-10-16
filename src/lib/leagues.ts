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
} from './leagueTime';
import { trustedNow } from './clock';

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

export function getLeaguePeriodEnd(type: LeagueType, now: Date): Date {
  switch (type) {
    case 'weekly': return getWeekEnd(now);
    case 'monthly': return getMonthEnd(now);
    case 'ninetyDay': return getSeasonEnd(now);
  }
}

export function getLeaguePeriodLabel(type: LeagueType, now: Date): string {
  switch (type) {
    case 'weekly': {
      const start = getWeekStart(now);
      const end = getWeekEnd(now);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
    }
    case 'monthly': {
      return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
    case 'ninetyDay': {
      const seasonLabel = getSeasonLabel(now);
      const start = getSeasonStart(now);
      const end = getSeasonEnd(now);
      return `${seasonLabel} (${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })})`;
    }
  }
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

/** Calculate net points earned within a given time range from the points history (including additions and deductions) */
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

  // Sort history ascending by timestamp
  const history = [...pointsHistory].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let periodScore = 0;

  for (const entry of history) {
    const ts = new Date(entry.timestamp);
    
    // Only process entries that fall within the requested time period
    if (ts >= start && ts <= end) {
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

  // Sort descending by period points, tie-break by name
  allCompetitors.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.name.localeCompare(b.name);
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

export function createArchive(
  type: LeagueType,
  competitors: LeagueCompetitor[],
  userRank: number,
  userPoints: number,
  periodLabel: string,
  id?: string
): LeagueArchive {
  return {
    id,
    type,
    periodLabel,
    competitors: competitors.map(toArchivedCompetitor),
    userRank,
    userPoints,
    archivedAt: trustedNow().toISOString(),
  };
}

export function getLocalResetDetail(type: LeagueType, now: Date): string {
  const end = getLeaguePeriodEnd(type, now);
  const dayName = end.toLocaleDateString(undefined, { weekday: 'long' });
  const timeStr = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `Resets ${dayName} at ${timeStr} (your local time)`;
}

export const LEAGUE_CONFIG: Record<LeagueType, { name: string; description: string; icon: string; color: string }> = {
  weekly: {
    name: 'Weekly League',
    description: 'Compete every week based on points earned.',
    icon: 'Calendar',
    color: '#34d399',
  },
  monthly: {
    name: 'Monthly League',
    description: 'Monthly competition tracking consistency.',
    icon: 'CalendarDays',
    color: '#0ea5e9',
  },
  ninetyDay: {
    name: '90-Day League',
    description: 'The neuroplasticity league. 90 days of sustained effort rewires your brain.',
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

