import { useState, useEffect } from 'react';
import { Trophy, Clock, Crown, Brain, Calendar, CalendarDays, ChevronDown, Archive, Sparkles, UserCheck, ChevronRight } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { LeagueType, LeagueCompetitor } from '@/types';
import { LEAGUE_CONFIG, formatCountdown, getTimeUntilReset, getLeaguePeriodLabel, getSeasonLabel, getLocalResetDetail } from '@/lib/leagues';
import { leagueNow } from '@/lib/leagueTime';
import { Modal } from '@/components/ui/Modal';
import { TierBadge } from '@/components/ui/TierBadge';
import { CompetitorProfileModal } from '@/components/ui/CompetitorProfileModal';

const LEAGUE_ICONS: Record<string, typeof Trophy> = {
  Calendar, CalendarDays, Brain,
};

interface LeaguesProps {
  store: AppStore;
  onOpenAuthModal?: () => void;
}

export function Leagues({ store, onOpenAuthModal }: LeaguesProps) {
  const [activeLeague, setActiveLeague] = useState<LeagueType>('weekly');
  const [showArchive, setShowArchive] = useState<LeagueType | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<LeagueCompetitor | null>(null);
  const [, setTick] = useState(0);

  // Tick every second for live reset countdowns
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const now = leagueNow();
  const leagueData = store.getLeagueData(activeLeague);
  const config = LEAGUE_CONFIG[activeLeague];
  const countdown = formatCountdown(getTimeUntilReset(activeLeague, now));
  const periodLabel = getLeaguePeriodLabel(activeLeague, now);
  const archives = store.state.leagueArchives.filter((a) => a.type === activeLeague);

  const currentUser = store.state.currentUser;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-content-primary">Leagues</h1>
          <p className="text-sm text-content-disabled mt-1">Compete with real users, view ranks, and climb tiers</p>
        </div>
        {!currentUser && onOpenAuthModal && (
          <button
            onClick={onOpenAuthModal}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/20 hover:bg-primary-500/30 border border-primary-500/30 text-brand-text text-xs font-semibold rounded-xl transition-all"
          >
            <Sparkles size={14} />
            <span>Sign Up to Claim Username</span>
          </button>
        )}
      </div>

      {/* Guest Mode Banner */}
      {(!currentUser || currentUser.isAnonymous) && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-primary-500/10 via-primary-600/10 to-primary-500/5 border border-primary-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-500/20 flex items-center justify-center shrink-0 text-brand-text">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-content-secondary">
                You are competing as Guest ({currentUser?.username || store.state.username})
              </p>
              <p className="text-[11px] text-content-muted">
                Save your progress — create a permanent account to lock in your rank and pick a custom username.
              </p>
            </div>
          </div>
          {onOpenAuthModal && (
            <button
              onClick={onOpenAuthModal}
              className="px-3.5 py-1.5 bg-primary-500 hover:bg-primary-600 text-on-brand text-xs font-semibold rounded-lg shadow-md transition-all shrink-0 w-full sm:w-auto"
            >
              Save Progress / Create Account
            </button>
          )}
        </div>
      )}

      {/* League tabs */}
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(LEAGUE_CONFIG) as LeagueType[]).map((type) => {
          const cfg = LEAGUE_CONFIG[type];
          const Icon = LEAGUE_ICONS[cfg.icon] ?? Calendar;
          const active = activeLeague === type;
          const data = store.getLeagueData(type);
          return (
            <button
              key={type}
              onClick={() => setActiveLeague(type)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                active
                  ? 'glass-strong border-2'
                  : 'card card-hover border-2 border-transparent'
              }`}
              style={active ? { borderColor: `${cfg.color}50` } : {}}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${cfg.color}15` }}
              >
                <Icon size={20} style={{ color: cfg.color }} />
              </div>
              <span
                className="text-xs font-display font-bold"
                style={{ color: active ? cfg.color : '#94a3b8' }}
              >
                {type === 'ninetyDay' ? `90-Day (${getSeasonLabel(now)})` : type === 'monthly' ? 'Monthly' : 'Weekly'}
              </span>
              <span className="text-[10px] text-content-disabled">Rank #{data.userRank}</span>
            </button>
          );
        })}
      </div>

      {/* Active league leaderboard */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${config.color}15` }}
            >
              {(() => {
                const Icon = LEAGUE_ICONS[config.icon] ?? Calendar;
                return <Icon size={16} style={{ color: config.color }} />;
              })()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="section-title">
                  {activeLeague === 'ninetyDay' ? `${getSeasonLabel(now)} — 90-Day League` : config.name}
                </h2>
                {activeLeague === 'ninetyDay' && (
                  <span className="text-[10px] badge-purple px-2 py-0.5 rounded-full font-bold">
                    Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-content-muted">{getLocalResetDetail(activeLeague, now)}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-bg-800 rounded-lg border border-overlay-subtle text-xs text-content-tertiary self-start sm:self-auto">
            <Clock size={13} className="text-content-muted" />
            <span className="text-[11px] text-content-muted">
              {activeLeague === 'ninetyDay' ? 'Season Ends in:' : 'Resets in:'}
            </span>
            <span className="font-mono font-bold text-brand-text">{countdown}</span>
          </div>
        </div>

        <p className="text-xs font-medium text-content-muted mb-4 bg-bg-800/50 px-3 py-1.5 rounded-lg border border-overlay-subtle inline-block">
          Current Cycle: {periodLabel}
        </p>

        {/* 90-Day League neuroplasticity explanation */}
        {activeLeague === 'ninetyDay' && (
          <div className="card bg-bg-700/60 p-4 mb-4 border-l-2" style={{ borderColor: config.color }}>
            <div className="flex items-start gap-2">
              <Brain size={16} className="text-purple-hierarchy mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-content-secondary font-bold mb-1">90 Days to Rewire Your Brain</p>
                <p className="text-xs text-content-muted leading-relaxed">
                  Neuroscience research reveals it takes roughly 66–90 days of consistent repetition for a new habit
                  to form automated neural pathways in your brain. This 90-Day League tests long-term grit and consistency.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard list */}
        <div className="space-y-2">
          {leagueData.competitors.map((competitor, idx) => {
            const rank = idx + 1;
            const isUser = competitor.isUser;
            const isTop3 = rank <= 3;
            const medalVarNames = ['var(--medal-gold)', 'var(--medal-silver)', 'var(--medal-bronze)'];

            return (
              <button
                key={competitor.id || idx}
                onClick={() => setSelectedCompetitor(competitor)}
                className={`w-full flex items-center gap-2 sm:gap-4 px-2.5 sm:px-4 py-2.5 sm:py-3 rounded-xl transition-all text-left cursor-pointer group ${
                  isUser
                    ? 'league-user-row border-2 hover:border-emerald-400'
                    : 'bg-bg-700/50 hover:bg-bg-700 border border-overlay-subtle'
                }`}
              >
                {/* Rank Position */}
                <div className="w-5 sm:w-7 text-center shrink-0">
                  {isTop3 ? (
                    <Crown size={15} className="mx-auto" style={{ color: medalVarNames[rank - 1] }} />
                  ) : (
                    <span className="text-xs sm:text-sm font-bold text-content-disabled">{rank}</span>
                  )}
                </div>

                {/* Avatar */}
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-bg-600 flex items-center justify-center text-base sm:text-lg shrink-0 border border-overlay-subtle">
                  {competitor.avatar}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <span className={`text-xs sm:text-sm font-medium truncate block ${isUser ? 'text-success-text font-bold' : 'text-content-tertiary'}`}>
                    {competitor.name}
                  </span>
                </div>

                {/* Tier Badge visible for EVERY entry */}
                <div className="shrink-0">
                  <TierBadge totalPoints={competitor.points} size="sm" showName={false} />
                </div>

                {/* Period Points */}
                <div className="text-right shrink-0 min-w-[55px] sm:min-w-[70px]">
                  <span className={`text-xs sm:text-sm font-display font-bold ${isUser ? 'text-success-text' : 'text-content-secondary'}`}>
                    {competitor.points.toLocaleString()}
                  </span>
                  <span className="text-[10px] sm:text-xs text-content-disabled ml-0.5 sm:ml-1">pts</span>
                </div>

                <ChevronRight size={15} className="text-content-subtle group-hover:text-content-tertiary transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Archives */}
      {archives.length > 0 && (
        <div>
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Archive size={16} className="text-content-disabled" />
            Past Standings Archives
          </h2>
          <div className="space-y-2">
            {archives.map((archive, idx) => (
              <button
                key={idx}
                onClick={() => setShowArchive(archive.type)}
                className="card p-4 card-hover w-full flex items-center gap-3 text-left"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${LEAGUE_CONFIG[archive.type].color}15` }}
                >
                  <Trophy size={18} style={{ color: LEAGUE_CONFIG[archive.type].color }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-content-secondary">{archive.periodLabel}</p>
                  <p className="text-xs text-content-disabled">
                    Finished #{archive.userRank} with {archive.userPoints.toLocaleString()} pts
                  </p>
                </div>
                <ChevronDown size={16} className="text-content-subtle" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Archive detail modal */}
      <Modal
        open={!!showArchive}
        onClose={() => setShowArchive(null)}
        title={showArchive ? `${LEAGUE_CONFIG[showArchive].name} — Final Standings` : ''}
        maxWidth="max-w-lg"
      >
        {showArchive && (() => {
          const archive = store.state.leagueArchives.find(
            (a) => a.type === showArchive && a.periodLabel === archives.find((ar) => ar.type === showArchive)?.periodLabel
          );
          if (!archive) return null;
          return (
            <div>
              <p className="text-sm text-content-disabled mb-4">{archive.periodLabel}</p>
              <div className="space-y-1.5">
                {archive.competitors.map((c, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-xl ${
                      c.isUser
                        ? 'league-user-row border'
                        : 'bg-bg-700/50 border border-overlay-subtle'
                    }`}
                  >
                    <div className="w-7 text-center shrink-0">
                      <span className="text-sm font-bold text-content-disabled">{idx + 1}</span>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-bg-600 flex items-center justify-center text-lg shrink-0">
                      {c.avatar}
                    </div>
                    <span className={`text-sm font-medium flex-1 truncate ${c.isUser ? 'text-success-text font-bold' : 'text-content-tertiary'}`}>
                      {c.name}
                    </span>
                    <TierBadge totalPoints={c.points} size="sm" showName={false} />
                    <span className="text-sm font-display font-bold text-content-secondary">
                      {c.points.toLocaleString()} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Clickable Profile Detail Modal */}
      <CompetitorProfileModal
        competitor={selectedCompetitor}
        viewerIsPublic={currentUser ? (currentUser.isProfilePublic ?? true) : true}
        open={!!selectedCompetitor}
        onClose={() => setSelectedCompetitor(null)}
      />
    </div>
  );
}
