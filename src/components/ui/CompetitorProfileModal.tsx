import { LeagueCompetitor } from '@/types';
import { TierBadge } from './TierBadge';
import { Dialog, EmptyState } from '@/components/ui/primitives';
import { Flame, CheckSquare, BookOpen, Activity, Book, Target, Lock, ShieldCheck, CheckCircle2, EyeOff, Trophy } from 'lucide-react';
import { getProfileStreakStats } from '@/lib/streakLogic';
import { getCurrentTier } from '@/lib/tiers';

interface CompetitorProfileModalProps {
  competitor: LeagueCompetitor | null;
  viewerIsPublic?: boolean;
  open: boolean;
  onClose: () => void;
}

export function CompetitorProfileModal({
  competitor,
  viewerIsPublic = true,
  open,
  onClose,
}: CompetitorProfileModalProps) {
  if (!competitor) return null;

  const isSelf = competitor.isUser;
  const targetIsPublic = competitor.isProfilePublic ?? true;
  const canViewDetailed = isSelf || (viewerIsPublic && targetIsPublic);

  const stats = competitor.stats;
  const seasonHistory = competitor.season_history || competitor.stats?.season_history;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="User Profile & Achievements"
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        {/* Profile Header */}
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center text-3xl shrink-0 shadow-sm">
              {competitor.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-serif text-2xl leading-tight text-content-primary truncate">{competitor.name}</h3>
                {competitor.isUser && (
                  <span className="text-2xs bg-primary-500/20 text-brand-text border border-primary-500/30 px-2 py-0.5 rounded-full font-semibold shrink-0">
                    You
                  </span>
                )}
                {competitor.isRealUser && !competitor.isUser && (
                  <span className="badge-emerald text-2xs font-medium flex items-center gap-1 px-2 py-0.5 rounded-md shrink-0">
                    <CheckCircle2 size={10} /> Member
                  </span>
                )}
              </div>

              {/* UID Display directly under username */}
              {(competitor.uid || competitor.id) && (
                <div className="text-micro font-mono tabular-nums text-content-muted mt-0.5 truncate">
                  ID: #{competitor.uid || competitor.id?.slice(0, 8)}
                </div>
              )}

              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-content-muted">League Points:</span>
                <span className="figure text-xs text-brand-text">
                  {competitor.points.toLocaleString()} pts
                </span>
              </div>
            </div>
          </div>

          {/* Tier Badge */}
          <div className="shrink-0 bg-bg-700/80 p-2.5 rounded-xl border border-overlay-default self-start sm:self-center">
            <TierBadge totalPoints={competitor.points} size="md" showName />
          </div>
        </div>

        {/* Reciprocal Privacy Guard Notice */}
        {!canViewDetailed ? (
          <div className="card p-6 text-center space-y-2.5 animate-fade-in">
            <div className="w-10 h-10 rounded-xl bg-bg-700 flex items-center justify-center mx-auto text-content-muted">
              {!viewerIsPublic ? <EyeOff size={20} /> : <Lock size={20} />}
            </div>

            {!viewerIsPublic ? (
              <>
                <h4 className="font-serif text-xl leading-tight text-content-secondary">Reciprocal Privacy Active</h4>
                <p className="text-xs text-content-muted max-w-sm mx-auto leading-relaxed">
                  Because you have set your own profile to private, other members' detailed statistics and active habits are hidden from you.
                </p>
                <p className="text-micro text-brand-text font-medium">
                  Enable your public profile setting in the sidebar to view member achievements.
                </p>
              </>
            ) : (
              <>
                <h4 className="font-serif text-xl leading-tight text-content-secondary">Private Profile</h4>
                <p className="text-xs text-content-muted max-w-sm mx-auto leading-relaxed">
                  This user has set their detailed statistics and active habits list to private.
                  Their username, tier rank, and league points remain visible.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Statistics Section */}
            {stats && (
              <div>
                <h4 className="stat-label mb-2.5 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-brand-text" />
                  Activity Statistics
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(() => {
                    const streakStats = getProfileStreakStats(stats);
                    const cDays = streakStats.currentStreakDays;
                    const cCat = streakStats.currentStreakCategory;
                    return (
                      <>
                        <StatCard
                          icon={Flame}
                          color="#10b981"
                          label="Current Streak"
                          value={`${cDays} days`}
                          subtitle={cCat || undefined}
                        />
                        <StatCard
                          icon={CheckSquare}
                          color="#10b981"
                          label="Habits Done"
                          value={stats.habitsCompletedCount.toLocaleString()}
                        />
                        <StatCard
                          icon={BookOpen}
                          color="#10b981"
                          label="Journal Entries"
                          value={stats.journalEntriesCount.toLocaleString()}
                        />
                        <StatCard
                          icon={Activity}
                          color="#10b981"
                          label="Exercise Mins"
                          value={`${stats.exerciseMinutes}m`}
                        />
                        <StatCard
                          icon={Book}
                          color="#10b981"
                          label="Books Read"
                          value={`${stats.booksRead}`}
                        />
                        <StatCard
                          icon={Target}
                          color="#10b981"
                          label="Skills Practiced"
                          value={`${stats.skillsPracticedCount}`}
                        />
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Currently Active Habits */}
            <div>
              <h4 className="stat-label mb-2.5">
                Active Habits ({competitor.activeHabits?.length || 0})
              </h4>
              {competitor.activeHabits && competitor.activeHabits.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {competitor.activeHabits.map((habit, idx) => (
                    <div
                      key={idx}
                      className="card p-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-primary-400 shrink-0" />
                        <span className="item-name text-xs text-content-secondary truncate">
                          {habit.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {habit.category && (
                          <span className="text-2xs bg-bg-700 text-content-muted px-2 py-0.5 rounded-md border border-overlay-subtle">
                            {habit.category}
                          </span>
                        )}
                        <span className="text-2xs bg-primary-500/10 text-brand-text px-2 py-0.5 rounded-md font-mono uppercase tracking-[0.06em] font-medium">
                          {habit.frequency}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  size="sm"
                  title="No active habits shared yet."
                />
              )}
            </div>

            {/* Past Seasons & Trophies */}
            {seasonHistory && seasonHistory.length > 0 && (
              <div>
                <h4 className="stat-label mb-2.5 flex items-center gap-1.5">
                  <Trophy size={14} className="text-brand-text" />
                  Past Seasons & Trophies ({seasonHistory.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                  {seasonHistory.map((historyRecord, idx) => {
                    const tier = getCurrentTier(historyRecord.points);
                    return (
                      <div
                        key={idx}
                        className="card p-3 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="shrink-0">
                            <TierBadge totalPoints={historyRecord.points} size="sm" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="item-name text-xs text-content-secondary truncate">
                              {historyRecord.seasonName}
                            </p>
                            <p className="text-2xs font-medium truncate" style={{ color: `var(--rank-${tier.name.toLowerCase()}-text)` }}>
                              {tier.name} Tier
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="figure text-xs text-brand-text">
                            {historyRecord.points.toLocaleString()} pts
                          </p>
                          {historyRecord.date && (
                            <p className="figure text-2xs text-content-disabled">
                              {historyRecord.date}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

function StatCard({
  icon: Icon,
  color,
  label,
  value,
  subtitle,
}: {
  icon: any;
  color: string;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="card p-3 flex items-center gap-2.5 min-w-0">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="stat-label truncate">{label}</p>
        <p className="figure text-sm text-content-primary truncate mt-0.5">{value}</p>
        {subtitle && (
          <p className="text-2xs text-[color:var(--badge-neutral-text)] truncate mt-0.5" title={`Source: ${subtitle}`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
