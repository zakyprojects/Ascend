import { useEffect, useState } from 'react';
import { TierBadge } from './TierBadge';
import { useToast } from './Toast';
import { getCurrentTier, getNextTier, getProgressToNextTier, getTierIndex } from '@/lib/tiers';
import { ProgressBar } from './primitives/ProgressBar';
import { leagueNow } from '@/lib/leagueTime';

/**
 * A tier change only counts as a rank-up moment when the newest ledger entry was
 * written just now. Hydration, cross-device merges and logins bring in older
 * entries, so they move the rank silently, as they should.
 */
const RANK_UP_FRESHNESS_MS = 10_000;

interface RankChipProps {
  seasonPoints: number;
  /** Timestamp of the newest points-ledger entry (pointsHistory[0]). */
  latestEntryTimestamp?: string;
}

export function RankChip({ seasonPoints, latestEntryTimestamp }: RankChipProps) {
  const { showToast } = useToast();
  const tierIndex = getTierIndex(seasonPoints);
  const tier = getCurrentTier(seasonPoints);
  const tierKey = tier.name.toLowerCase();
  const next = getNextTier(seasonPoints);
  const progress = getProgressToNextTier(seasonPoints);

  // Compare against the previous render so nothing fires on mount.
  const [prevTierIndex, setPrevTierIndex] = useState(tierIndex);
  const [rankUpId, setRankUpId] = useState(0);
  if (tierIndex !== prevTierIndex) {
    setPrevTierIndex(tierIndex);
    const entryTime = latestEntryTimestamp ? new Date(latestEntryTimestamp).getTime() : NaN;
    const isFreshAward = leagueNow().getTime() - entryTime < RANK_UP_FRESHNESS_MS;
    if (tierIndex > prevTierIndex && isFreshAward) {
      setRankUpId((id) => id + 1);
    }
  }

  // The toast carries the moment on mobile, where this chip (in the desktop
  // sidebar) is not visible.
  useEffect(() => {
    if (rankUpId === 0) return;
    showToast({
      type: 'success',
      title: `Rank up! You're now ${tier.name}`,
      message: `${seasonPoints.toLocaleString()} points this season.`,
      dedupKey: `rank-up:${tier.name}`,
    });
    // Fires once per rank-up; tier and points are read at that moment only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankUpId]);

  return (
    <div className="relative">
      {rankUpId > 0 && (
        <div
          key={rankUpId}
          aria-hidden="true"
          className="pointer-events-none absolute -inset-3 rounded-2xl animate-rank-glow"
          // The rank-up flash (an allowed exception to the no-glow rule) is mixed from the rank's text colour.
          style={{
            background: `radial-gradient(closest-side, color-mix(in srgb, var(--rank-${tierKey}-text) 35%, transparent), transparent)`,
          }}
        />
      )}
      {/* Season standing: rank name, points, the climb to the next rank as a thin line. */}
      <div className="relative px-1">
        <div className="flex items-center justify-between gap-2">
          <div key={rankUpId} className={`flex items-center gap-2 min-w-0 ${rankUpId > 0 ? 'animate-celebrate' : ''}`}>
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
    </div>
  );
}
