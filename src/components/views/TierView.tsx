import { getCurrentTier, getProgressToNextTier, getNextTier, TIERS, Tier } from '@/lib/tiers';
import { AppStore } from '@/lib/store';
import { LucideIcon, Compass, Rocket, BookOpen, Dumbbell, Trophy, Star, Gem, Shield, Crown, Check, Lock } from 'lucide-react';

const TIER_ICONS: Record<string, LucideIcon> = {
  Compass, Rocket, BookOpen, Dumbbell, Trophy, Star, Gem, Shield, Crown,
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function TierView({ store }: { store: AppStore }) {
  const seasonPoints = store.getLeagueData('ninetyDay').userPoints;
  const currentTier = getCurrentTier(seasonPoints);
  const nextTier = getNextTier(seasonPoints);
  const progress = getProgressToNextTier(seasonPoints);
  const currentIdx = TIERS.findIndex((t) => t.name === currentTier.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-content-primary">Ranks</h1>
        <p className="text-sm text-content-disabled mt-1">Climb the ladder from Beginner to Master</p>
      </div>

      {/* Current tier showcase */}
      <div className="card p-6 text-center relative overflow-hidden">
        <style>{`
          @keyframes pulseGlowTier {
            0%, 100% {
              box-shadow: var(--tier-pulse-min);
            }
            50% {
              box-shadow: var(--tier-pulse-max);
            }
          }
          .animate-pulse-glow-tier {
            animation: pulseGlowTier 2s ease-in-out infinite;
          }
        `}</style>
        <div
          className="absolute inset-0 opacity-10"
          style={{ background: `radial-gradient(circle at center, var(--rank-${currentTier.name.toLowerCase()}-glow), transparent 70%)` }}
        />
        <div className="relative">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-pulse-glow-tier"
            style={{
              backgroundColor: `var(--rank-${currentTier.name.toLowerCase()}-bg)`,
              border: `2px solid var(--rank-${currentTier.name.toLowerCase()}-border)`,
              '--tier-pulse-min': `0 0 20px ${hexToRgba(currentTier.color, 0.35)}`,
              '--tier-pulse-max': `0 0 30px ${hexToRgba(currentTier.color, 0.60)}`,
            } as React.CSSProperties}
          >
            {(() => {
              const Icon = TIER_ICONS[currentTier.icon] ?? Compass;
              return <Icon size={44} style={{ color: `var(--rank-${currentTier.name.toLowerCase()}-text)` }} />;
            })()}
          </div>
          <h2 className="text-2xl font-display font-bold" style={{ color: `var(--rank-${currentTier.name.toLowerCase()}-text)` }}>
            {currentTier.name}
          </h2>
          <p className="text-sm text-content-muted mt-1">
            {seasonPoints.toLocaleString()} points
          </p>

          {/* Progress to next */}
          {nextTier && (
            <div className="mt-5 max-w-sm mx-auto">
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="text-content-muted">Progress to {nextTier.name}</span>
                <span className="text-content-muted font-medium">{Math.round(progress.percent)}%</span>
              </div>
              <div className="h-3 bg-bg-600 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progress.percent}%`,
                    background: `linear-gradient(90deg, var(--rank-${currentTier.name.toLowerCase()}-text), var(--rank-${nextTier.name.toLowerCase()}-text))`,
                  }}
                />
              </div>
              <p className="text-xs text-content-muted mt-2">
                {(nextTier.minPoints - seasonPoints).toLocaleString()} points to reach {nextTier.name}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tier ladder */}
      <div>
        <h2 className="section-title mb-3">All Ranks</h2>
        <div className="space-y-2">
          {TIERS.map((tier, idx) => {
            const isUnlocked = seasonPoints >= tier.minPoints;
            const isCurrent = tier.name === currentTier.name;
            const Icon = TIER_ICONS[tier.icon] ?? Compass;
            const tierKey = tier.name.toLowerCase();

            return (
              <div
                key={tier.name}
                className={`card p-4 flex items-center gap-4 transition-all ${
                  isCurrent ? 'border-overlay-default bg-bg-700' : ''
                } ${isUnlocked ? '' : 'opacity-50'}`}
                style={isCurrent ? { boxShadow: `0 0 20px var(--rank-${tierKey}-glow)` } : {}}
              >
                {/* Rank number */}
                <div className="text-xs font-display font-bold text-content-subtle w-6 text-center">
                  {idx + 1}
                </div>

                {/* Icon */}
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    !isUnlocked ? 'bg-bg-600 border border-overlay-default text-content-subtle' : ''
                  }`}
                  style={
                    isUnlocked
                      ? {
                          backgroundColor: `var(--rank-${tierKey}-bg)`,
                          border: `1.5px solid var(--rank-${tierKey}-border)`,
                        }
                      : undefined
                  }
                >
                  {isUnlocked ? (
                    <Icon size={22} style={{ color: `var(--rank-${tierKey}-text)` }} />
                  ) : (
                    <Lock size={18} className="text-content-subtle" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className="font-display font-bold"
                      style={{ color: isUnlocked ? `var(--rank-${tierKey}-text)` : 'var(--color-content-disabled)' }}
                    >
                      {tier.name}
                    </h3>
                    {isCurrent && (
                      <span className="badge bg-primary-500/15 text-success-text">
                        <Check size={11} /> Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-content-muted mt-0.5">
                    {tier.minPoints.toLocaleString()} points
                  </p>
                  {tier.description && (
                    <p className="text-xs text-content-disabled mt-1 leading-snug">
                      {tier.description}
                    </p>
                  )}
                </div>

                {/* Checkmark if unlocked */}
                {isUnlocked && !isCurrent && (
                  <div className="w-6 h-6 rounded-full bg-primary-500/15 flex items-center justify-center">
                    <Check size={14} className="text-success-text" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Points history */}
      {store.state.pointsHistory.length > 0 && (
        <div>
          <h2 className="section-title mb-3">Recent Points</h2>
          <div className="card divide-y divide-white/5">
            {store.state.pointsHistory.slice(0, 10).map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 p-3.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    entry.amount > 0 ? 'bg-primary-500/15' : 'bg-error/15'
                  }`}
                >
                  <span className={`text-xs font-bold ${entry.amount > 0 ? 'text-brand-text' : 'text-error'}`}>
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
    </div>
  );
}
