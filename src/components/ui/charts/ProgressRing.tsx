import { ReactNode, useRef } from 'react';
import { useIntroMotion, useSeen } from '@/lib/motion';
import { cx } from '../primitives/shared';
import { ChartTone, toneText } from './chartShared';

export interface ProgressRingProps {
  /** Current amount; clamped to 0..max. */
  value: number;
  max?: number;
  /** Accessible name, e.g. "Pact streak progress". */
  label: string;
  tone?: ChartTone;
  /** Outer size in px. */
  size?: number;
  /** Stroke width in px at that size. */
  thickness?: number;
  /** Content centred inside the ring (a number, an icon). */
  children?: ReactNode;
  className?: string;
}

/**
 * Circular progress. On a view's first visit it draws in from 0 when it comes into view;
 * afterwards value changes glide, like ProgressBar.
 */
export function ProgressRing({
  value,
  max = 100,
  label,
  tone = 'brand',
  size = 80,
  thickness = 7,
  children,
  className,
}: ProgressRingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const intro = useIntroMotion();
  const seen = useSeen(ref, intro);
  const safeMax = max > 0 ? max : 1;
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const radius = (size - thickness) / 2;
  const shown = seen ? percent : 0;

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, Math.round(value)))}
      className={cx('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-current text-overlay-default"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - shown}
          // A round cap on an empty ring would still paint a dot.
          strokeLinecap={shown > 0 ? 'round' : 'butt'}
          className={cx(
            'stroke-current transition-[stroke-dashoffset] duration-slow ease-emphasized motion-reduce:transition-none',
            toneText[tone]
          )}
        />
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}
