import { useMemo } from 'react';
import { Check, Compass, History, Lock } from 'lucide-react';
import { getCurrentTier, getProgressToNextTier, getNextTier, TIERS } from '@/lib/tiers';
import { AppStore } from '@/lib/store';
import type { PointsEntry } from '@/types';
import { cx, EmptyState, PageColumns, ProgressBar } from '@/components/ui/primitives';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { PageHero } from '@/components/ui/PageHero';
import { TIER_ICONS } from '@/components/ui/TierBadge';
import { LeagueCountdown } from '@/components/ui/LeagueCountdown';
import { getLocalResetDetail, sortPointsNewestFirst } from '@/lib/leagues';
import { getSeasonNumber, getSeasonStart, leagueNow } from '@/lib/leagueTime';
import { isTodayLocal, isYesterdayLocal } from '@/lib/dates';
import { useLocalDayKey } from '@/lib/useLocalDayKey';

/** Entries the Recent points list shows (newest first). */
const RECENT_POINTS_SHOWN = 10;

const rankVar = (tierName: string, part: 'text' | 'bg' | 'border') => `var(--rank-${tierName.toLowerCase()}-${part})`;

/** "Today 3:40 PM", "Yesterday 9:05 AM", "Oct 12 · 3:40 PM"; entries from an earlier season say which. */
function formatEntryTime(entry: PointsEntry, now: Date, seasonStart: Date): string {
  const d = new Date(entry.timestamp);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.getTime() < seasonStart.getTime()) {
    const day = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    });
    return `${day} · Season ${getSeasonNumber(d)}`;
  }
  if (isTodayLocal(entry.timestamp)) return `Today ${time}`;
  if (isYesterdayLocal(entry.timestamp)) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
}

export function TierView({ store }: { store: AppStore }) {
  // Re-renders at local midnight, so "Today" / "Yesterday" labels on recent points roll over (C5).
  useLocalDayKey();
  const now = leagueNow();
  const seasonStart = getSeasonStart(now);
  const seasonPoints = store.getLeagueData('ninetyDay').userPoints;
  const currentTier = getCurrentTier(seasonPoints);
  const nextTier = getNextTier(seasonPoints);
  const progress = getProgressToNextTier(seasonPoints);
  // Floored, so 99.75% never reads as 100% while a point is still missing.
  const percent = Math.floor(progress.percent);
  const toNext = nextTier ? nextTier.minPoints - seasonPoints : 0;
  const rankText = rankVar(currentTier.name, 'text');

  const pointsHistory = store.state.pointsHistory;
  // Sorted by time: a sync pull can leave the stored ledger out of order.
  const recentPoints = useMemo(
    () => sortPointsNewestFirst(pointsHistory ?? []).slice(0, RECENT_POINTS_SHOWN),
    [pointsHistory]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Ranks</h1>
        <p className="page-subtitle">Climb the ladder from Beginner to Master.</p>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Your rank this season"
          ring={{
            value: percent,
            max: 100,
            label: nextTier ? `${percent}% of the way to ${nextTier.name}` : 'Top rank reached',
            center: `${percent}%`,
            caption: nextTier ? `to ${nextTier.name}` : 'Top rank',
            color: rankText,
          }}
          lead={{
            label: 'Rank',
            value: <span style={{ color: rankText }}>{currentTier.name}</span>,
            hint: (
              <>
                <CountUp value={seasonPoints} className="figure text-content-secondary" />{' '}
                {seasonPoints === 1 ? 'season point' : 'season points'}
              </>
            ),
          }}
          stats={[
            nextTier
              ? {
                  label: `To ${nextTier.name}`,
                  value: <CountUp value={toNext} />,
                  hint: toNext === 1 ? 'point' : 'points',
                }
              : { label: 'Next rank', value: 'Top rank', hint: 'Highest rank this season' },
            {
              label: 'Season ends in',
              value: <LeagueCountdown type="ninetyDay" className="font-mono text-lg sm:text-2xl" />,
              hint: getLocalResetDetail('ninetyDay', now),
            },
          ]}
        />
      </Reveal>

      <PageColumns
        lead={
          <Reveal index={1}>
            <section aria-labelledby="ranks-all">
              <h2 id="ranks-all" className="section-title">All ranks</h2>
              <p className="mb-3 mt-1 text-sm text-content-muted">
                Your rank comes from this season’s points and starts again at Beginner each season.
              </p>
              <ol className="card divide-y divide-overlay-subtle overflow-hidden">
                {TIERS.map((tier, idx) => {
                  const reached = seasonPoints >= tier.minPoints;
                  const isCurrent = tier.name === currentTier.name;
                  const Icon = TIER_ICONS[tier.icon] ?? Compass;
                  const tierText = rankVar(tier.name, 'text');

                  return (
                    <li
                      key={tier.name}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={cx('relative flex items-start gap-3 p-4 sm:gap-4', isCurrent && 'bg-overlay-subtle')}
                    >
                      {isCurrent && (
                        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5" style={{ backgroundColor: tierText }} />
                      )}
                      <span className="figure w-5 shrink-0 pt-2.5 text-center text-xs text-content-muted">{idx + 1}</span>

                      <span
                        className={cx(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                          !reached && 'border border-overlay-default bg-overlay-subtle'
                        )}
                        style={
                          reached
                            ? { backgroundColor: rankVar(tier.name, 'bg'), border: `1.5px solid ${rankVar(tier.name, 'border')}` }
                            : undefined
                        }
                      >
                        {reached ? (
                          <Icon size={18} aria-hidden="true" style={{ color: tierText }} />
                        ) : (
                          <>
                            <Lock size={16} aria-hidden="true" className="text-content-muted" />
                            <span className="sr-only">Locked</span>
                          </>
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <h3
                              className={cx('text-base font-semibold leading-tight', !reached && 'text-content-tertiary')}
                              style={reached ? { color: tierText } : undefined}
                            >
                              {tier.name}
                            </h3>
                            {isCurrent && <span className="badge badge-emerald">Current</span>}
                            {reached && !isCurrent && (
                              <>
                                <Check size={14} aria-hidden="true" className="text-success-text" />
                                <span className="sr-only">Reached</span>
                              </>
                            )}
                          </div>
                          <span className="figure shrink-0 text-sm text-content-muted">
                            {tier.minPoints.toLocaleString()} pts
                          </span>
                        </div>
                        {tier.description && (
                          <p className="mt-1 text-xs leading-snug text-content-muted">{tier.description}</p>
                        )}
                        {isCurrent && nextTier && (
                          <div className="mt-3">
                            <ProgressBar
                              value={progress.current}
                              max={progress.needed}
                              size="sm"
                              label={`Progress to ${nextTier.name}`}
                              fillStyle={{ backgroundColor: tierText }}
                            />
                            <p className="mt-1.5 text-2xs text-content-muted">
                              <span className="figure">{percent}%</span> of the way to {nextTier.name}
                            </p>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </Reveal>
        }
        aside={
          <section aria-labelledby="ranks-recent">
            <h2 id="ranks-recent" className="section-title mb-3">Recent points</h2>
            {recentPoints.length === 0 ? (
              <EmptyState icon={History} size="sm" title="No points yet" description="Points you earn show up here." />
            ) : (
              <ul className="card divide-y divide-overlay-subtle overflow-hidden">
                {recentPoints.map((entry) => {
                  const amount = entry.amount || 0;
                  return (
                    <li key={entry.id} className="scroll-rise flex items-center gap-3 p-3.5">
                      <span
                        className={cx(
                          'flex h-8 w-11 shrink-0 items-center justify-center rounded-lg',
                          amount > 0 ? 'bg-primary-500/15' : amount < 0 ? 'bg-error/15' : 'bg-overlay-subtle'
                        )}
                      >
                        <span
                          className={cx(
                            'figure text-xs',
                            amount > 0 ? 'text-brand-text' : amount < 0 ? 'text-error-text' : 'text-content-muted'
                          )}
                        >
                          {/* Readable red in light theme (C10); a real minus sign like the rest of the app. */}
                          {amount > 0 ? '+' : amount < 0 ? '−' : ''}
                          {Math.abs(amount).toLocaleString()}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-content-secondary">{entry.reason}</p>
                        <p className="text-xs text-content-muted">{formatEntryTime(entry, now, seasonStart)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        }
      />
    </div>
  );
}
