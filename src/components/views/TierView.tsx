import { getCurrentTier, getProgressToNextTier, getNextTier, TIERS, Tier } from '@/lib/tiers';
import { AppStore } from '@/lib/store';
import { LucideIcon, Medal, Award, Crown, Gem, Diamond, Star, Swords, Trophy, Check, Lock } from 'lucide-react';

const TIER_ICONS: Record<string, LucideIcon> = {
  Medal, Award, Crown, Gem, Diamond, Star, Swords, Trophy,
};

export function TierView({ store }: { store: AppStore }) {
  const totalPoints = store.state.totalPoints;
  const currentTier = getCurrentTier(totalPoints);
  const nextTier = getNextTier(totalPoints);
  const progress = getProgressToNextTier(totalPoints);
  const currentIdx = TIERS.findIndex((t) => t.name === currentTier.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-100">Ranks</h1>
        <p className="text-sm text-slate-500 mt-1">Climb the ladder from Bronze to Legend</p>
      </div>

      {/* Current tier showcase */}
      <div className="card p-6 text-center relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{ background: `radial-gradient(circle at center, ${currentTier.color}, transparent 70%)` }}
        />
        <div className="relative">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-pulse-glow"
            style={{
              backgroundColor: `${currentTier.color}15`,
              border: `2px solid ${currentTier.color}40`,
            }}
          >
            {(() => {
              const Icon = TIER_ICONS[currentTier.icon] ?? Medal;
              return <Icon size={44} style={{ color: currentTier.color }} />;
            })()}
          </div>
          <h2 className="text-2xl font-display font-bold" style={{ color: currentTier.color }}>
            {currentTier.name}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {totalPoints.toLocaleString()} total points
          </p>

          {/* Progress to next */}
          {nextTier && (
            <div className="mt-5 max-w-sm mx-auto">
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="text-slate-400">Progress to {nextTier.name}</span>
                <span className="text-slate-500">{Math.round(progress.percent)}%</span>
              </div>
              <div className="h-3 bg-bg-600 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progress.percent}%`,
                    background: `linear-gradient(90deg, ${currentTier.color}, ${nextTier.color})`,
                  }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {(nextTier.minPoints - totalPoints).toLocaleString()} points to reach {nextTier.name}
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
            const isUnlocked = totalPoints >= tier.minPoints;
            const isCurrent = tier.name === currentTier.name;
            const Icon = TIER_ICONS[tier.icon] ?? Medal;

            return (
              <div
                key={tier.name}
                className={`card p-4 flex items-center gap-4 transition-all ${
                  isCurrent ? 'border-white/10 bg-bg-700' : ''
                } ${isUnlocked ? '' : 'opacity-50'}`}
                style={isCurrent ? { boxShadow: `0 0 20px ${tier.color}20` } : {}}
              >
                {/* Rank number */}
                <div className="text-xs font-display font-bold text-slate-600 w-6 text-center">
                  {idx + 1}
                </div>

                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: isUnlocked ? `${tier.color}15` : '#1e222d',
                    border: `1.5px solid ${isUnlocked ? `${tier.color}40` : '#313747'}`,
                  }}
                >
                  {isUnlocked ? (
                    <Icon size={22} style={{ color: tier.color }} />
                  ) : (
                    <Lock size={18} className="text-slate-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold" style={{ color: isUnlocked ? tier.color : '#64748b' }}>
                      {tier.name}
                    </h3>
                    {isCurrent && (
                      <span className="badge bg-primary-500/15 text-primary-400">
                        <Check size={11} /> Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {tier.minPoints.toLocaleString()} points
                  </p>
                </div>

                {/* Checkmark if unlocked */}
                {isUnlocked && !isCurrent && (
                  <div className="w-6 h-6 rounded-full bg-primary-500/15 flex items-center justify-center">
                    <Check size={14} className="text-primary-400" />
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
                  <span className={`text-xs font-bold ${entry.amount > 0 ? 'text-primary-400' : 'text-error'}`}>
                    {entry.amount > 0 ? '+' : ''}
                    {entry.amount}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate">{entry.reason}</p>
                  <p className="text-xs text-slate-600">
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
