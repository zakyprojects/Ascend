import { useId } from 'react';
import type { LeagueCompetitor, MemberCard, MemberCardExercise } from '@/types';
import { TierBadge } from './TierBadge';
import { Dialog, Skeleton } from '@/components/ui/primitives';
import { CalendarCheck, CheckSquare, BookOpen, Book, Target, Timer, Lock, EyeOff, WifiOff, type LucideIcon } from 'lucide-react';
import { getProfileStreakStats } from '@/lib/streakLogic';
import { getCurrentTier } from '@/lib/tiers';
import { addDays, formatDateShort, todayKey } from '@/lib/dates';
import { ptsText } from '@/lib/leagues';
import { MEMBER_CARD_DAYS } from '@/lib/memberStats';
import type { MemberDetails } from '@/lib/useMemberDetails';

interface CompetitorProfileModalProps {
  competitor: LeagueCompetitor | null;
  /** The member's season points, which set their tier (competitor.points are the open tab's period points). */
  seasonPoints: number;
  /** Which league period competitor.points cover, e.g. 'This week' (C12). */
  periodLabel: string;
  viewerIsPublic?: boolean;
  /** Partners always see each other's stats (the server sends them whatever the privacy setting). */
  isPartner?: boolean;
  /** Another member's stats and past seasons, fetched on open; null for the viewer's own row (local). */
  details: MemberDetails | null;
  open: boolean;
  onClose: () => void;
}

export function CompetitorProfileModal({
  competitor,
  seasonPoints,
  periodLabel,
  viewerIsPublic = true,
  isPartner = false,
  details,
  open,
  onClose,
}: CompetitorProfileModalProps) {
  if (!competitor) return null;

  const isSelf = competitor.isUser;
  const targetIsPublic = competitor.isProfilePublic ?? true;
  const canViewDetailed = isSelf || isPartner || (viewerIsPublic && targetIsPublic);

  const ready = details?.status === 'ready' ? details : null;
  const stats = isSelf ? competitor.stats : ready?.stats;
  const seasonHistory = isSelf ? competitor.season_history : ready?.seasonHistory;
  const streak = canViewDetailed && stats ? getProfileStreakStats(stats) : null;
  const streakLoading = canViewDetailed && !isSelf && details?.status === 'loading';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Member profile"
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
        {/* Who: avatar, name, role, ID, and the season tier. */}
        <div className="flex items-start gap-3.5">
          <div
            className="w-14 h-14 rounded-2xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center text-3xl shrink-0"
            aria-hidden="true"
          >
            {competitor.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-xl font-semibold leading-tight text-content-primary truncate max-w-full">{competitor.name}</h3>
              {competitor.isUser && (
                <span className="text-2xs bg-primary-500/20 text-brand-text border border-primary-500/30 px-2 py-0.5 rounded-full font-medium shrink-0">
                  You
                </span>
              )}
              {isPartner && !competitor.isUser && (
                <span className="badge-sky text-2xs font-medium px-2 py-0.5 rounded-lg shrink-0">Partner</span>
              )}
              {competitor.isRealUser && !competitor.isUser && !isPartner && (
                <span className="badge-emerald text-2xs font-medium px-2 py-0.5 rounded-lg shrink-0">Member</span>
              )}
            </div>
            {/* Their 6-digit ID; never a made-up one from the account id (C11), like Settings. */}
            <div className="text-micro font-mono tabular-nums text-content-muted mt-1 truncate">
              {competitor.uid ? (
                <>ID: #{competitor.uid}</>
              ) : (
                <>
                  ID: <span aria-label="not available">—</span>
                </>
              )}
            </div>
            {/* Phones: the tier goes under the ID, so a long name keeps the row. */}
            <div className="mt-2 sm:hidden">
              <TierBadge totalPoints={seasonPoints} size="sm" showName />
            </div>
          </div>
          <div className="hidden sm:block shrink-0">
            <TierBadge totalPoints={seasonPoints} size="md" showName />
          </div>
        </div>

        {/* Points (always public) and, when their stats are shared, the streak. */}
        <dl
          className={`grid ${streak || streakLoading ? 'grid-cols-2' : 'grid-cols-1'} gap-px overflow-hidden rounded-xl border border-overlay-subtle bg-overlay-subtle`}
        >
          <div className="min-w-0 bg-bg-800 px-3.5 py-3">
            <dt className="stat-label truncate">{periodLabel}</dt>
            <dd className="figure mt-1 text-xl leading-tight text-brand-text truncate">{ptsText(competitor.points)}</dd>
            {periodLabel !== 'This season' && (
              <dd className="mt-0.5 text-micro text-content-muted truncate">Season {ptsText(seasonPoints)}</dd>
            )}
          </div>
          {streak ? (
            <div className="min-w-0 bg-bg-800 px-3.5 py-3">
              <dt className="stat-label truncate">Current streak</dt>
              <dd className="figure mt-1 text-xl leading-tight text-content-primary truncate">
                {plural(streak.currentStreakDays, 'day')}
              </dd>
              {streak.currentStreakCategory && (
                <dd className="mt-0.5 text-micro text-content-muted truncate">{streak.currentStreakCategory}</dd>
              )}
            </div>
          ) : streakLoading ? (
            <div className="min-w-0 bg-bg-800 px-3.5 py-3 space-y-2" aria-hidden="true">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          ) : null}
        </dl>

        {/* Reciprocal Privacy Guard Notice */}
        {!canViewDetailed ? (
          <div className="rounded-xl border border-overlay-subtle p-6 text-center space-y-2.5">
            <div className="flex items-center justify-center text-content-muted">
              {!viewerIsPublic ? <EyeOff size={18} className="text-warning-text" /> : <Lock size={18} />}
            </div>

            {!viewerIsPublic ? (
              <>
                <h4 className="text-base font-semibold leading-tight text-content-secondary">Your profile is private</h4>
                <p className="text-xs text-content-muted max-w-sm mx-auto leading-relaxed">
                  While your profile is private, you can't see other members' stats.
                </p>
                <p className="text-micro text-content-tertiary">Make your profile public in Settings to see them.</p>
              </>
            ) : (
              <>
                <h4 className="text-base font-semibold leading-tight text-content-secondary">Private profile</h4>
                <p className="text-xs text-content-muted max-w-sm mx-auto leading-relaxed">
                  This member keeps their stats private. Their username, rank, and league points
                  are still visible.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {!isSelf && details?.status === 'loading' ? (
              <ActivityStatsSkeleton />
            ) : !isSelf && details?.status === 'failed' ? (
              <div className="rounded-xl border border-overlay-subtle p-6 text-center space-y-1.5">
                <div className="flex items-center justify-center text-content-muted">
                  <WifiOff size={18} aria-hidden="true" />
                </div>
                <h4 className="text-base font-semibold leading-tight text-content-secondary">Stats didn't load</h4>
                <p className="text-xs text-content-muted max-w-sm mx-auto leading-relaxed">
                  Check your connection and open the profile again. Their username, rank, and league points are still visible.
                </p>
              </div>
            ) : stats?.card ? (
              <MemberCardStats card={stats.card} />
            ) : stats ? (
              // The member's app is older than the card: the streak above is all it publishes.
              <p className="rounded-xl border border-overlay-subtle px-4 py-3 text-xs text-content-muted leading-relaxed">
                More stats appear after this member next opens AscendDay.
              </p>
            ) : isSelf ? null : (
              // Allowed by this device's view, but the server sent no stats (a partnership or privacy
              // switch changed elsewhere): neutral note, never zeros that look real (C4).
              <div className="rounded-xl border border-overlay-subtle p-6 text-center space-y-1.5">
                <div className="flex items-center justify-center text-content-muted">
                  <EyeOff size={18} aria-hidden="true" />
                </div>
                <h4 className="text-base font-semibold leading-tight text-content-secondary">Stats hidden</h4>
                <p className="text-xs text-content-muted max-w-sm mx-auto leading-relaxed">
                  Their stats aren't shared with you right now. Their username, rank, and league points are still visible.
                </p>
              </div>
            )}

            {/* Past Seasons & Trophies */}
            {seasonHistory && seasonHistory.length > 0 && (
              <section>
                <h4 className="text-sm font-semibold text-content-primary mb-2.5">Past seasons ({seasonHistory.length})</h4>
                <ul className="rounded-xl border border-overlay-subtle divide-y divide-overlay-subtle">
                  {seasonHistory.map((historyRecord, idx) => {
                    const tier = getCurrentTier(historyRecord.points);
                    return (
                      <li key={idx} className="px-3 py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <TierBadge totalPoints={historyRecord.points} size="sm" />
                          <div className="min-w-0">
                            <p className="item-name text-sm text-content-secondary truncate">{historyRecord.seasonName}</p>
                            <p
                              className="text-2xs font-medium truncate"
                              style={{ color: `var(--rank-${tier.name.toLowerCase()}-text)` }}
                            >
                              {tier.name} tier
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="figure text-sm text-brand-text">{ptsText(historyRecord.points)}</p>
                          {historyRecord.date && (
                            <p className="text-2xs text-content-muted">{formatDateShort(historyRecord.date, historyRecord.date)}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** "1 day", "3 days": counts on the card are pluralised in words, never "day(s)". */
function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${n === 1 ? word : `${word}s`}`;
}

/** Big numbers stay short (12.4k), small ones keep up to 2 decimals. */
function amountText(n: number): string {
  return n >= 10_000
    ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
    : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Minutes as "45 min", or hours with one decimal from an hour up ("6.5 h"). */
function minutesText(min: number): string {
  if (min < 60) return `${min} min`;
  return `${amountText(Math.round((min / 60) * 10) / 10)} h`;
}

/** An exercise amount in its own unit. */
function exerciseText(n: number, unit: MemberCardExercise['unit']): string {
  if (unit === 'mins') return minutesText(Math.round(n));
  if (unit === 'km') return `${amountText(n)} km`;
  return `${amountText(n)} ${n === 1 ? unit.slice(0, -1) : unit}`;
}

/** Placeholder for the card while another member's stats load (same shape as MemberCardStats). */
function ActivityStatsSkeleton() {
  return (
    <section aria-busy="true">
      <h4 className="text-sm font-semibold text-content-primary mb-2.5">Last {MEMBER_CARD_DAYS} days</h4>
      <span className="sr-only">Loading stats…</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px overflow-hidden rounded-xl border border-overlay-subtle bg-overlay-subtle">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-bg-800 p-3 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>
    </section>
  );
}

interface Tile {
  icon: LucideIcon;
  color: string;
  label: string;
  /** Undefined: the module was used, but not in the window ("None in 30 days"). */
  value?: string;
  quiet?: string;
  hint?: string;
}

/**
 * The tile that ends the grid stretches over the empty cells of its row (2 columns on phones,
 * 3 from sm up), so the hairline grid never shows a blank grey cell.
 */
function lastTileSpan(index: number, count: number): string {
  if (index !== count - 1) return '';
  const phone = count % 2 === 1 ? 'col-span-2' : '';
  const wide = count % 3 === 1 ? 'sm:col-span-3' : count % 3 === 2 ? 'sm:col-span-2' : phone ? 'sm:col-span-1' : '';
  return `${phone} ${wide}`;
}

/**
 * The member's last 30 days (lib/memberStats.ts), as their app last published it: a hairline grid of
 * the modules they use, then their top exercises. Modules never used are not shown; used but quiet
 * ones say so instead of a zero that reads like a result.
 */
function MemberCardStats({ card }: { card: MemberCard }) {
  const headingId = useId();
  const exerciseId = useId();
  const none = `None in ${MEMBER_CARD_DAYS} days`;
  // Older than yesterday on the viewer's calendar: the member hasn't opened the app since.
  const stale = card.asOf < addDays(todayKey(), -1);

  const tiles: Tile[] = [
    {
      icon: CalendarCheck,
      color: 'var(--badge-orange-text)',
      label: 'Active days',
      value: plural(card.active, 'day'),
      hint: card.days < MEMBER_CARD_DAYS ? `of ${card.days} since joining` : `of the last ${MEMBER_CARD_DAYS}`,
    },
  ];
  if (card.habits) {
    const { done, due } = card.habits;
    tiles.push({
      icon: CheckSquare,
      color: 'var(--badge-emerald-text)',
      label: 'Habits',
      value: due === 0 ? undefined : due < 3 ? `${done} of ${due}` : `${Math.round((done / due) * 100)}%`,
      quiet: 'None due yet',
      hint: due === 0 ? undefined : due < 3 ? 'check-ins done' : `${done.toLocaleString()} of ${due.toLocaleString()} check-ins`,
    });
  }
  if (card.skills) {
    const { minutes, days } = card.skills;
    tiles.push({
      icon: Target,
      color: 'var(--badge-purple-text)',
      label: 'Skills',
      value: days > 0 ? minutesText(minutes) : undefined,
      hint: days > 0 ? `${plural(days, 'practice day')}` : undefined,
    });
  }
  if (card.reading) {
    const { days, booksThisSeason, pages } = card.reading;
    const hint = [
      booksThisSeason > 0 ? `${plural(booksThisSeason, 'book')} this season` : '',
      days > 0 && pages !== undefined ? plural(pages, 'page') : '',
    ].filter(Boolean);
    tiles.push({
      icon: Book,
      color: 'var(--badge-violet-text)',
      label: 'Reading',
      value: days > 0 ? plural(days, 'day') : undefined,
      hint: hint.length > 0 ? hint.join(' · ') : undefined,
    });
  }
  if (card.focus) {
    const { minutes, sessions } = card.focus;
    tiles.push({
      icon: Timer,
      color: 'var(--badge-sky-text)',
      label: 'Focus',
      value: sessions > 0 ? minutesText(minutes) : undefined,
      hint: sessions > 0 ? plural(sessions, 'session') : undefined,
    });
  }
  if (card.journal) {
    tiles.push({
      icon: BookOpen,
      color: 'var(--badge-teal-text)',
      label: 'Journal',
      value: card.journal.days > 0 ? plural(card.journal.days, 'day') : undefined,
      hint: card.journal.days > 0 ? 'with an entry' : undefined,
    });
  }
  const nothingYet = tiles.length === 1 && card.active === 0 && card.exercise === undefined;

  return (
    <>
      <section aria-labelledby={headingId}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-2.5">
          <h4 id={headingId} className="text-sm font-semibold text-content-primary">
            Last {MEMBER_CARD_DAYS} days
          </h4>
          {stale && <p className="text-micro text-content-muted">Updated {formatDateShort(card.asOf, card.asOf)}</p>}
        </div>
        {nothingYet ? (
          <p className="rounded-xl border border-overlay-subtle px-4 py-3 text-xs text-content-muted">
            Nothing logged in the last {MEMBER_CARD_DAYS} days.
          </p>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px overflow-hidden rounded-xl border border-overlay-subtle bg-overlay-subtle">
            {tiles.map(({ icon: Icon, color, label, value, quiet, hint }, i) => (
              <div key={label} className={`min-w-0 bg-bg-800 p-3 ${lastTileSpan(i, tiles.length)}`}>
                <dt className="flex items-center gap-1.5 stat-label">
                  <Icon size={14} aria-hidden="true" className="shrink-0" style={{ color }} />
                  <span className="truncate">{label}</span>
                </dt>
                {value !== undefined ? (
                  <dd className="figure mt-1 text-lg leading-tight text-content-primary truncate">{value}</dd>
                ) : (
                  <dd className="mt-1.5 text-sm leading-tight text-content-muted truncate">{quiet ?? none}</dd>
                )}
                {hint && <dd className="mt-0.5 text-micro leading-snug text-content-muted">{hint}</dd>}
              </div>
            ))}
          </dl>
        )}
      </section>

      {card.exercise && (
        <section aria-labelledby={exerciseId}>
          <h4 id={exerciseId} className="text-sm font-semibold text-content-primary mb-2.5">
            Top exercises
          </h4>
          {card.exercise.length === 0 ? (
            <p className="rounded-xl border border-overlay-subtle px-4 py-3 text-xs text-content-muted">{none}.</p>
          ) : (
            <ol className="rounded-xl border border-overlay-subtle divide-y divide-overlay-subtle">
              {card.exercise.map((e, i) => (
                <li key={`${e.name}|${e.unit}`} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="figure w-4 shrink-0 text-xs text-content-muted" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="item-name text-sm text-content-secondary truncate">{e.name}</p>
                    <p className="text-micro text-content-muted truncate">
                      {plural(e.days, 'day')} · best day {exerciseText(e.best, e.unit)}
                    </p>
                  </div>
                  <p className="figure shrink-0 text-sm text-content-primary">{exerciseText(e.total, e.unit)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </>
  );
}
