export interface Tier {
  name: string;
  minPoints: number;
  color: string;
  icon: string; // lucide icon name
}

export const TIERS: Tier[] = [
  { name: 'Bronze', minPoints: 0, color: '#cd7f32', icon: 'Medal' },
  { name: 'Silver', minPoints: 100, color: '#c0c0c0', icon: 'Award' },
  { name: 'Gold', minPoints: 300, color: '#fbbf24', icon: 'Crown' },
  { name: 'Platinum', minPoints: 600, color: '#e5e7eb', icon: 'Gem' },
  { name: 'Diamond', minPoints: 1000, color: '#60a5fa', icon: 'Diamond' },
  { name: 'Crown', minPoints: 1500, color: '#f472b6', icon: 'Crown' },
  { name: 'Ace', minPoints: 2200, color: '#34d399', icon: 'Star' },
  { name: 'Conqueror', minPoints: 3000, color: '#f97316', icon: 'Swords' },
  { name: 'Legend', minPoints: 5000, color: '#a855f7', icon: 'Trophy' },
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
