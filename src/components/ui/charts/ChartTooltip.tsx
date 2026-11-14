import { ReactNode } from 'react';
import { cx } from '../primitives/shared';

interface ChartTooltipProps {
  /** Horizontal anchor as a 0..100 percentage of the chart's width. */
  x: number;
  children: ReactNode;
  className?: string;
}

/** Small bubble above a chart point. Edges are clamped so it never spills out of the chart. */
export function ChartTooltip({ x, children, className }: ChartTooltipProps) {
  const shift = x < 15 ? '0%' : x > 85 ? '-100%' : '-50%';
  return (
    <div
      role="presentation"
      className={cx(
        'pointer-events-none absolute bottom-full mb-2 z-10 whitespace-nowrap rounded-lg border border-overlay-default bg-bg-800/95 px-2 py-1 text-micro font-medium tabular-nums text-content-primary shadow-lg backdrop-blur-md motion-safe:animate-enter-fade',
        className
      )}
      style={{ left: `${x}%`, transform: `translateX(${shift})` }}
    >
      {children}
    </div>
  );
}
