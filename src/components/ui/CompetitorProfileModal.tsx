import { Modal } from './Modal';
import { LeagueCompetitor } from '@/types';
import { TierBadge } from './TierBadge';
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
    <Modal
      open={open}
      onClose={onClose}
      title="User Profile & Achievements"
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        {/* Profile Header */}
        <div className="p-4 bg-bg-800 rounded-2xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-600/30 border border-primary-500/30 flex items-center justify-center text-3xl shrink-0 shadow-lg">
              {competitor.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-display font-bold text-slate-100 truncate">{competitor.name}</h3>
                {competitor.isUser && (
                  <span className="text-[10px] bg-primary-500/20 text-primary-300 border border-primary-500/30 px-2 py-0.5 rounded-full font-bold shrink-0">
                    You
                  </span>
                )}
                {competitor.isRealUser && !competitor.isUser && (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium shrink-0">
                    <CheckCircle2 size={10} /> Member
                  </span>
                )}
              </div>

              {/* UID Display directly under username */}
              {(competitor.uid || competitor.id) && (
                <div className="text-[11px] font-mono text-slate-400 mt-0.5 tracking-tight truncate">
                  ID: #{competitor.uid || competitor.id?.slice(0, 8)}
                </div>
              )}

              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-400">League Points:</span>
                <span className="text-xs font-display font-bold text-primary-400">
                  {competitor.points.toLocaleString()} pts
                </span>
              </div>
            </div>
          </div>

          {/* Tier Badge */}
          <div className="shrink-0 bg-bg-700/80 p-2.5 rounded-xl border border-white/5 self-start sm:self-center">
            <TierBadge totalPoints={competitor.totalPoints || competitor.points} size="md" showName />
          </div>
        </div>

        {/* Reciprocal Privacy Guard Notice */}
        {!canViewDetailed ? (
          <div className="p-6 bg-bg-800/60 border border-white/10 rounded-2xl text-center space-y-2.5 animate-fade-in">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              {!viewerIsPublic ? <EyeOff size={20} className="text-amber-400" /> : <Lock size={20} />}
            </div>

            {!viewerIsPublic ? (
              <>
                <h4 className="text-sm font-bold text-slate-200">Reciprocal Privacy Active</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Because you have set your own profile to private, other members' detailed statistics and active habits are hidden from you.
                </p>
                <p className="text-[11px] text-amber-400/90 font-medium">
                  Enable your public profile setting in the sidebar to view member achievements.
                </p>
              </>
            ) : (
              <>
                <h4 className="text-sm font-bold text-slate-200">Private Profile</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
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
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-primary-400" />
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
                          color="#f59e0b"
                          label="Current Streak"
                          value={`${cDays} days`}
                          subtitle={cCat || undefined}
                        />
                        <StatCard
                          icon={CheckSquare}
                          color="#34d399"
                          label="Habits Done"
                          value={stats.habitsCompletedCount.toLocaleString()}
                        />
                        <StatCard
                          icon={BookOpen}
                          color="#0ea5e9"
                          label="Journal Entries"
                          value={stats.journalEntriesCount.toLocaleString()}
                        />
                        <StatCard
                          icon={Activity}
                          color="#14b8a6"
                          label="Exercise Mins"
                          value={`${stats.exerciseMinutes}m`}
                        />
                        <StatCard
                          icon={Book}
                          color="#fbbf24"
                          label="Books Read"
                          value={`${stats.booksRead}`}
                        />
                        <StatCard
                          icon={Target}
                          color="#f472b6"
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
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                Active Habits ({competitor.activeHabits?.length || 0})
              </h4>
              {competitor.activeHabits && competitor.activeHabits.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {competitor.activeHabits.map((habit, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-bg-800 rounded-xl border border-white/5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-primary-400 shrink-0" />
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {habit.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {habit.category && (
                          <span className="text-[10px] bg-bg-700 text-slate-400 px-2 py-0.5 rounded-md border border-white/5">
                            {habit.category}
                          </span>
                        )}
                        <span className="text-[10px] bg-primary-500/10 text-primary-300 px-2 py-0.5 rounded-md uppercase font-bold">
                          {habit.frequency}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-bg-800 rounded-xl text-center text-xs text-slate-500">
                  No active habits shared yet.
                </div>
              )}
            </div>

            {/* Past Seasons & Trophies */}
            {seasonHistory && seasonHistory.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Trophy size={14} className="text-amber-400" />
                  Past Seasons & Trophies ({seasonHistory.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                  {seasonHistory.map((historyRecord, idx) => {
                    const tier = getCurrentTier(historyRecord.points);
                    return (
                      <div
                        key={idx}
                        className="p-3 bg-bg-800 rounded-xl border border-white/5 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="shrink-0">
                            <TierBadge totalPoints={historyRecord.points} size="sm" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-200 truncate">
                              {historyRecord.seasonName}
                            </p>
                            <p className="text-[10px] font-medium truncate" style={{ color: tier.color }}>
                              {tier.name} Tier
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-primary-400">
                            {historyRecord.points.toLocaleString()} pts
                          </p>
                          {historyRecord.date && (
                            <p className="text-[10px] text-slate-500">
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
    </Modal>
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
    <div className="p-3 bg-bg-800 rounded-xl border border-white/5 flex items-center gap-2.5 min-w-0">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-slate-400 truncate">{label}</p>
        <p className="text-xs font-bold text-slate-200 truncate">{value}</p>
        {subtitle && (
          <p className="text-[10px] text-orange-400/90 font-medium truncate mt-0.5" title={`Source: ${subtitle}`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
