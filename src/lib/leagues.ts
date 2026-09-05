import { LeagueType, LeagueCompetitor, LeagueArchive, PointsEntry, UserProfile, EvictedExcisionRecord, AppState } from '@/types';
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
export function calculatePeriodPoints(
  pointsHistory: PointsEntry[],
  start: Date,
  end: Date = new Date(),
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
    season_history: currentUser?.season_history || userStats?.season_history,
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

export function calculateSeasonalTotal(
  seasonEvictedPos: number = 0,
  seasonEvictedNeg: number = 0,
  history: PointsEntry[] = [],
  seasonStart: Date = startOfNinetyDayCycle(),
  evictedExcisionRecords: EvictedExcisionRecord[] = [],
  activeSeasonNumber?: number
): number {
  const targetSeason = typeof activeSeasonNumber === 'number' ? activeSeasonNumber : getSeasonNumber();
  let seasonExcisedPosOffset = 0;
  let seasonExcisedNegOffset = 0;

  for (const rec of evictedExcisionRecords || []) {
    if (rec && rec.seasonNumber === targetSeason) {
      if (typeof rec.posAmount === 'number' && rec.posAmount > 0) {
        seasonExcisedPosOffset += rec.posAmount;
      }
      if (typeof rec.negAmount === 'number' && rec.negAmount > 0) {
        seasonExcisedNegOffset += rec.negAmount;
      }
    }
  }

  const effectivePos = Math.max(0, seasonEvictedPos - seasonExcisedPosOffset);
  const effectiveNeg = Math.max(0, seasonEvictedNeg - seasonExcisedNegOffset);

  if (!history || history.length === 0) {
    return Math.max(0, effectivePos - effectiveNeg);
  }

  // Sort chronological
  const sorted = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  let current = effectivePos - effectiveNeg;

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

/**
 * Computes the live effective season points for the currently active season.
 * If state.seasonId is behind the live season, stale evicted scalar baselines and excision records
 * are ignored (treated as 0/empty), falling back cleanly to pointsHistory filtered from startOfNinetyDayCycle().
 */
export function getEffectiveSeasonPoints(state: AppState, now: Date = new Date()): number {
  const liveSeason = getSeasonNumber(now);
  const evictedValid = state.seasonId === liveSeason;

  const effectivePos = evictedValid ? (state.seasonEvictedPos || 0) : 0;
  const effectiveNeg = evictedValid ? (state.seasonEvictedNeg || 0) : 0;
  const effectiveExcisionRecords = evictedValid
    ? (state.evictedExcisionRecords || []).filter((r) => r && r.seasonNumber === liveSeason)
    : [];

  return calculateSeasonalTotal(
    effectivePos,
    effectiveNeg,
    state.pointsHistory || [],
    startOfNinetyDayCycle(now),
    effectiveExcisionRecords,
    liveSeason
  );
}

export function createDeterministicArchiveId(seasonNumber: number): string {
  return `archive-ninetyDay-season-${seasonNumber}`;
}

