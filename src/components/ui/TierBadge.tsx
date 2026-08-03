import { getCurrentTier, getProgressToNextTier, getNextTier } from '@/lib/tiers';
import { LucideIcon } from 'lucide-react';
import { Medal, Award, Crown, Gem, Diamond, Star, Swords, Trophy } from 'lucide-react';

const TIER_ICONS: Record<string, LucideIcon> = {
  Medal,
  Award,
  Crown,
  Gem,
  Diamond,
  Star,
  Swords,
  Trophy,
};

interface TierBadgeProps {
  totalPoints: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
}

export function TierBadge({ totalPoints, size = 'md', showName = false }: TierBadgeProps) {
  const tier = getCurrentTier(totalPoints);
  const Icon = TIER_ICONS[tier.icon] ?? Medal;

  const sizes = {
    sm: { box: 'w-7 h-7', icon: 14, text: 'text-xs' },
    md: { box: 'w-10 h-10', icon: 18, text: 'text-sm' },
    lg: { box: 'w-14 h-14', icon: 24, text: 'base' },
    xl: { box: 'w-20 h-20', icon: 36, text: 'text-lg' },
  };
  const s = sizes[size];

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${s.box} rounded-xl flex items-center justify-center shrink-0`}
        style={{
          backgroundColor: `${tier.color}15`,
          border: `1.5px solid ${tier.color}40`,
          boxShadow: `0 0 12px ${tier.color}20`,
        }}
      >
        <Icon size={s.icon} style={{ color: tier.color }} />
      </div>
      {showName && (
        <div>
          <div className={`font-display font-bold text-slate-100 ${s.text}`}>{tier.name}</div>
          {size === 'lg' || size === 'xl' ? (
            <div className="text-xs text-slate-500">{totalPoints.toLocaleString()} pts</div>
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

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-300">{tier.name}</span>
        {next ? (
          <span className="text-xs text-slate-500">
            {next.name} at {next.minPoints.toLocaleString()}
          </span>
        ) : (
          <span className="text-xs text-slate-500">Max tier reached</span>
        )}
      </div>
      <div className="h-2.5 bg-bg-600 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progress.percent}%`,
            background: `linear-gradient(90deg, ${tier.color}, ${next?.color ?? tier.color})`,
          }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-slate-500">{totalPoints.toLocaleString()} total</span>
        {next && (
          <span className="text-xs text-slate-500">
            {(next.minPoints - totalPoints).toLocaleString()} to go
          </span>
        )}
      </div>
    </div>
  );
}
