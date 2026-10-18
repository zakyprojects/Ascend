import { TierBadge } from './TierBadge';
import { getCurrentTier, getNextTier, getProgressToNextTier } from '@/lib/tiers';
import { ProgressBar } from './primitives/ProgressBar';

interface RankChipProps {
  seasonPoints: number;
}

/** Season standing in the desktop sidebar. The rank-up moment itself is RankUpCelebration. */
export function RankChip({ seasonPoints }: RankChipProps) {
  const tier = getCurrentTier(seasonPoints);
  const tierKey = tier.name.toLowerCase();
  const next = getNextTier(seasonPoints);
  const progress = getProgressToNextTier(seasonPoints);

  return (
    // Season standing: rank name, points, the climb to the next rank as a thin line.
    <div className="relative px-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <TierBadge totalPoints={seasonPoints} size="sm" />
          <span className="text-lg font-semibold leading-none truncate" style={{ color: `var(--rank-${tierKey}-text)` }}>
            {tier.name}
          </span>
        </div>
        <span className="text-2xs text-content-muted tabular-nums shrink-0">
          {seasonPoints.toLocaleString()} pts
        </span>
      </div>
      <ProgressBar
        value={progress.percent}
        label={next ? `Progress to ${next.name}` : 'Top rank reached'}
        size="sm"
        className="mt-2.5"
      />
      <div className="mt-1.5 text-micro text-content-muted">
        {next ? `${(progress.needed - progress.current).toLocaleString()} to ${next.name}` : 'Top rank this season'}
      </div>
    </div>
  );
}
