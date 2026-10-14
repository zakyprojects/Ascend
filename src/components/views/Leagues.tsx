import { useState } from 'react';
import { Dialog, PageColumns } from '@/components/ui/primitives';
import { Trophy, Crown, Brain, Calendar, CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { LeagueType, LeagueCompetitor } from '@/types';
import { LEAGUE_CONFIG, getLeaguePeriodLabel, getSeasonLabel, getLocalResetDetail } from '@/lib/leagues';
import { leagueNow } from '@/lib/leagueTime';
import { TierBadge } from '@/components/ui/TierBadge';
import { CompetitorProfileModal } from '@/components/ui/CompetitorProfileModal';
import { LeagueCountdown } from '@/components/ui/LeagueCountdown';
import { GuestSaveBanner } from '@/components/ui/GuestSaveBanner';
import { useLeaguePeriodRollover } from '@/lib/useLeaguePeriodRollover';
import { CountUp, Reveal } from '@/components/ui/Motion';

const LEAGUE_ICONS: Record<string, typeof Trophy> = {
  Calendar, CalendarDays, Brain,
};

// Theme-aware text colour per league (readable in light mode too).
const LEAGUE_TEXT: Record<LeagueType, string> = {
  weekly: 'var(--badge-emerald-text)',
  monthly: 'var(--badge-sky-text)',
  ninetyDay: 'var(--badge-purple-text)',
};

interface LeaguesProps {
  store: AppStore;
  onOpenAuth?: () => void;
}

export function Leagues({ store, onOpenAuth }: LeaguesProps) {
  const [activeLeague, setActiveLeague] = useState<LeagueType>('weekly');
  const [openArchiveId, setOpenArchiveId] = useState<string | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<LeagueCompetitor | null>(null);
  // Period labels re-render on rollover; the per-second countdown ticks inside LeagueCountdown.
  useLeaguePeriodRollover();

  const now = leagueNow();
  const leagueData = store.getLeagueData(activeLeague);
  const config = LEAGUE_CONFIG[activeLeague];
  const periodLabel = getLeaguePeriodLabel(activeLeague, now);
  const archives = store.state.leagueArchives.filter((a) => a.type === activeLeague);
  // Looked up live so a sync that removes the archive closes the dialog instead of leaving it empty.
  const openArchive = openArchiveId ? store.state.leagueArchives.find((a) => a.id === openArchiveId) ?? null : null;
  // Tiers come from season points on every tab; weekly/monthly points only rank the table.
  const seasonPointsById = new Map(
    store.getLeagueData('ninetyDay').competitors.map((c) => [c.id, c.points] as const)
  );
  const seasonPointsOf = (c: LeagueCompetitor) => seasonPointsById.get(c.id) ?? 0;

  const currentUser = store.state.currentUser;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leagues</h1>
          <p className="page-subtitle">Compete with real people and climb the table.</p>
        </div>
      </div>

      {/* Guest Mode Banner */}
      {(!currentUser || currentUser.isAnonymous) && (
        <GuestSaveBanner
          title={`You're competing as a guest (${currentUser?.username || store.state.username})`}
          description="Create an account to keep your rank and choose your own username."
          onCreateAccount={onOpenAuth}
        />
      )}

      <PageColumns
        lead={
          <>
            {/* League tabs */}
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(LEAGUE_CONFIG) as LeagueType[]).map((type) => {
                const active = activeLeague === type;
                const data = store.getLeagueData(type);
                const cfg = LEAGUE_CONFIG[type];
                const Icon = LEAGUE_ICONS[cfg.icon] ?? Calendar;
                return (
                  <button
                    key={type}
                    onClick={() => setActiveLeague(type)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors ${
                      active ? '' : 'border-transparent hover:bg-overlay-subtle'
                    }`}
                    style={active ? { borderColor: `${cfg.color}66`, backgroundColor: `${cfg.color}14` } : undefined}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${cfg.color}1f` }}
                    >
                      <Icon size={18} style={{ color: cfg.color }} />
                    </div>
                    <span
                      className="text-xs font-medium"
                      style={{ color: active ? LEAGUE_TEXT[type] : 'var(--color-content-muted)' }}
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
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${config.color}1f` }}
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
                    </div>
                    <p className="text-micro text-content-muted">{getLocalResetDetail(activeLeague, now)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-content-tertiary self-start sm:self-auto">
                  <span className="text-micro text-content-muted">
                    {activeLeague === 'ninetyDay' ? 'Season ends in' : 'Resets in'}
                  </span>
                  <LeagueCountdown type={activeLeague} className="font-mono font-medium text-brand-text tabular-nums" />
                </div>
              </div>

              <p className="text-xs text-content-muted mb-4">
                Current cycle: {periodLabel}
              </p>

              {/* 90-Day League neuroplasticity explanation */}
              {activeLeague === 'ninetyDay' && (
                <div className="rounded-xl border border-overlay-default border-l-2 p-4 mb-4" style={{ borderLeftColor: config.color }}>
                  <div className="flex items-start gap-2">
                    <Brain size={16} className="text-purple-hierarchy mt-0.5 shrink-0" />
                    <div>
                      <p className="item-name text-sm mb-1">Why 90 days</p>
                      <p className="text-xs text-content-muted leading-relaxed">
                        A new habit usually takes about 66–90 days of steady repetition to become automatic. This league
                        rewards that long-term consistency.
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
                        <span className={`item-name text-xs sm:text-sm truncate block ${isUser ? '!text-success-text' : '!text-content-secondary'}`}>
                          {competitor.name}
                        </span>
                      </div>

                      {/* Tier Badge visible for EVERY entry */}
                      <div className="shrink-0">
                        <TierBadge totalPoints={seasonPointsOf(competitor)} size="sm" showName={false} />
                      </div>

                      {/* Period Points */}
                      <div className="text-right shrink-0 min-w-[55px] sm:min-w-[70px]">
                        <span className="figure text-xs sm:text-sm text-success-text">
                          <CountUp value={competitor.points} className="tabular-nums" />
                        </span>
                        <span className="text-2xs text-content-disabled ml-1">pts</span>
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
                Past standings
              </h2>
              <div className="card divide-y divide-overlay-subtle overflow-hidden">
                {archives.map((archive) => (
                  <button
                    key={archive.id}
                    onClick={() => setOpenArchiveId(archive.id ?? null)}
                    className="p-4 hover:bg-overlay-subtle transition-colors w-full flex items-center gap-3 text-left"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${LEAGUE_CONFIG[archive.type].color}1f` }}
                    >
                      <Trophy size={16} style={{ color: LEAGUE_CONFIG[archive.type].color }} />
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
          )
        }
      />

      {/* Archive detail modal */}
      <Dialog
        open={!!openArchive}
        onClose={() => setOpenArchiveId(null)}
        title={openArchive ? `${LEAGUE_CONFIG[openArchive.type].name}: final standings` : ''}
        maxWidth="max-w-lg"
      >
        {openArchive && (() => {
          const archive = openArchive;
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
                    <span className={`item-name text-sm flex-1 truncate ${c.isUser ? '!text-success-text' : '!text-content-secondary'}`}>
                      {c.name}
                    </span>
                    {/* Only a season archive knows each member's season score. */}
                    {archive.type === 'ninetyDay' && <TierBadge totalPoints={c.points} size="sm" showName={false} />}
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
        seasonPoints={selectedCompetitor ? seasonPointsOf(selectedCompetitor) : 0}
        viewerIsPublic={currentUser ? (currentUser.isProfilePublic ?? true) : true}
        open={!!selectedCompetitor}
        onClose={() => setSelectedCompetitor(null)}
      />
    </div>
  );
}
