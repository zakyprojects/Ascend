import { LeagueCompetitor } from '@/types';
import { TierBadge } from './TierBadge';
import { Dialog, EmptyState } from '@/components/ui/primitives';
import { Flame, CheckSquare, BookOpen, Activity, Book, Target, Lock, EyeOff } from 'lucide-react';
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
      title="Member profile"
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        {/* Profile Header */}
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-overlay-subtle flex items-center justify-center text-3xl shrink-0">
              {competitor.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold leading-tight text-content-primary truncate">{competitor.name}</h3>
                {competitor.isUser && (
                  <span className="text-2xs bg-overlay-default text-content-secondary px-2 py-0.5 rounded-full font-medium shrink-0">
                    You
                  </span>
                )}
                {competitor.isRealUser && !competitor.isUser && (
                  <span className="text-2xs text-content-muted shrink-0">
                    Member
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
                <span className="text-xs text-content-muted">League points:</span>
                <span className="figure text-xs text-content-primary">
                  {competitor.points.toLocaleString()} pts
                </span>
              </div>
            </div>
          </div>

          {/* Tier Badge */}
          <div className="shrink-0 self-start sm:self-center">
            <TierBadge totalPoints={competitor.points} size="md" showName />
          </div>
        </div>

        {/* Reciprocal Privacy Guard Notice */}
        {!canViewDetailed ? (
          <div className="card p-6 text-center space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-center text-content-subtle">
              {!viewerIsPublic ? <EyeOff size={18} /> : <Lock size={18} />}
            </div>

            {!viewerIsPublic ? (
              <>
                <h4 className="text-base font-semibold leading-tight text-content-secondary">Your profile is private</h4>
                <p className="text-xs text-content-muted max-w-sm mx-auto leading-relaxed">
                  While your profile is private, you can't see other members' stats and habits.
                </p>
                <p className="text-micro text-content-tertiary">
                  Make your profile public in the sidebar to see them.
                </p>
              </>
            ) : (
              <>
                <h4 className="text-base font-semibold leading-tight text-content-secondary">Private profile</h4>
                <p className="text-xs text-content-muted max-w-sm mx-auto leading-relaxed">
                  This member keeps their stats and habits private. Their username, rank, and league points
                  are still visible.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Statistics Section */}
            {stats && (
              <div>
                <h4 className="stat-label mb-2.5">
                  Activity
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
                          label="Current streak"
                          value={`${cDays} days`}
                          subtitle={cCat || undefined}
                        />
                        <StatCard
                          icon={CheckSquare}
                          label="Habits done"
                          value={stats.habitsCompletedCount.toLocaleString()}
                        />
                        <StatCard
                          icon={BookOpen}
                          label="Journal entries"
                          value={stats.journalEntriesCount.toLocaleString()}
                        />
                        <StatCard
                          icon={Activity}
                          label="Exercise mins"
                          value={`${stats.exerciseMinutes}m`}
                        />
                        <StatCard
                          icon={Book}
                          label="Books read"
                          value={`${stats.booksRead}`}
                        />
                        <StatCard
                          icon={Target}
                          label="Skills practiced"
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
                Active habits ({competitor.activeHabits?.length || 0})
              </h4>
              {competitor.activeHabits && competitor.activeHabits.length > 0 ? (
                <div className="rounded-xl border border-overlay-default divide-y divide-overlay-subtle max-h-48 overflow-y-auto">
                  {competitor.activeHabits.map((habit, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="item-name text-xs text-content-secondary truncate">
                          {habit.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {habit.category && (
                          <span className="text-2xs text-content-muted">
                            {habit.category}
                          </span>
                        )}
                        <span className="text-2xs text-content-muted">
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
                <h4 className="stat-label mb-2.5">
                  Past seasons & trophies ({seasonHistory.length})
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
                          <p className="figure text-xs text-content-primary">
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
  label,
  value,
  subtitle,
}: {
  icon: any;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="card p-3 flex items-center gap-2.5 min-w-0">
      <Icon size={16} className="text-content-subtle shrink-0" />
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
