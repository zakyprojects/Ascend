import { CSSProperties, useRef } from 'react';
import { useIntroMotion, useSeen } from '@/lib/motion';
import { cx } from './shared';

export type ProgressTone = 'brand' | 'success' | 'warning' | 'purple' | 'cyan';
export type ProgressSize = 'sm' | 'md' | 'lg';

export interface ProgressBarProps {
  /** Current amount; clamped to 0..max. */
  value: number;
  max?: number;
  /** Accessible name, e.g. "Weekly goal progress". */
  label: string;
  tone?: ProgressTone;
  size?: ProgressSize;
  /** Overrides the tone's fill, for fills that are data-driven (the rank gradient). */
  fillStyle?: CSSProperties;
  /**
   * For values that advance on a clock (elapsed time): no intro grow, and a linear 1s glide
   * that matches the tick instead of an eased jump.
   */
  live?: boolean;
  /** A threshold line drawn over the bar (e.g. an unlock point), as a 0..max position. */
  marker?: { at: number; label: string };
  className?: string;
}

const toneClasses: Record<ProgressTone, string> = {
  brand: 'bg-primary-500',
  success: 'bg-success-text',
  warning: 'bg-warning-text',
  // Module identity colours (Skills purple, Projects cyan), kept by decision.
  purple: 'bg-purple-500',
  cyan: 'bg-cyan-500',
};

const sizeClasses: Record<ProgressSize, string> = {
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-2.5',
};

/**
 * The one progress bar. The track is a neutral overlay, so it reads on any surface in both
 * themes. Each time a view opens, the fill grows from 0 when it comes into view; afterwards
 * value changes glide.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  tone = 'brand',
  size = 'md',
  fillStyle,
  live = false,
  marker,
  className,
}: ProgressBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const intro = useIntroMotion() && !live;
  const seen = useSeen(ref, intro);
  const safeMax = max > 0 ? max : 1;
  const toPercent = (n: number) => Math.min(100, Math.max(0, (n / safeMax) * 100));
  const percent = toPercent(value);

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, Math.round(value)))}
      className={cx('relative w-full overflow-hidden rounded-full bg-overlay-default', sizeClasses[size], className)}
    >
      <div
        className={cx(
          'progress-fill h-full rounded-full',
          live ? 'transition-[width] duration-1000 ease-linear' : 'transition-[width] duration-slow ease-emphasized',
          !fillStyle && toneClasses[tone]
        )}
        style={{ ...fillStyle, width: `${seen ? percent : 0}%` }}
      />
      {marker && (
        <div
          className="absolute inset-y-0 w-0.5 bg-warning-text opacity-70"
          style={{ left: `${toPercent(marker.at)}%` }}
          title={marker.label}
        />
      )}
    </div>
  );
}
