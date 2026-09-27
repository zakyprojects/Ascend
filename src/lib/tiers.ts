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
    description: 'Taking the first conscious step toward personal discipline and growth.',
  },
  {
    name: 'Starter',
    minPoints: 200,
    color: '#38bdf8',
    icon: 'Rocket',
    description: 'Establishing baseline consistency across daily habits and routines.',
  },
  {
    name: 'Learner',
    minPoints: 500,
    color: '#34d399',
    icon: 'BookOpen',
    description: 'Actively absorbing lessons, refining systems, and stacking momentum.',
  },
  {
    name: 'Trainer',
    minPoints: 900,
    color: '#fb923c',
    icon: 'Dumbbell',
    description: 'Conditioning daily execution through deliberate practice and grit.',
  },
  {
    name: 'Achiever',
    minPoints: 1400,
    color: '#f59e0b',
    icon: 'Trophy',
    description: 'Consistently hitting weekly targets and resisting bad habit triggers.',
  },
  {
    name: 'Performer',
    minPoints: 2000,
    color: '#a78bfa',
    icon: 'Star',
    description: 'High-stakes execution where discipline is non-negotiable and accountable.',
  },
  {
    name: 'Expert',
    minPoints: 2700,
    color: '#14b8a6',
    icon: 'Gem',
    description: 'Deep mastery over focus, reading volume, and mental fortitude.',
  },
  {
    name: 'Leader',
    minPoints: 3500,
    color: '#ef4444',
    icon: 'Shield',
    description: 'Setting the standard in the arena with unshakeable season momentum.',
  },
  {
    name: 'Master',
    minPoints: 5000,
    color: '#eab308',
    icon: 'Crown',
    description: 'The pinnacle of daily mastery and relentless self-actualization.',
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
