import { LeagueCompetitor } from '@/types';
import { TierBadge } from './TierBadge';
import { Dialog, Skeleton } from '@/components/ui/primitives';
import { Flame, CheckSquare, BookOpen, Activity, Book, Target, Lock, EyeOff, WifiOff, type LucideIcon } from 'lucide-react';
import { getProfileStreakStats } from '@/lib/streakLogic';
import { getCurrentTier } from '@/lib/tiers';
import { formatDateShort } from '@/lib/dates';
import { ptsText } from '@/lib/leagues';
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Member profile"
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        {/* Profile Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center text-3xl shrink-0">
              {competitor.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold leading-tight text-content-primary truncate">{competitor.name}</h3>
                {competitor.isUser && (
                  <span className="text-2xs bg-primary-500/20 text-brand-text border border-primary-500/30 px-2 py-0.5 rounded-full font-medium shrink-0">
                    You
                  </span>
                )}
                {isPartner && !competitor.isUser && (
                  <span className="badge-sky text-2xs font-medium px-2 py-0.5 rounded-lg shrink-0">Partner</span>
                )}
                {competitor.isRealUser && !competitor.isUser && !isPartner && (
                  <span className="badge-emerald text-2xs font-medium px-2 py-0.5 rounded-lg shrink-0">
                    Member
                  </span>
                )}
              </div>

              {/* Their 6-digit ID; never a made-up one from the account id (C11), like Settings. */}
              <div className="text-micro font-mono tabular-nums text-content-muted mt-0.5 truncate">
                {competitor.uid ? (
                  <>ID: #{competitor.uid}</>
                ) : (
                  <>
                    ID: <span aria-label="not available">—</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-content-muted">{periodLabel}:</span>
                <span className="figure text-xs text-brand-text">{ptsText(competitor.points)}</span>
              </div>
            </div>
          </div>

          {/* Tier Badge */}
          <div className="shrink-0 self-start sm:self-center">
            <TierBadge totalPoints={seasonPoints} size="md" showName />
          </div>
        </div>

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
            ) : stats ? (
              <ActivityStats stats={stats} />
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
                <h4 className="stat-label mb-2.5">Past seasons ({seasonHistory.length})</h4>
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

/** Placeholder for ActivityStats while another member's stats load. */
function ActivityStatsSkeleton() {
  return (
    <section aria-busy="true">
      <h4 className="stat-label mb-2.5">Activity</h4>
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

/** The member's activity as one hairline grid (no boxes): 2 columns on phones, 3 from sm up. */
function ActivityStats({ stats }: { stats: NonNullable<LeagueCompetitor['stats']> }) {
  const streak = getProfileStreakStats(stats);
  const items: { icon: LucideIcon; color: string; label: string; value: string; hint?: string }[] = [
    {
      icon: Flame,
      color: 'var(--badge-orange-text)',
      label: 'Current streak',
      value: `${streak.currentStreakDays} ${streak.currentStreakDays === 1 ? 'day' : 'days'}`,
      hint: streak.currentStreakCategory || undefined,
    },
    { icon: CheckSquare, color: 'var(--badge-emerald-text)', label: 'Habits done', value: stats.habitsCompletedCount.toLocaleString() },
    { icon: BookOpen, color: 'var(--badge-sky-text)', label: 'Journal entries', value: stats.journalEntriesCount.toLocaleString() },
    { icon: Activity, color: 'var(--badge-teal-text)', label: 'Exercise', value: `${stats.exerciseMinutes.toLocaleString()} min` },
    { icon: Book, color: 'var(--badge-violet-text)', label: 'Books read', value: stats.booksRead.toLocaleString() },
    { icon: Target, color: 'var(--badge-purple-text)', label: 'Skills practiced', value: stats.skillsPracticedCount.toLocaleString() },
  ];
  return (
    <section>
      <h4 className="stat-label mb-2.5">Activity</h4>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px overflow-hidden rounded-xl border border-overlay-subtle bg-overlay-subtle">
        {items.map(({ icon: Icon, color, label, value, hint }) => (
          <div key={label} className="min-w-0 bg-bg-800 p-3">
            <dt className="flex items-center gap-1.5 stat-label">
              <Icon size={14} aria-hidden="true" className="shrink-0" style={{ color }} />
              <span className="truncate">{label}</span>
            </dt>
            <dd className="figure mt-1 text-lg leading-tight text-content-primary truncate">{value}</dd>
            {hint && <dd className="mt-0.5 text-micro text-content-muted truncate">{hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
