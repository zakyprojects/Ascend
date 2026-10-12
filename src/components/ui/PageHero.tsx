import { ReactNode } from 'react';
import { ProgressRing } from './charts';
import type { ChartTone } from './charts/chartShared';
import { cx } from './primitives/shared';

export interface PageHeroStat {
  label: string;
  value: ReactNode;
  /** A short line under the value (unit, context). */
  hint?: ReactNode;
  /** Colour for the value (e.g. text-brand-text, text-secondary-400); neutral when left out. */
  valueClassName?: string;
}

export interface PageHeroProps {
  /** Optional progress ring before the headline number (today's share, a weekly target). */
  ring?: { value: number; max: number; label: string; center: ReactNode; caption?: string; tone?: ChartTone };
  /** The one number the page is about, set large in the serif. */
  lead: { label: string; value: ReactNode; hint?: ReactNode; valueClassName?: string };
  /** Supporting numbers, shown as quiet columns divided by hairlines (no boxes). */
  stats?: PageHeroStat[];
  /** Right-hand slot, usually the page's points meter. */
  side?: ReactNode;
  ariaLabel: string;
  className?: string;
}

/**
 * The top of a module page (Design v3): one card that says how you are doing here, in the
 * same shape as the Dashboard hero. Replaces rows of equal stat boxes.
 */
export function PageHero({ ring, lead, stats = [], side, ariaLabel, className }: PageHeroProps) {
  return (
    <section className={cx('card relative overflow-hidden p-5 sm:p-6', className)} aria-label={ariaLabel}>
      <div aria-hidden="true" className="hero-glow hero-glow-corner" />
      <div
        className={cx(
          'relative grid gap-6',
          side ? 'xl:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] xl:items-center xl:gap-8' : undefined
        )}
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-8">
          <div className="flex items-center gap-5">
            {ring && (
              <ProgressRing value={ring.value} max={Math.max(ring.max, 1)} label={ring.label} size={104} thickness={8} tone={ring.tone}>
                <span className="text-3xl font-medium leading-none text-content-primary tabular-nums">
                  {ring.center}
                </span>
                {ring.caption && <span className="mt-1 text-2xs text-content-muted">{ring.caption}</span>}
              </ProgressRing>
            )}
            <div className="min-w-0">
              <div className="stat-label">{lead.label}</div>
              <div className={cx('mt-1 font-serif text-5xl leading-none tabular-nums', lead.valueClassName ?? 'text-content-primary')}>{lead.value}</div>
              {lead.hint && <div className="mt-2 text-sm text-content-muted">{lead.hint}</div>}
            </div>
          </div>

          {stats.length > 0 && (
            <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:gap-0 md:border-l md:border-overlay-subtle">
              {stats.map((stat) => (
                <div key={stat.label} className="min-w-0 sm:px-6 sm:first:pl-0 md:first:pl-8 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-overlay-subtle">
                  <dt className="stat-label">{stat.label}</dt>
                  <dd className={cx('mt-1 text-3xl font-medium leading-none tabular-nums', stat.valueClassName ?? 'text-content-primary')}>{stat.value}</dd>
                  {stat.hint && <dd className="mt-0.5 text-micro text-content-muted">{stat.hint}</dd>}
                </div>
              ))}
            </dl>
          )}
        </div>

        {side && <div className="border-t border-overlay-subtle pt-5 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">{side}</div>}
      </div>
    </section>
  );
}
