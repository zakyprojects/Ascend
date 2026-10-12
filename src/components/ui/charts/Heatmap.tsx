import { PointerEvent, useRef } from 'react';
import { useIntroMotion, useSeen } from '@/lib/motion';
import { cx } from '../primitives/shared';
import { ChartTooltip } from './ChartTooltip';
import { ChartTone, toneText, useChartHover } from './chartShared';

export interface HeatmapCell {
  /** Tooltip text, e.g. "Mon, Oct 12: 3 habits". */
  label: string;
  value: number;
}

export interface HeatmapProps {
  /**
   * Days in order, oldest first, already aligned so index 0 is the first row of the first
   * column (pad the start with `null` to line weekdays up). Seven rows per column.
   */
  cells: (HeatmapCell | null)[];
  /** Accessible summary, e.g. "Habit activity, last 12 weeks: 54 active days". */
  label: string;
  tone?: ChartTone;
  /** Value that counts as full strength; higher values cap there. Defaults to the busiest day. */
  max?: number;
  className?: string;
}

const ROWS = 7;
// Opacity per level: none, then four steps up to full tone.
const LEVEL_OPACITY = [0, 0.28, 0.5, 0.75, 1];
const COLUMN_STAGGER_MS = 18;

function levelOf(value: number, max: number): number {
  if (value <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));
}

/**
 * Calendar heatmap (weeks as columns, days as rows), sized to its container's width. On a
 * view's first visit the columns fade in left to right when it comes into view.
 */
export function Heatmap({ cells, label, tone = 'brand', max, className }: HeatmapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const intro = useIntroMotion();
  const seen = useSeen(ref, intro);
  const { active, setActive, clear } = useChartHover();
  const columns = Math.max(1, Math.ceil(cells.length / ROWS));
  const top = max ?? Math.max(1, ...cells.map((c) => c?.value ?? 0));

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const index = Number((event.target as HTMLElement).dataset.index);
    if (Number.isInteger(index) && cells[index]) setActive(index);
    else clear();
  };

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={cx('relative w-full', toneText[tone], className)}
      onPointerMove={onPointer}
      onPointerDown={onPointer}
      onPointerLeave={clear}
    >
      <div
        className="grid grid-flow-col gap-[3px]"
        style={{ gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {cells.map((cell, i) => {
          const column = Math.floor(i / ROWS);
          const level = cell ? levelOf(cell.value, top) : 0;
          return (
            <span
              key={i}
              data-index={i}
              aria-hidden="true"
              className={cx(
                'relative aspect-square rounded-[3px] transition-opacity duration-slow motion-reduce:transition-none',
                !cell && 'invisible',
                active === i && 'ring-1 ring-content-primary'
              )}
              style={{
                opacity: seen ? 1 : 0,
                transitionDelay: seen && intro ? `${column * COLUMN_STAGGER_MS}ms` : undefined,
              }}
            >
              <span className="absolute inset-0 rounded-[3px] bg-overlay-default" />
              {level > 0 && (
                <span className="absolute inset-0 rounded-[3px] bg-current" style={{ opacity: LEVEL_OPACITY[level] }} />
              )}
            </span>
          );
        })}
      </div>
      {active !== null && cells[active] && (
        <ChartTooltip x={((Math.floor(active / ROWS) + 0.5) / columns) * 100}>{cells[active]!.label}</ChartTooltip>
      )}
    </div>
  );
}
