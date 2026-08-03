import { useState, useEffect } from 'react';
import { Trophy, Clock, Crown, Brain, Calendar, CalendarDays, ChevronDown, Archive, Sparkles, UserCheck, ChevronRight } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { LeagueType, LeagueCompetitor } from '@/types';
import { LEAGUE_CONFIG, formatCountdown, getTimeUntilReset, getLeaguePeriodLabel, getSeasonLabel, getSeasonNumber } from '@/lib/leagues';
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

  const leagueData = store.getLeagueData(activeLeague);
  const config = LEAGUE_CONFIG[activeLeague];
  const countdown = formatCountdown(getTimeUntilReset(activeLeague));
  const periodLabel = getLeaguePeriodLabel(activeLeague);
  const archives = store.state.leagueArchives.filter((a) => a.type === activeLeague);

  const currentUser = store.state.currentUser;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100">Leagues</h1>
          <p className="text-sm text-slate-500 mt-1">Compete with real users, view ranks, and climb tiers</p>
        </div>
        {!currentUser && onOpenAuthModal && (
          <button
            onClick={onOpenAuthModal}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/20 hover:bg-primary-500/30 border border-primary-500/30 text-primary-300 text-xs font-semibold rounded-xl transition-all"
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
            <div className="w-9 h-9 rounded-xl bg-primary-500/20 flex items-center justify-center shrink-0 text-primary-400">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">
                You are competing as Guest ({currentUser?.username || store.state.username})
              </p>
              <p className="text-[11px] text-slate-400">
                Save your progress — create a permanent account to lock in your rank and pick a custom username.
              </p>
            </div>
          </div>
          {onOpenAuthModal && (
            <button
              onClick={onOpenAuthModal}
              className="px-3.5 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold rounded-lg shadow-md transition-all shrink-0 w-full sm:w-auto"
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
                {type === 'ninetyDay' ? `90-Day (${getSeasonLabel()})` : type === 'monthly' ? 'Monthly' : 'Weekly'}
              </span>
              <span className="text-[10px] text-slate-500">Rank #{data.userRank}</span>
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
                  {activeLeague === 'ninetyDay' ? `${getSeasonLabel()} — 90-Day League` : config.name}
                </h2>
                {activeLeague === 'ninetyDay' && (
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold">
                    Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">{config.resetDetail}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-bg-800 rounded-lg border border-white/5 text-xs text-slate-300 self-start sm:self-auto">
            <Clock size={13} className="text-slate-400" />
            <span className="text-[11px] text-slate-400">
              {activeLeague === 'ninetyDay' ? 'Season Ends in:' : 'Resets in:'}
            </span>
            <span className="font-mono font-bold text-primary-400">{countdown}</span>
          </div>
        </div>

        <p className="text-xs font-medium text-slate-400 mb-4 bg-bg-800/50 px-3 py-1.5 rounded-lg border border-white/5 inline-block">
          Current Cycle: {periodLabel}
        </p>

        {/* 90-Day League neuroplasticity explanation */}
        {activeLeague === 'ninetyDay' && (
          <div className="card bg-bg-700/60 p-4 mb-4 border-l-2" style={{ borderColor: config.color }}>
            <div className="flex items-start gap-2">
              <Brain size={16} className="text-purple-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-slate-200 font-bold mb-1">90 Days to Rewire Your Brain</p>
                <p className="text-xs text-slate-400 leading-relaxed">
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
            const isRealUser = competitor.isRealUser;
            const isTop3 = rank <= 3;
            const medalColors = ['#fbbf24', '#c0c0c0', '#cd7f32'];

            return (
              <button
                key={competitor.id || idx}
                onClick={() => setSelectedCompetitor(competitor)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left cursor-pointer group ${
                  isUser
                    ? 'glass-strong border-2 shadow-lg hover:border-primary-400'
                    : 'bg-bg-700/50 hover:bg-bg-700 border border-white/5'
                }`}
                style={isUser ? { borderColor: `${config.color}60` } : {}}
              >
                {/* Rank Position */}
                <div className="w-7 text-center shrink-0">
                  {isTop3 ? (
                    <Crown size={16} style={{ color: medalColors[rank - 1] }} />
                  ) : (
                    <span className="text-sm font-bold text-slate-500">{rank}</span>
                  )}
                </div>

                {/* Avatar */}
                <div className="w-9 h-9 rounded-lg bg-bg-600 flex items-center justify-center text-lg shrink-0 border border-white/5">
                  {competitor.avatar}
                </div>

                {/* Name & Badges */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className={`text-sm font-medium truncate ${isUser ? 'text-slate-100 font-bold' : 'text-slate-300'}`}>
                    {competitor.name}
                  </span>
                  {isUser && (
                    <span className="text-[10px] bg-primary-500/20 text-primary-300 px-2 py-0.5 rounded-full border border-primary-500/30 font-bold">
                      You
                    </span>
                  )}
                  {isRealUser && !isUser && (
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                      <UserCheck size={10} /> Member
                    </span>
                  )}
                </div>

                {/* Tier Badge visible for EVERY entry */}
                <div className="shrink-0">
                  <TierBadge totalPoints={competitor.totalPoints || competitor.points} size="sm" showName={false} />
                </div>

                {/* Period Points */}
                <div className="text-right shrink-0 min-w-[70px]">
                  <span className="text-sm font-display font-bold text-slate-200">
                    {competitor.points.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500 ml-1">pts</span>
                </div>

                <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-300 transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Archives */}
      {archives.length > 0 && (
        <div>
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Archive size={16} className="text-slate-500" />
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
                  <p className="text-sm font-medium text-slate-200">{archive.periodLabel}</p>
                  <p className="text-xs text-slate-500">
                    Finished #{archive.userRank} with {archive.userPoints.toLocaleString()} pts
                  </p>
                </div>
                <ChevronDown size={16} className="text-slate-600" />
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
              <p className="text-sm text-slate-500 mb-4">{archive.periodLabel}</p>
              <div className="space-y-1.5">
                {archive.competitors.map((c, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-xl ${
                      c.isUser ? 'glass-strong border border-primary-500/40' : 'bg-bg-700/50'
                    }`}
                  >
                    <div className="w-7 text-center shrink-0">
                      <span className="text-sm font-bold text-slate-500">{idx + 1}</span>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-bg-600 flex items-center justify-center text-lg shrink-0">
                      {c.avatar}
                    </div>
                    <span className={`text-sm font-medium flex-1 ${c.isUser ? 'text-slate-100 font-bold' : 'text-slate-300'}`}>
                      {c.name}
                      {c.isUser && <span className="text-xs text-slate-400 ml-1.5">(You)</span>}
                    </span>
                    <TierBadge totalPoints={c.totalPoints || c.points} size="sm" showName={false} />
                    <span className="text-sm font-display font-bold text-slate-200">
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
