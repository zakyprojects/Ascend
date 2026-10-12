import { useState } from 'react';
import { Dialog, PageColumns } from '@/components/ui/primitives';
import { Crown, ChevronDown, ChevronRight } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { LeagueType, LeagueCompetitor } from '@/types';
import { LEAGUE_CONFIG, getLeaguePeriodLabel, getSeasonLabel, getLocalResetDetail } from '@/lib/leagues';
import { leagueNow } from '@/lib/leagueTime';
import { TierBadge } from '@/components/ui/TierBadge';
import { CompetitorProfileModal } from '@/components/ui/CompetitorProfileModal';
import { LeagueCountdown } from '@/components/ui/LeagueCountdown';
import { useLeaguePeriodRollover } from '@/lib/useLeaguePeriodRollover';
import { CountUp, Reveal } from '@/components/ui/Motion';

interface LeaguesProps {
  store: AppStore;
  onOpenAuthModal?: () => void;
}

export function Leagues({ store, onOpenAuthModal }: LeaguesProps) {
  const [activeLeague, setActiveLeague] = useState<LeagueType>('weekly');
  const [showArchive, setShowArchive] = useState<LeagueType | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<LeagueCompetitor | null>(null);
  // Period labels re-render on rollover; the per-second countdown ticks inside LeagueCountdown.
  useLeaguePeriodRollover();

  const now = leagueNow();
  const leagueData = store.getLeagueData(activeLeague);
  const config = LEAGUE_CONFIG[activeLeague];
  const periodLabel = getLeaguePeriodLabel(activeLeague, now);
  const archives = store.state.leagueArchives.filter((a) => a.type === activeLeague);

  const currentUser = store.state.currentUser;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leagues</h1>
          <p className="page-subtitle">Compete with real people and climb the table.</p>
        </div>
        {!currentUser && onOpenAuthModal && (
          <button
            onClick={onOpenAuthModal}
            className="hidden sm:flex shrink-0 items-center gap-1.5 px-3 py-1.5 hover:bg-overlay-subtle border border-overlay-default text-content-secondary text-xs font-medium rounded-lg transition-colors"
          >
            <span>Sign Up to Claim Username</span>
          </button>
        )}
      </div>

      {/* Guest Mode Banner */}
      {(!currentUser || currentUser.isAnonymous) && (
        <div className="p-4 rounded-xl border border-overlay-default flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <p className="item-name text-xs">
                You are competing as Guest ({currentUser?.username || store.state.username})
              </p>
              <p className="text-micro text-content-muted">
                Save your progress — create a permanent account to lock in your rank and pick a custom username.
              </p>
            </div>
          </div>
          {onOpenAuthModal && (
            <button
              onClick={onOpenAuthModal}
              className="px-3.5 py-1.5 bg-primary-500 hover:bg-primary-600 text-on-brand text-xs font-semibold rounded-lg transition-colors shrink-0 w-full sm:w-auto"
            >
              Save Progress / Create Account
            </button>
          )}
        </div>
      )}

      <PageColumns
        lead={
          <>
            {/* League tabs */}
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(LEAGUE_CONFIG) as LeagueType[]).map((type) => {
                const active = activeLeague === type;
                const data = store.getLeagueData(type);
                return (
                  <button
                    key={type}
                    onClick={() => setActiveLeague(type)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-colors ${
                      active
                        ? 'bg-overlay-default border-overlay-default'
                        : 'border-transparent hover:bg-overlay-subtle'
                    }`}
                  >
                    <span
                      className={`text-xs font-medium ${active ? 'text-content-primary' : 'text-content-muted'}`}
                    >
                      {type === 'ninetyDay' ? `90-Day (${getSeasonLabel(now)})` : type === 'monthly' ? 'Monthly' : 'Weekly'}
                    </span>
                    <span className="text-2xs text-content-disabled">Rank #{data.userRank}</span>
                  </button>
                );
              })}
            </div>

            {/* Active league leaderboard */}
            <div className="card p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="section-title">
                        {activeLeague === 'ninetyDay' ? `${getSeasonLabel(now)} — 90-Day League` : config.name}
                      </h2>
                    </div>
                    <p className="text-micro text-content-muted">{getLocalResetDetail(activeLeague, now)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-content-tertiary self-start sm:self-auto">
                  <span className="text-micro text-content-muted">
                    {activeLeague === 'ninetyDay' ? 'Season Ends in:' : 'Resets in:'}
                  </span>
                  <LeagueCountdown type={activeLeague} className="font-mono font-medium text-content-primary tabular-nums" />
                </div>
              </div>

              <p className="text-xs text-content-muted mb-4">
                Current Cycle: {periodLabel}
              </p>

              {/* 90-Day League neuroplasticity explanation */}
              {activeLeague === 'ninetyDay' && (
                <div className="rounded-xl border border-overlay-default p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <div>
                      <p className="item-name text-sm mb-1">90 Days to Rewire Your Brain</p>
                      <p className="text-xs text-content-muted leading-relaxed">
                        Neuroscience research reveals it takes roughly 66–90 days of consistent repetition for a new habit
                        to form automated neural pathways in your brain. This 90-Day League tests long-term grit and consistency.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Leaderboard list */}
              <div className="divide-y divide-overlay-subtle -mx-2 sm:-mx-3">
                {leagueData.competitors.map((competitor, idx) => {
                  const rank = idx + 1;
                  const isUser = competitor.isUser;
                  const isTop3 = rank <= 3;
                  const medalVarNames = ['var(--medal-gold)', 'var(--medal-silver)', 'var(--medal-bronze)'];

                  return (
                    <Reveal key={competitor.id || idx} index={idx}>
                    <button
                      onClick={() => setSelectedCompetitor(competitor)}
                      className={`w-full flex items-center gap-2 sm:gap-4 px-2.5 sm:px-4 py-2.5 sm:py-3 transition-colors text-left cursor-pointer group ${
                        isUser
                          ? 'bg-primary-500/5 hover:bg-primary-500/10'
                          : 'hover:bg-overlay-subtle'
                      }`}
                    >
                      {/* Rank Position */}
                      <div className="w-5 sm:w-7 text-center shrink-0">
                        {isTop3 ? (
                          <Crown size={15} className="mx-auto" style={{ color: medalVarNames[rank - 1] }} />
                        ) : (
                          <span className="figure text-xs sm:text-sm text-content-disabled">{rank}</span>
                        )}
                      </div>

                      {/* Avatar */}
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-overlay-subtle flex items-center justify-center text-base sm:text-lg shrink-0">
                        {competitor.avatar}
                      </div>

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <span className={`item-name text-xs sm:text-sm truncate block ${isUser ? '!text-content-primary' : '!text-content-secondary'}`}>
                          {competitor.name}
                        </span>
                      </div>

                      {/* Tier Badge visible for EVERY entry */}
                      <div className="shrink-0">
                        <TierBadge totalPoints={competitor.points} size="sm" showName={false} />
                      </div>

                      {/* Period Points */}
                      <div className="text-right shrink-0 min-w-[55px] sm:min-w-[70px]">
                        <span className="figure text-xs sm:text-sm text-content-primary">
                          <CountUp value={competitor.points} className="tabular-nums" />
                        </span>
                        <span className="font-mono text-2xs text-content-disabled ml-1">pts</span>
                      </div>

                      <ChevronRight size={15} className="text-content-subtle group-hover:text-content-tertiary transition-colors shrink-0" />
                    </button>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </>
        }
        aside={
          // Archives
          archives.length > 0 && (
            <div>
              <h2 className="section-title mb-3">
                Past Standings Archives
              </h2>
              <div className="card divide-y divide-overlay-subtle overflow-hidden">
                {archives.map((archive, idx) => (
                  <button
                    key={idx}
                    onClick={() => setShowArchive(archive.type)}
                    className="p-4 hover:bg-overlay-subtle transition-colors w-full flex items-center gap-3 text-left"
                  >
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
          )
        }
      />

      {/* Archive detail modal */}
      <Dialog
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
              <div className="divide-y divide-overlay-subtle">
                {archive.competitors.map((c, idx) => (
                  <div
                    key={idx}
                    className={`scroll-rise flex items-center gap-3 p-3 ${
                      c.isUser ? 'bg-primary-500/5' : ''
                    }`}
                  >
                    <div className="w-7 text-center shrink-0">
                      <span className="figure text-sm text-content-disabled">{idx + 1}</span>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-overlay-subtle flex items-center justify-center text-lg shrink-0">
                      {c.avatar}
                    </div>
                    <span className={`item-name text-sm flex-1 truncate ${c.isUser ? '!text-content-primary' : '!text-content-secondary'}`}>
                      {c.name}
                    </span>
                    <TierBadge totalPoints={c.points} size="sm" showName={false} />
                    <span className="figure text-sm text-content-primary">
                      {c.points.toLocaleString()} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Dialog>

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
