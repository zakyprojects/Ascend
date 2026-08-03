import { LeagueType, LeagueCompetitor, UserStats } from '@/types';
import { getLeaguePeriodStart } from './leagues';

export interface SeedAccountConfig {
  id: string;
  uid: string;
  username: string;
  avatar: string;
  consistencyFactor: number;
  totalPoints: number; // Lifetime overall points driving overall tier
  stats: UserStats;
  activeHabits: { name: string; category?: string; frequency: string; isPreset: boolean }[];
}

export const SEED_ACCOUNTS: SeedAccountConfig[] = [
  {
    id: 'seed_1',
    uid: '100001',
    username: 'Maya_L',
    avatar: '🦊',
    consistencyFactor: 1.1,
    totalPoints: 1250, // Diamond tier
    stats: {
      streakDays: 14,
      habitsCompletedCount: 142,
      journalEntriesCount: 22,
      exerciseMinutes: 420,
      booksRead: 4,
      skillsPracticedCount: 18,
    },
    activeHabits: [
      { name: 'Morning Meditation', category: 'Mindfulness', frequency: 'daily', isPreset: true },
      { name: '30-min Exercise', category: 'Fitness', frequency: 'daily', isPreset: true },
      { name: 'Read 20 Pages', category: 'Learning', frequency: 'daily', isPreset: true },
      { name: 'Weekly Review', category: 'Productivity', frequency: 'weekly', isPreset: true },
    ],
  },
  {
    id: 'seed_2',
    uid: '100002',
    username: 'Marcus_V',
    avatar: '🐺',
    consistencyFactor: 0.9,
    totalPoints: 780, // Platinum tier
    stats: {
      streakDays: 8,
      habitsCompletedCount: 95,
      journalEntriesCount: 15,
      exerciseMinutes: 310,
      booksRead: 2,
      skillsPracticedCount: 11,
    },
    activeHabits: [
      { name: 'Cold Shower', category: 'Health', frequency: 'daily', isPreset: true },
      { name: 'Strength Training', category: 'Fitness', frequency: 'daily', isPreset: true },
      { name: 'Hydrate 2L Water', category: 'Health', frequency: 'daily', isPreset: true },
    ],
  },
  {
    id: 'seed_3',
    uid: '100003',
    username: 'Elena_R',
    avatar: '🦅',
    consistencyFactor: 1.2,
    totalPoints: 2450, // Ace tier
    stats: {
      streakDays: 28,
      habitsCompletedCount: 260,
      journalEntriesCount: 45,
      exerciseMinutes: 890,
      booksRead: 8,
      skillsPracticedCount: 34,
    },
    activeHabits: [
      { name: 'Deep Work Session', category: 'Productivity', frequency: 'daily', isPreset: true },
      { name: 'Evening Reflection', category: 'Mindfulness', frequency: 'daily', isPreset: true },
      { name: 'Learn Spanish', category: 'Skills', frequency: 'daily', isPreset: false },
      { name: 'Run 5km', category: 'Fitness', frequency: 'weekly', isPreset: true },
    ],
  },
  {
    id: 'seed_4',
    uid: '100004',
    username: 'David_K',
    avatar: '🦁',
    consistencyFactor: 0.8,
    totalPoints: 420, // Gold tier
    stats: {
      streakDays: 4,
      habitsCompletedCount: 52,
      journalEntriesCount: 9,
      exerciseMinutes: 180,
      booksRead: 1,
      skillsPracticedCount: 6,
    },
    activeHabits: [
      { name: 'Walk 10,000 Steps', category: 'Fitness', frequency: 'daily', isPreset: true },
      { name: 'No Sugar', category: 'Health', frequency: 'daily', isPreset: false },
    ],
  },
  {
    id: 'seed_5',
    uid: '100005',
    username: 'Sophia_C',
    avatar: '🐻',
    consistencyFactor: 1.0,
    totalPoints: 1680, // Crown tier
    stats: {
      streakDays: 19,
      habitsCompletedCount: 184,
      journalEntriesCount: 31,
      exerciseMinutes: 540,
      booksRead: 5,
      skillsPracticedCount: 22,
    },
    activeHabits: [
      { name: 'Gratitude Journaling', category: 'Mindfulness', frequency: 'daily', isPreset: true },
      { name: 'Read Non-Fiction', category: 'Learning', frequency: 'daily', isPreset: true },
      { name: 'Stretching & Mobility', category: 'Fitness', frequency: 'daily', isPreset: true },
    ],
  },
  {
    id: 'seed_6',
    uid: '100006',
    username: 'Liam_O',
    avatar: '⚡',
    consistencyFactor: 0.85,
    totalPoints: 520, // Gold tier
    stats: {
      streakDays: 6,
      habitsCompletedCount: 68,
      journalEntriesCount: 11,
      exerciseMinutes: 210,
      booksRead: 2,
      skillsPracticedCount: 9,
    },
    activeHabits: [
      { name: '100 Pushups Challenge', category: 'Fitness', frequency: 'daily', isPreset: false },
      { name: 'Read Tech Articles', category: 'Learning', frequency: 'daily', isPreset: true },
    ],
  },
  {
    id: 'seed_7',
    uid: '100007',
    username: 'Nathan_P',
    avatar: '🎯',
    consistencyFactor: 1.05,
    totalPoints: 1120, // Diamond tier
    stats: {
      streakDays: 12,
      habitsCompletedCount: 130,
      journalEntriesCount: 20,
      exerciseMinutes: 380,
      booksRead: 3,
      skillsPracticedCount: 16,
    },
    activeHabits: [
      { name: 'Piano Practice', category: 'Skills', frequency: 'daily', isPreset: true },
      { name: 'Sleep Before 11 PM', category: 'Health', frequency: 'daily', isPreset: true },
      { name: 'Planning Tomorrow', category: 'Productivity', frequency: 'daily', isPreset: true },
    ],
  },
];

/**
  * Seeded pseudo-random number generator (0 to 1) based on a string/number seed.
  */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

/**
  * Calculate simulated period points for a seed account in a given league period up to `now`.
  */
export function calculateSeedAccountPoints(
  seedAccount: SeedAccountConfig,
  type: LeagueType,
  now: Date = new Date()
): number {
  const periodStart = getLeaguePeriodStart(type, now);
  const startTime = periodStart.getTime();
  const currentTime = now.getTime();

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysElapsed = Math.min(
    type === 'weekly' ? 7 : type === 'monthly' ? 31 : 90,
    Math.floor((currentTime - startTime) / msPerDay) + 1
  );

  let totalPoints = 0;

  for (let day = 0; day < daysElapsed; day++) {
    const daySeed = startTime + seedAccount.id.charCodeAt(5) * 1000 + day * 37 + (type === 'weekly' ? 101 : type === 'monthly' ? 202 : 303);
    const rand = seededRandom(daySeed);

    const roll = rand();
    let dailyPoints = 0;

    if (roll > 0.4 && roll <= 0.8) {
      dailyPoints = Math.round((5 + rand() * 10) * seedAccount.consistencyFactor);
    } else if (roll > 0.8) {
      dailyPoints = Math.round((18 + rand() * 12) * seedAccount.consistencyFactor);
    }

    totalPoints += dailyPoints;
  }

  return totalPoints;
}

/**
  * Get all seed account competitors formatted for a league leaderboard.
  */
export function getSeedCompetitors(type: LeagueType, date: Date = new Date()): LeagueCompetitor[] {
  return SEED_ACCOUNTS.map((seed) => {
    const periodPoints = calculateSeedAccountPoints(seed, type, date);
    return {
      id: seed.id,
      name: seed.username,
      avatar: seed.avatar,
      points: periodPoints,
      totalPoints: seed.totalPoints + periodPoints, // Overall total points
      isSeed: true,
      isRealUser: false,
      isProfilePublic: true, // Default visible
      stats: seed.stats,
      activeHabits: seed.activeHabits,
    };
  });
}
