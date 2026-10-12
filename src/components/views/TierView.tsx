import { getCurrentTier, getProgressToNextTier, getNextTier, TIERS, Tier } from '@/lib/tiers';
import { AppStore } from '@/lib/store';
import { PageColumns, ProgressBar } from '@/components/ui/primitives';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { LucideIcon, Compass, Rocket, BookOpen, Dumbbell, Trophy, Star, Gem, Shield, Crown, Check, Lock } from 'lucide-react';

const TIER_ICONS: Record<string, LucideIcon> = {
  Compass, Rocket, BookOpen, Dumbbell, Trophy, Star, Gem, Shield, Crown,
};

export function TierView({ store }: { store: AppStore }) {
  const seasonPoints = store.getLeagueData('ninetyDay').userPoints;
  const currentTier = getCurrentTier(seasonPoints);
  const nextTier = getNextTier(seasonPoints);
  const progress = getProgressToNextTier(seasonPoints);
  const currentIdx = TIERS.findIndex((t) => t.name === currentTier.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Ranks</h1>
        <p className="page-subtitle">Climb the ladder from Beginner to Master.</p>
      </div>

      <PageColumns stickyAside
        aside={
          <>
            {/* Current tier showcase */}
            <div className="card p-6 text-center">
              <div>
                <div className="flex items-center justify-center mb-3">
                  {(() => {
                    const Icon = TIER_ICONS[currentTier.icon] ?? Compass;
                    return <Icon size={32} strokeWidth={1.5} style={{ color: `var(--rank-${currentTier.name.toLowerCase()}-text)` }} />;
                  })()}
                </div>
                <h2 className="font-serif text-5xl leading-none" style={{ color: `var(--rank-${currentTier.name.toLowerCase()}-text)` }}>
                  {currentTier.name}
                </h2>
                <p className="text-sm text-content-muted mt-1">
                  <CountUp value={seasonPoints} className="figure text-content-secondary" /> points
                </p>

                {/* Progress to next */}
                {nextTier && (
                  <div className="mt-5 max-w-sm mx-auto">
                    <div className="flex items-center justify-between mb-2 text-sm">
                      <span className="text-content-muted">Progress to {nextTier.name}</span>
                      <span className="figure text-content-secondary"><CountUp value={Math.round(progress.percent)} />%</span>
                    </div>
                    <ProgressBar
                      value={progress.percent}
                      label={`Progress to ${nextTier.name}`}
                      size="lg"
                      fillStyle={{
                        background: `linear-gradient(90deg, var(--rank-${currentTier.name.toLowerCase()}-text), var(--rank-${nextTier.name.toLowerCase()}-text))`,
                      }}
                    />
                    <p className="text-xs text-content-muted mt-2">
                      {(nextTier.minPoints - seasonPoints).toLocaleString()} points to reach {nextTier.name}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        }
      >
        {/* Tier ladder */}
        <div>
          <h2 className="section-title mb-3">All Ranks</h2>
          <div className="card divide-y divide-overlay-subtle overflow-hidden">
            {TIERS.map((tier, idx) => {
              const isUnlocked = seasonPoints >= tier.minPoints;
              const isCurrent = tier.name === currentTier.name;
              const Icon = TIER_ICONS[tier.icon] ?? Compass;
              const tierKey = tier.name.toLowerCase();

              return (
                <Reveal key={tier.name} index={idx}>
                <div
                  className={`p-4 flex items-center gap-4 ${
                    isCurrent ? 'bg-overlay-subtle' : ''
                  } ${isUnlocked ? '' : 'opacity-50'}`}
                >
                  {/* Rank number */}
                  <div className="figure text-xs text-content-subtle w-6 text-center">
                    {idx + 1}
                  </div>

                  {/* Icon */}
                  <div className="w-6 flex items-center justify-center shrink-0">
                    {isUnlocked ? (
                      <Icon size={18} style={{ color: `var(--rank-${tierKey}-text)` }} />
                    ) : (
                      <Lock size={16} className="text-content-subtle" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className="text-lg font-semibold leading-none"
                        style={{ color: isUnlocked ? `var(--rank-${tierKey}-text)` : 'var(--color-content-disabled)' }}
                      >
                        {tier.name}
                      </h3>
                      {isCurrent && (
                        <span className="badge badge-emerald">
                          <Check size={11} /> Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-content-muted mt-0.5">
                      <span className="figure">{tier.minPoints.toLocaleString()}</span> points
                    </p>
                    {tier.description && (
                      <p className="text-xs text-content-disabled mt-1 leading-snug">
                        {tier.description}
                      </p>
                    )}
                  </div>

                  {/* Checkmark if unlocked */}
                  {isUnlocked && !isCurrent && (
                    <Check size={16} className="text-success-text shrink-0" />
                  )}
                </div>
                </Reveal>
              );
            })}
          </div>
        </div>

        {/* Points history */}
        {store.state.pointsHistory.length > 0 && (
          <div>
            <h2 className="section-title mb-3">Recent Points</h2>
            <div className="card divide-y divide-overlay-subtle">
              {store.state.pointsHistory.slice(0, 10).map((entry) => (
                <div key={entry.id} className="scroll-rise flex items-center gap-3 p-3.5">
                  <div className="w-10 text-right shrink-0">
                    <span className={`figure text-xs ${entry.amount > 0 ? 'text-brand-text' : 'text-error'}`}>
                      {entry.amount > 0 ? '+' : ''}
                      {entry.amount}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-content-tertiary truncate">{entry.reason}</p>
                    <p className="text-xs text-content-subtle">
                      {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' at '}
                      {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PageColumns>
    </div>
  );
}
