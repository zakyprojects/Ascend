import type React from 'react';
import { Brain, Calendar, CalendarDays, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/primitives';
import { cx, FOCUS_RING, TRANSITION } from '@/components/ui/primitives/shared';
import { CountUp } from '@/components/ui/Motion';
import { LeagueCountdown } from '@/components/ui/LeagueCountdown';
import { LEAGUE_CONFIG, pointsText } from '@/lib/leagues/leagues';
import { pageLinkProps } from '@/lib/pageLink';
import type { View } from '@/lib/views';
import type { LeagueType } from '@/types';

// Copies of four small components that live inside page files and are not exported:
// ModuleLink and LeagueRow (views/Dashboard.tsx), RankNumber and YouTag (views/Leagues.tsx).
// Exporting them from those files changed the prod Dashboard and Leagues chunks (each lazy chunk
// keeps every export), so the Gallery shows a copy instead. Same markup and classes: keep in step
// when the originals change. Dev Gallery only.

const MODULE_TONE_CLASS = {
  emerald: 'badge-emerald',
  amber: 'badge-amber',
  purple: 'badge-purple',
  rose: 'badge-rose',
  red: 'badge-red',
  sky: 'badge-sky',
  cyan: 'badge-cyan',
  indigo: 'badge-indigo',
} as const;

interface ModuleLinkProps {
  tone: keyof typeof MODULE_TONE_CLASS;
  icon: LucideIcon;
  title: string;
  view: View;
  navigate: (view: View) => void;
  value: React.ReactNode;
  unit?: string;
  sub: React.ReactNode;
}

/** Copy of Dashboard.tsx ModuleLink: a compact one-line row on phones, a tile from `sm`. */
export function ModuleLink({ tone, icon: Icon, title, view, navigate, value, unit, sub }: ModuleLinkProps) {
  const iconTile = (
    <span className={cx(MODULE_TONE_CLASS[tone], 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg')}>
      <Icon size={16} aria-hidden="true" />
    </span>
  );
  return (
    <a {...pageLinkProps(view, navigate)} className={cx('card card-hover block p-3 sm:p-5', FOCUS_RING)}>
      <span className="flex items-center gap-3 sm:hidden">
        {iconTile}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-content-secondary">{title}</span>
        <span className="shrink-0 text-right">
          <span className="figure text-sm font-medium text-content-primary">{value}</span>
          {unit && <span className="ml-1 text-xs text-content-muted">{unit}</span>}
        </span>
      </span>
      <span className="hidden h-full flex-col justify-between gap-2 sm:flex">
        <span className="flex items-center justify-between">
          <span className="stat-label">{title}</span>
          {iconTile}
        </span>
        <span>
          <span className="block text-2xl font-medium leading-tight text-content-primary tabular-nums">
            {value}
            {unit && <span className="ml-1 font-sans text-xs text-content-muted">{unit}</span>}
          </span>
          <span className="block text-micro text-content-muted">{sub}</span>
        </span>
      </span>
    </a>
  );
}

const LEAGUE_ICONS: Record<string, LucideIcon> = { Calendar, CalendarDays, Brain };

const LEAGUE_TONE: Record<LeagueType, keyof typeof MODULE_TONE_CLASS> = {
  weekly: 'emerald',
  monthly: 'sky',
  ninetyDay: 'purple',
};

const LEAGUE_LABEL: Record<LeagueType, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  ninetyDay: 'Season',
};

interface LeagueRowProps {
  type: LeagueType;
  rank: number;
  points: number;
  status: 'loading' | 'ready' | 'failed';
  navigate: (view: View) => void;
}

/** Copy of Dashboard.tsx LeagueRow: your place in one league ("—" when failed or no points). */
export function LeagueRow({ type, rank, points, status, navigate }: LeagueRowProps) {
  const tone = LEAGUE_TONE[type];
  const Icon = LEAGUE_ICONS[LEAGUE_CONFIG[type].icon] ?? Calendar;
  const label = LEAGUE_LABEL[type];
  const hasPlace = status === 'ready' && points > 0;
  const placeText =
    points <= 0 ? 'no points yet' : status === 'ready' ? `place ${rank}` : status === 'failed' ? 'place not loaded' : 'loading place';

  return (
    <li>
      <a
        {...pageLinkProps('leagues', navigate)}
        aria-label={`${label} league: ${placeText}, ${pointsText(points)}`}
        className={cx('flex items-center gap-3 px-4 py-3 hover:bg-overlay-subtle', FOCUS_RING, TRANSITION)}
      >
        <span className={cx(MODULE_TONE_CLASS[tone], 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg')}>
          <Icon size={15} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-content-secondary">{label}</span>
          <span className="block truncate text-2xs text-content-muted">
            {type === 'ninetyDay' ? 'Ends in ' : 'Resets in '}
            <LeagueCountdown type={type} className="font-mono" />
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-right">
          {status === 'loading' && points > 0 ? (
            <Skeleton className="ml-auto h-5 w-9" />
          ) : (
            <span
              className={cx('figure block text-lg leading-none', !hasPlace && 'text-content-muted')}
              style={hasPlace ? { color: `var(--badge-${tone}-text)` } : undefined}
            >
              {hasPlace ? <>#<CountUp value={rank} /></> : '—'}
            </span>
          )}
          <span className="mt-1 block figure text-2xs text-content-muted">
            {points > 0 ? <><CountUp value={points} /> {points === 1 ? 'pt' : 'pts'}</> : 'No points yet'}
          </span>
        </span>
      </a>
    </li>
  );
}

/** Copy of Leagues.tsx RankNumber: a member with 0 points this period has no place (a dash). */
export function RankNumber({ rank }: { rank: number | null }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'figure w-6 shrink-0 text-center text-sm',
        rank !== null && rank <= 3 ? 'font-semibold text-content-primary' : 'text-content-muted'
      )}
    >
      {rank ?? '–'}
    </span>
  );
}

/** Copy of Leagues.tsx YouTag. */
export function YouTag() {
  return <span className="badge badge-emerald shrink-0">You</span>;
}
