import { useRef } from 'react';
import { useIntroMotion, useSeen } from '@/lib/motion';
import { cx, FOCUS_RING } from '../primitives/shared';
import { ChartTooltip } from './ChartTooltip';
import { ChartTone, toneText, useChartHover } from './chartShared';

export interface BarDatum {
  /** Axis label under the bar, e.g. "Mon". */
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarDatum[];
  /** Accessible summary, e.g. "Habits completed per day this week". */
  label: string;
  tone?: ChartTone;
  /** Bar drawn at full strength (e.g. today); the rest are softer. Omit to show all full. */
  highlightIndex?: number;
  /** Value of a full-height bar (e.g. the number of habits); defaults to the largest value. */
  max?: number;
  /** Height of the bar area in px (labels sit below it). */
  height?: number;
  /** Tooltip text for a bar; defaults to "label: value". */
  formatTooltip?: (datum: BarDatum, index: number) => string;
  className?: string;
}

const STAGGER_MS = 40;

/**
 * Column chart (a week, a month). Each time a view opens, the bars grow from the baseline in a
 * short stagger when the chart comes into view. Each bar is focusable, so the tooltip works by
 * keyboard as well as pointer and touch.
 */
export function BarChart({
  data,
  label,
  tone = 'brand',
  highlightIndex,
  max: maxProp,
  height = 96,
  formatTooltip = (d) => `${d.label}: ${d.value}`,
  className,
}: BarChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const intro = useIntroMotion();
  const seen = useSeen(ref, intro);
  const { active, setActive, clear } = useChartHover();
  const max = maxProp ?? (Math.max(0, ...data.map((d) => d.value)) || 1);

  return (
    <div ref={ref} role="group" aria-label={label} data-no-swipe="" className={cx('w-full', toneText[tone], className)}>
      <div className="relative flex items-end gap-1.5" style={{ height }} onPointerLeave={clear}>
        {data.map((datum, i) => {
          const percent = Math.min(100, Math.max(0, (datum.value / (max || 1)) * 100));
          const soft = highlightIndex !== undefined && i !== highlightIndex;
          return (
            <button
              key={`${datum.label}-${i}`}
              type="button"
              aria-label={formatTooltip(datum, i)}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={clear}
              className={cx('relative flex h-full flex-1 items-end rounded-lg', FOCUS_RING)}
            >
              {/* Empty days keep a sliver so the week's shape still reads. */}
              <span
                aria-hidden="true"
                className={cx(
                  'block w-full origin-bottom rounded-lg bg-current transition-[transform,opacity] duration-slow ease-emphasized motion-reduce:transition-none',
                  soft ? 'opacity-40' : 'opacity-100',
                  active === i && 'opacity-100'
                )}
                style={{
                  height: `max(${percent}%, 3px)`,
                  transform: seen ? 'scaleY(1)' : 'scaleY(0)',
                  transitionDelay: seen && intro ? `${i * STAGGER_MS}ms` : undefined,
                }}
              />
            </button>
          );
        })}
        {active !== null && data[active] && (
          <ChartTooltip x={((active + 0.5) / data.length) * 100}>{formatTooltip(data[active], active)}</ChartTooltip>
        )}
      </div>
      <div className="mt-1.5 flex gap-1.5" aria-hidden="true">
        {data.map((datum, i) => (
          <span
            key={`${datum.label}-${i}`}
            className={cx(
              'flex-1 text-center text-2xs font-medium',
              i === highlightIndex ? 'text-content-primary' : 'text-content-muted'
            )}
          >
            {datum.label}
          </span>
        ))}
      </div>
    </div>
  );
}
