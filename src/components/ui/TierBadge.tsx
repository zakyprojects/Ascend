import { getCurrentTier } from '@/lib/tiers';
import { LucideIcon } from 'lucide-react';
import { Compass, Rocket, BookOpen, Dumbbell, Trophy, Star, Gem, Shield, Crown } from 'lucide-react';

/** Lucide icon per tier `icon` name (tiers.ts); the one map every rank view uses. */
export const TIER_ICONS: Record<string, LucideIcon> = {
  Compass,
  Rocket,
  BookOpen,
  Dumbbell,
  Trophy,
  Star,
  Gem,
  Shield,
  Crown,
};

interface TierBadgeProps {
  totalPoints: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
}

export function TierBadge({ totalPoints, size = 'md', showName = false }: TierBadgeProps) {
  const tier = getCurrentTier(totalPoints);
  const Icon = TIER_ICONS[tier.icon] ?? Compass;
  const tierKey = tier.name.toLowerCase();

  const sizes = {
    sm: { box: 'w-7 h-7', icon: 14, text: 'text-sm' },
    md: { box: 'w-10 h-10', icon: 18, text: 'text-lg' },
    lg: { box: 'w-14 h-14', icon: 24, text: 'text-xl' },
    xl: { box: 'w-20 h-20', icon: 36, text: 'text-2xl' },
  };
  const s = sizes[size];

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${s.box} rounded-xl flex items-center justify-center shrink-0`}
        style={{
          backgroundColor: `var(--rank-${tierKey}-bg)`,
          border: `1.5px solid var(--rank-${tierKey}-border)`,
        }}
      >
        <Icon size={s.icon} style={{ color: `var(--rank-${tierKey}-text)` }} />
      </div>
      {showName && (
        <div>
          <div
            className={`font-semibold leading-none ${s.text}`}
            style={{ color: `var(--rank-${tierKey}-text)` }}
          >
            {tier.name}
          </div>
          {size === 'lg' || size === 'xl' ? (
            <div className="figure text-xs text-content-disabled mt-1">{totalPoints.toLocaleString()} pts</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

