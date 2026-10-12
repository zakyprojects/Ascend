import { PointerEvent, useId, useRef } from 'react';
import { useIntroMotion, useSeen } from '@/lib/motion';
import { cx } from '../primitives/shared';
import { ChartTooltip } from './ChartTooltip';
import { ChartTone, toneText, useChartHover } from './chartShared';

export interface SparklinePoint {
  label: string;
  value: number;
}

export interface SparklineProps {
  points: SparklinePoint[];
  /** Accessible summary, e.g. "Points over the last 14 days, up 20%". */
  label: string;
  tone?: ChartTone;
  /** Height in px; the line stretches to the container's width. */
  height?: number;
  /** Soft gradient under the line. */
  area?: boolean;
  /** Tooltip text for a point; defaults to "label: value". */
  formatTooltip?: (point: SparklinePoint) => string;
  className?: string;
}

const VIEW_WIDTH = 100;

/**
 * Trend line that fills its container's width. On a view's first visit it wipes in from the
 * left when it comes into view. Pointer or touch shows the nearest point.
 */
export function Sparkline({
  points,
  label,
  tone = 'brand',
  height = 48,
  area = true,
  formatTooltip = (p) => `${p.label}: ${p.value}`,
  className,
}: SparklineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const intro = useIntroMotion();
  const seen = useSeen(ref, intro);
  const { active, setActive, clear } = useChartHover();
  const gradientId = useId();

  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  // A flat series sits mid-height instead of on the floor.
  const yPercent = (v: number) => (max === min ? 50 : 100 - ((v - min) / range) * 100);
  const xPercent = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 100);
  // Keep the stroke inside the box at the extremes.
  const pad = 2;
  const toY = (v: number) => pad + (yPercent(v) / 100) * (height - pad * 2);
  const toX = (i: number) => (xPercent(i) / 100) * VIEW_WIDTH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(2)},${toY(p.value).toFixed(2)}`).join(' ');
  const fill = `${line} L${toX(points.length - 1).toFixed(2)},${height} L${toX(0).toFixed(2)},${height} Z`;

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setActive(Math.round(ratio * (points.length - 1)));
  };

  const last = points.length - 1;
  const dotIndex = active ?? last;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={cx('relative w-full touch-pan-y', toneText[tone], className)}
      style={{ height }}
      onPointerMove={onPointer}
      onPointerDown={onPointer}
      onPointerLeave={clear}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="overflow-visible transition-[clip-path] duration-[900ms] ease-emphasized motion-reduce:transition-none"
        style={{ clipPath: seen ? 'inset(-4px)' : 'inset(-4px 100% -4px -4px)' }}
      >
        {area && (
          <>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={fill} fill={`url(#${gradientId})`} />
          </>
        )}
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* The dot is HTML so the stretched viewBox cannot squash it into an ellipse. */}
      {seen && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-bg-800 transition-[left,top] duration-fast"
          style={{ left: `${xPercent(dotIndex)}%`, top: toY(points[dotIndex].value) }}
        />
      )}
      {active !== null && <ChartTooltip x={xPercent(active)}>{formatTooltip(points[active])}</ChartTooltip>}
    </div>
  );
}
