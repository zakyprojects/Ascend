export interface Tier {
  name: string;
  minPoints: number;
  color: string;
  icon: string; // lucide icon name
  description: string;
}

export const TIERS: Tier[] = [
  {
    name: 'Beginner',
    minPoints: 0,
    color: '#94a3b8',
    icon: 'Compass',
    description: 'Where everyone starts each season.',
  },
  {
    name: 'Starter',
    minPoints: 200,
    color: '#38bdf8',
    icon: 'Rocket',
    description: 'You have made a start on your daily habits.',
  },
  {
    name: 'Learner',
    minPoints: 500,
    color: '#34d399',
    icon: 'BookOpen',
    description: 'Your daily routine is starting to stick.',
  },
  {
    name: 'Trainer',
    minPoints: 900,
    color: '#fb923c',
    icon: 'Dumbbell',
    description: 'You put in the work on most days.',
  },
  {
    name: 'Achiever',
    minPoints: 1400,
    color: '#a3e635',
    icon: 'Trophy',
    description: 'Your steady work is paying off.',
  },
  {
    name: 'Performer',
    minPoints: 2000,
    color: '#a78bfa',
    icon: 'Swords',
    description: 'From this rank up, misses in a row cost more points.',
  },
  {
    name: 'Expert',
    minPoints: 2700,
    color: '#14b8a6',
    icon: 'Crosshair',
    description: 'You keep a strong pace through the season.',
  },
  {
    name: 'Leader',
    minPoints: 3500,
    color: '#ef4444',
    icon: 'Flag',
    description: 'You are close to the top of the ladder.',
  },
  {
    name: 'Master',
    minPoints: 5000,
    color: '#eab308',
    icon: 'Crown',
    description: 'The top rank of the season.',
  },
];

export function getCurrentTier(totalPoints: number): Tier {
  let current = TIERS[0];
  for (const tier of TIERS) {
    if (totalPoints >= tier.minPoints) current = tier;
  }
  return current;
}

export function getNextTier(totalPoints: number): Tier | null {
  for (const tier of TIERS) {
    if (totalPoints < tier.minPoints) return tier;
  }
  return null;
}

export function getTierIndex(totalPoints: number): number {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (totalPoints >= TIERS[i].minPoints) idx = i;
  }
  return idx;
}

export function getProgressToNextTier(totalPoints: number): { current: number; needed: number; percent: number } {
  const current = getCurrentTier(totalPoints);
  const next = getNextTier(totalPoints);
  if (!next) return { current: totalPoints, needed: current.minPoints, percent: 100 };
  const range = next.minPoints - current.minPoints;
  const progress = totalPoints - current.minPoints;
  return { current: progress, needed: range, percent: Math.min(100, (progress / range) * 100) };
}
