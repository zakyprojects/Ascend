import { getCurrentTier, getProgressToNextTier, getNextTier } from '@/lib/tiers';
import { ProgressBar } from './primitives/ProgressBar';
import { LucideIcon } from 'lucide-react';
import { Compass, Rocket, BookOpen, Dumbbell, Trophy, Star, Gem, Shield, Crown } from 'lucide-react';

const TIER_ICONS: Record<string, LucideIcon> = {
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
          boxShadow: `0 2px 8px var(--rank-${tierKey}-glow)`,
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

interface TierProgressProps {
  totalPoints: number;
}

export function TierProgress({ totalPoints }: TierProgressProps) {
  const tier = getCurrentTier(totalPoints);
  const next = getNextTier(totalPoints);
  const progress = getProgressToNextTier(totalPoints);
  const tierKey = tier.name.toLowerCase();
  const nextKey = next ? next.name.toLowerCase() : tierKey;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {next ? (
          <span className="text-xs text-content-disabled ml-auto">
            {next.name} at <span className="figure">{next.minPoints.toLocaleString()}</span>
          </span>
        ) : (
          <span className="text-xs text-content-disabled ml-auto">Max tier reached</span>
        )}
      </div>
      <ProgressBar
        value={progress.percent}
        label={next ? `Progress to ${next.name}` : 'Rank progress'}
        size="lg"
        fillStyle={{ backgroundImage: `linear-gradient(90deg, var(--rank-${tierKey}-text), var(--rank-${nextKey}-text))` }}
      />
      {next && (
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-content-disabled ml-auto">
            <span className="figure">{(next.minPoints - totalPoints).toLocaleString()}</span> to go
          </span>
        </div>
      )}
    </div>
  );
}
