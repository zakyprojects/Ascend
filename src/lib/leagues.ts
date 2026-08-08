import { LeagueType, LeagueCompetitor, LeagueArchive, PointsEntry, UserProfile } from '@/types';
import { getSeedCompetitors } from './seedAccounts';
import { getRegisteredCompetitors } from './auth';

/** Start of the current week (Monday at 00:00:00) */
export function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  // day: 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** End of the current week (Sunday 23:59:59.999) */
export function endOfWeek(date = new Date()): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Start of the current month (1st at 00:00:00) */
export function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/** End of the current month (last day at 23:59:59.999) */
export function endOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Start of the current 90-day cycle */
export function startOfNinetyDayCycle(date = new Date()): Date {
  // Anchored epoch: August 1, 2026
  const epoch = new Date(2026, 7, 1, 0, 0, 0, 0);
  const msPerCycle = 90 * 24 * 60 * 60 * 1000;
  const elapsed = date.getTime() - epoch.getTime();
  const cyclesPassed = elapsed < 0 ? 0 : Math.floor(elapsed / msPerCycle);
  return new Date(epoch.getTime() + cyclesPassed * msPerCycle);
}

/** End of the current 90-day cycle */
export function endOfNinetyDayCycle(date = new Date()): Date {
  const start = startOfNinetyDayCycle(date);
  return new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000 - 1);
}

/** Returns the current Season number (Season 1 starts August 1, 2026 and increments every 90 days) */
export function getSeasonNumber(date = new Date()): number {
  const epoch = new Date(2026, 7, 1, 0, 0, 0, 0);
  const msPerCycle = 90 * 24 * 60 * 60 * 1000;
  const elapsed = date.getTime() - epoch.getTime();
  if (elapsed < 0) return 1;
  return 1 + Math.floor(elapsed / msPerCycle);
}

/** Returns formatted Season label (e.g. "Season 1") */
export function getSeasonLabel(date = new Date()): string {
  return `Season ${getSeasonNumber(date)}`;
}

export function getLeaguePeriodStart(type: LeagueType, date = new Date()): Date {
  switch (type) {
    case 'weekly': return startOfWeek(date);
    case 'monthly': return startOfMonth(date);
    case 'ninetyDay': return startOfNinetyDayCycle(date);
  }
}

export function getLeaguePeriodEnd(type: LeagueType, date = new Date()): Date {
  switch (type) {
    case 'weekly': return endOfWeek(date);
    case 'monthly': return endOfMonth(date);
    case 'ninetyDay': return endOfNinetyDayCycle(date);
  }
}

export function getLeaguePeriodLabel(type: LeagueType, date = new Date()): string {
  switch (type) {
    case 'weekly': {
      const start = startOfWeek(date);
      const end = endOfWeek(date);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    case 'monthly': {
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    case 'ninetyDay': {
      const seasonLabel = getSeasonLabel(date);
      const start = startOfNinetyDayCycle(date);
      const end = endOfNinetyDayCycle(date);
      return `${seasonLabel} (${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`;
    }
  }
}

/** Returns milliseconds until the current period ends */
export function getTimeUntilReset(type: LeagueType, now = new Date()): number {
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
export function calculatePeriodPoints(pointsHistory: PointsEntry[], start: Date, end: Date = new Date()): number {
  const sum = (pointsHistory || [])
    .filter((entry) => {
      const ts = new Date(entry.timestamp);
      return ts >= start && ts <= end;
    })
    .reduce((acc, entry) => acc + (entry.amount || 0), 0);
  return Math.max(0, sum);
}

/**
 * Generate full leaderboard competitors including current user, registered real users, and seed accounts.
 */
export function generateCompetitors(
  type: LeagueType,
  userPoints: number,
  currentUser: UserProfile | null,
  usernameFallback: string,
  totalPoints: number = 0,
  userStats?: any,
  activeHabits?: any[],
  date = new Date()
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
    isSeed: false,
    isProfilePublic: currentUser?.isProfilePublic ?? true,
    stats: userStats,
    activeHabits: activeHabits,
  };

  // 2. All other registered real users
  const otherRealCompetitors = getRegisteredCompetitors(type, currentUserId, date);

  // 3. Seed accounts (realistic filler accounts)
  const seedCompetitors = getSeedCompetitors(type, date);

  // Merge all competitors
  const allCompetitors: LeagueCompetitor[] = [
    activeUserCompetitor,
    ...otherRealCompetitors,
    ...seedCompetitors,
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

export function createArchive(
  type: LeagueType,
  competitors: LeagueCompetitor[],
  userRank: number,
  userPoints: number,
  periodLabel: string
): LeagueArchive {
  return {
    type,
    periodLabel,
    competitors,
    userRank,
    userPoints,
    archivedAt: new Date().toISOString(),
  };
}

export const LEAGUE_CONFIG: Record<LeagueType, { name: string; description: string; resetDetail: string; icon: string; color: string }> = {
  weekly: {
    name: 'Weekly League',
    description: 'Compete every week based on points earned.',
    resetDetail: 'Resets every Monday at midnight',
    icon: 'Calendar',
    color: '#34d399',
  },
  monthly: {
    name: 'Monthly League',
    description: 'Monthly competition tracking consistency.',
    resetDetail: 'Resets on the 1st of every calendar month',
    icon: 'CalendarDays',
    color: '#0ea5e9',
  },
  ninetyDay: {
    name: '90-Day League',
    description: 'The neuroplasticity league. 90 days of sustained effort rewires your brain.',
    resetDetail: 'Resets every 90 days from cycle start',
    icon: 'Brain',
    color: '#a855f7',
  },
};
