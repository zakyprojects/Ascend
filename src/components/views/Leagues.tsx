import { useMemo, useState } from 'react';
import { Brain, Calendar, CalendarDays, ChevronRight, Trophy, WifiOff } from 'lucide-react';
import { Button, cx, Dialog, Disclosure, EmptyState, PageColumns, Skeleton, TabPanel, Tabs } from '@/components/ui/primitives';
import { AppStore } from '@/lib/store';
import { LeagueArchive, LeagueCompetitor, LeagueType } from '@/types';
import {
  LEAGUE_CONFIG,
  ARCHIVES_SHOWN_PER_TYPE,
  compareArchivesNewestFirst,
  getArchivePeriodLabel,
  getLeaguePeriodLabel,
  getLocalResetDetail,
  pointsText,
} from '@/lib/leagues';
import { leagueNow } from '@/lib/leagueTime';
import { getCurrentTier } from '@/lib/tiers';
import { leaguePeriodKey } from '@/lib/leagueStandingsRefresh';
import { TierBadge } from '@/components/ui/TierBadge';
import { CompetitorProfileModal } from '@/components/ui/CompetitorProfileModal';
import { LeagueCountdown } from '@/components/ui/LeagueCountdown';
import { GuestSaveBanner } from '@/components/ui/GuestSaveBanner';
import { PageHero } from '@/components/ui/PageHero';
import { useLeaguePeriodRollover } from '@/lib/useLeaguePeriodRollover';
import { useLeagueStandingsRefresh } from '@/lib/useLeagueStandingsRefresh';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { isPartnershipUser1 } from '@/lib/partnershipSide';

const LEAGUE_TYPES: LeagueType[] = ['weekly', 'monthly', 'ninetyDay'];

const LEAGUE_TAB_LABEL: Record<LeagueType, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  ninetyDay: 'Season',
};

const LEAGUE_ICONS: Record<string, typeof Trophy> = { Calendar, CalendarDays, Brain };

/** Theme-aware tone per league (same tones as the Dashboard's league rows). */
const LEAGUE_TONE_CLASS: Record<LeagueType, string> = {
  weekly: 'badge-emerald',
  monthly: 'badge-sky',
  ninetyDay: 'badge-purple',
};

const PAST_HEADING: Record<LeagueType, string> = {
  weekly: 'Past weeks',
  monthly: 'Past months',
  ninetyDay: 'Past seasons',
};

const PAST_EMPTY: Record<LeagueType, string> = {
  weekly: 'No finished weeks yet',
  monthly: 'No finished months yet',
  ninetyDay: 'No finished seasons yet',
};

/** Skeleton rows while the table loads. */
const SKELETON_ROWS = 5;

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Server archives are recomputed for 48 hours after the period ends; until then they can change. */
function isProvisional(archive: LeagueArchive): boolean {
  return archive.source === 'server' && archive.final !== true;
}

function RankNumber({ rank }: { rank: number }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'figure w-6 shrink-0 text-center text-sm',
        rank <= 3 ? 'font-semibold text-content-primary' : 'text-content-muted'
      )}
    >
      {rank}
    </span>
  );
}

function YouTag() {
  return <span className="badge badge-emerald shrink-0">You</span>;
}

interface LeaguesProps {
  store: AppStore;
  onOpenAuth?: () => void;
}

export function Leagues({ store, onOpenAuth }: LeaguesProps) {
  const [activeLeague, setActiveLeague] = useState<LeagueType>('weekly');
  const changeLeague = (id: string) => setActiveLeague(id as LeagueType);
  const [openArchiveId, setOpenArchiveId] = useState<string | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<LeagueCompetitor | null>(null);
  const [retrying, setRetrying] = useState(false);
  // Period labels re-render on rollover; the per-second countdown ticks inside LeagueCountdown.
  useLeaguePeriodRollover();
  // Other members' points: refetched on open, on return to the tab and every minute while visible.
  useLeagueStandingsRefresh(store);

  const now = leagueNow();
  const periodKey = leaguePeriodKey(now);
  const { getLeagueData } = store;
  // All three tables at once: each one rebuilds every member, so never per tab button or per row.
  const boards = useMemo(
    () => ({
      weekly: getLeagueData('weekly'),
      monthly: getLeagueData('monthly'),
      ninetyDay: getLeagueData('ninetyDay'),
    }),
    // periodKey: a new week, month or season starts the tables again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getLeagueData, periodKey]
  );
  // Tiers come from season points on every tab; weekly/monthly points only rank the table.
  const seasonPointsById = useMemo(
    () => new Map(boards.ninetyDay.competitors.map((c) => [c.id, c.points] as const)),
    [boards]
  );
  const seasonPointsOf = (c: LeagueCompetitor) => seasonPointsById.get(c.id) ?? 0;

  const board = boards[activeLeague];
  const status = store.getLeagueStandingsStatus();
  const loaded = status === 'ready';
  const failed = status === 'failed' && !retrying;
  const hasPlace = loaded && board.userPoints > 0;
  const config = LEAGUE_CONFIG[activeLeague];
  const LeagueIcon = LEAGUE_ICONS[config.icon] ?? Calendar;

  const archives = store.state.leagueArchives
    .filter((a) => a.type === activeLeague)
    .sort(compareArchivesNewestFirst)
    .slice(0, ARCHIVES_SHOWN_PER_TYPE);
  // Looked up live so a sync that removes the archive closes the dialog instead of leaving it empty.
  const openArchive = openArchiveId ? store.state.leagueArchives.find((a) => a.id === openArchiveId) ?? null : null;

  const currentUser = store.state.currentUser;
  // Partners see each other's stats in the profile dialog (same rule as the server, audit L19).
  const partnerships = store.state.partnerships;
  const { partnerIds, partnerNames } = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const me = currentUser?.id;
    for (const p of partnerships || []) {
      if (!p) continue;
      const mine = isPartnershipUser1(p, me, currentUser?.username || store.state.username);
      const otherId = mine ? p.user2Id : p.user1Id;
      const otherName = mine ? p.user2Username : p.user1Username;
      if (otherId && otherId !== me) ids.add(otherId);
      if (otherName) names.add(otherName.toLowerCase());
    }
    return { partnerIds: ids, partnerNames: names };
  }, [partnerships, currentUser?.id, currentUser?.username, store.state.username]);

  const retry = async () => {
    setRetrying(true);
    try {
      await store.refreshLeagueStandings({ full: true });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Leagues</h1>
        <p className="page-subtitle">Compete with real people and climb the table.</p>
      </div>

      {(!currentUser || currentUser.isAnonymous) && onOpenAuth && (
        <GuestSaveBanner
          title={`You're competing as a guest (${currentUser?.username || store.state.username})`}
          description="Create an account to keep your rank and choose your own username."
          onCreateAccount={onOpenAuth}
        />
      )}

      <Tabs
        idBase="leagues"
        ariaLabel="Leagues"
        value={activeLeague}
        onChange={changeLeague}
        items={LEAGUE_TYPES.map((type) => ({
          id: type,
          label: LEAGUE_TAB_LABEL[type],
          icon: LEAGUE_ICONS[LEAGUE_CONFIG[type].icon] ?? Calendar,
        }))}
      />

      <TabPanel idBase="leagues" ids={LEAGUE_TYPES} value={activeLeague} onChange={changeLeague} className="space-y-6">
        <Reveal index={0}>
          <PageHero
            ariaLabel={`Your ${LEAGUE_TAB_LABEL[activeLeague].toLowerCase()} standing`}
            lead={{
              label: 'Your place',
              value: hasPlace ? (
                <>#<CountUp value={board.userRank} /></>
              ) : (
                <span aria-label="No place yet">—</span>
              ),
              hint: !loaded
                ? failed
                  ? 'Table not loaded'
                  : 'Loading the table…'
                : hasPlace
                  ? `of ${board.competitors.length} ${board.competitors.length === 1 ? 'member' : 'members'}`
                  : 'No points yet',
            }}
            stats={[
              {
                label: 'Points',
                value: <CountUp value={board.userPoints} />,
                hint: activeLeague === 'ninetyDay' ? 'this season' : activeLeague === 'monthly' ? 'this month' : 'this week',
              },
              {
                label: activeLeague === 'ninetyDay' ? 'Season ends in' : 'Resets in',
                value: <LeagueCountdown type={activeLeague} className="font-mono text-lg sm:text-2xl" />,
                hint: getLocalResetDetail(activeLeague, now),
              },
            ]}
          />
        </Reveal>

        {activeLeague === 'ninetyDay' && (
          <Disclosure title="Why 90 days" icon={Brain}>
            In one well-known study, a new daily habit took a median of 66 days to feel automatic, anywhere from 18
            to 254 days. A 90-day season gives many habits time to settle in, and this league rewards that long-term
            consistency.
          </Disclosure>
        )}

        <PageColumns
          lead={
            <Reveal index={1}>
              <section aria-labelledby="leagues-standings" className="card overflow-hidden">
                <div className="flex items-center gap-3 border-b border-overlay-subtle px-4 py-3.5 sm:px-5">
                  <span className={cx(LEAGUE_TONE_CLASS[activeLeague], 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg')}>
                    <LeagueIcon size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 id="leagues-standings" className="section-title leading-tight">Standings</h2>
                    <p className="text-xs text-content-muted">{getLeaguePeriodLabel(activeLeague, now)}</p>
                  </div>
                </div>

                {failed && !loaded ? (
                  <EmptyState
                    surface={false}
                    className="p-8"
                    icon={WifiOff}
                    iconClassName="bg-overlay-subtle text-content-muted ring-1 ring-inset ring-overlay-default"
                    title="Couldn't load the table"
                    description="Check your connection, then try again."
                    action={
                      <Button variant="secondary" size="sm" type="button" onClick={retry} loading={retrying}>
                        Retry
                      </Button>
                    }
                  />
                ) : !loaded ? (
                  <div aria-busy="true" className="divide-y divide-overlay-subtle">
                    <span className="sr-only" role="status">Loading the table</span>
                    {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
                        <Skeleton className="h-3 w-5" />
                        <Skeleton className="h-9 w-9 rounded-lg" />
                        <Skeleton className="h-3.5 flex-1 max-w-[10rem]" />
                        <Skeleton className="ml-auto h-3.5 w-12" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <ol className="divide-y divide-overlay-subtle">
                    {board.competitors.map((competitor, idx) => {
                      const rank = idx + 1;
                      const isUser = !!competitor.isUser;
                      const seasonPoints = seasonPointsOf(competitor);
                      const tierName = getCurrentTier(seasonPoints).name;
                      return (
                        <li key={competitor.id || idx}>
                          <button
                            type="button"
                            onClick={() => setSelectedCompetitor(competitor)}
                            aria-label={`${ordinal(rank)}, ${competitor.name}${isUser ? ', you' : ''}, ${tierName}, ${pointsText(competitor.points)}`}
                            className={cx(
                              'group flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors sm:gap-4 sm:px-5',
                              isUser ? 'bg-overlay-subtle hover:bg-overlay-default' : 'hover:bg-overlay-subtle'
                            )}
                          >
                            <RankNumber rank={rank} />
                            <span
                              aria-hidden="true"
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-overlay-subtle text-base sm:h-10 sm:w-10 sm:text-lg"
                            >
                              {competitor.avatar}
                            </span>
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="item-name truncate text-sm !text-content-secondary">{competitor.name}</span>
                              {isUser && <YouTag />}
                            </span>
                            <span aria-hidden="true" className="shrink-0">
                              <TierBadge totalPoints={seasonPoints} size="sm" showName={false} />
                            </span>
                            <span className="min-w-[3.5rem] shrink-0 text-right sm:min-w-[4.5rem]">
                              <span className="figure text-sm text-content-primary">{competitor.points.toLocaleString()}</span>
                              <span className="ml-1 text-2xs text-content-muted">pts</span>
                            </span>
                            <ChevronRight
                              size={15}
                              aria-hidden="true"
                              className="shrink-0 text-content-muted transition-colors group-hover:text-content-secondary"
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </Reveal>
          }
          aside={
            <section aria-labelledby="leagues-past">
              <h2 id="leagues-past" className="section-title mb-3">{PAST_HEADING[activeLeague]}</h2>
              {archives.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={Trophy}
                  title={PAST_EMPTY[activeLeague]}
                  description="Your finished standings show up here."
                />
              ) : (
                <ul className="card divide-y divide-overlay-subtle overflow-hidden">
                  {archives.map((archive) => (
                    <li key={archive.id ?? archive.archivedAt}>
                      <button
                        type="button"
                        onClick={() => setOpenArchiveId(archive.id ?? null)}
                        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-overlay-subtle"
                      >
                        <span className={cx(LEAGUE_TONE_CLASS[archive.type], 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg')}>
                          <Trophy size={16} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-content-secondary">{getArchivePeriodLabel(archive)}</span>
                          <span className="block text-xs text-content-muted">
                            Finished #{archive.userRank} · {archive.userPoints.toLocaleString()} pts
                          </span>
                          {isProvisional(archive) && (
                            <span className="block text-2xs text-content-muted">Final standings in up to 2 days</span>
                          )}
                        </span>
                        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-content-muted" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          }
        />
      </TabPanel>

      <Dialog
        open={!!openArchive}
        onClose={() => setOpenArchiveId(null)}
        title={
          openArchive
            ? `${LEAGUE_CONFIG[openArchive.type].name}: ${isProvisional(openArchive) ? 'standings' : 'final standings'}`
            : ''
        }
        maxWidth="max-w-lg"
      >
        {openArchive && (
          <div>
            <p className="mb-4 text-sm text-content-muted">
              {getArchivePeriodLabel(openArchive)}
              {isProvisional(openArchive) && ' · Final standings in up to 2 days'}
            </p>
            <ol className="divide-y divide-overlay-subtle">
              {openArchive.competitors.map((c, idx) => (
                <li
                  key={c.id ?? idx}
                  className={cx('scroll-rise flex items-center gap-3 p-3', c.isUser && 'bg-overlay-subtle')}
                >
                  <span className="sr-only">{ordinal(idx + 1)}</span>
                  <RankNumber rank={idx + 1} />
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-overlay-subtle text-lg">
                    {c.avatar}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="item-name truncate text-sm !text-content-secondary">{c.name}</span>
                    {c.isUser && <YouTag />}
                  </span>
                  {/* Only a season archive knows each member's season score. */}
                  {openArchive.type === 'ninetyDay' && (
                    <span aria-hidden="true">
                      <TierBadge totalPoints={c.points} size="sm" showName={false} />
                    </span>
                  )}
                  <span className="figure shrink-0 text-sm text-content-primary">{c.points.toLocaleString()} pts</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Dialog>

      <CompetitorProfileModal
        competitor={selectedCompetitor}
        seasonPoints={selectedCompetitor ? seasonPointsOf(selectedCompetitor) : 0}
        periodLabel={activeLeague === 'ninetyDay' ? 'This season' : activeLeague === 'monthly' ? 'This month' : 'This week'}
        viewerIsPublic={currentUser ? (currentUser.isProfilePublic ?? true) : true}
        isPartner={selectedCompetitor && !selectedCompetitor.isUser ? partnerIds.has(selectedCompetitor.id ?? '') || (!selectedCompetitor.id && partnerNames.has(selectedCompetitor.name.toLowerCase())) : false}
        open={!!selectedCompetitor}
        onClose={() => setSelectedCompetitor(null)}
      />
    </div>
  );
}
