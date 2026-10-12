import React from 'react';
import { useActiveBox } from '@/lib/useActiveBox';
import { cx } from './shared';

export interface SlidingPillProps {
  /** The group's option buttons carry `data-pill-id`; this is the active one's id. */
  active: string;
  /** The active look (background, border, ring), which may differ per option. */
  className: string;
  /** Re-measure when the options' contents change (labels, counts). */
  contentKey?: string;
  /** 'fill' covers the option; 'underline' is a 2px bar along its bottom edge. */
  variant?: 'fill' | 'underline';
}

const UNDERLINE_PX = 2;

/**
 * The active-option background for a hand-built tab or filter row: one element that glides to the
 * selected option (like the sidebar's pill) instead of each button switching its own background.
 * Place it as the first child of the row, which must be `relative isolate`; the options keep only
 * their active text colour. Works with wrapping rows (it moves on both axes).
 */
export const SlidingPill: React.FC<SlidingPillProps> = ({ active, className, contentKey, variant = 'fill' }) => {
  const ref = React.useRef<HTMLSpanElement>(null);
  const groupRef = React.useRef<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    groupRef.current = ref.current?.parentElement ?? null;
  });
  const box = useActiveBox(
    groupRef,
    (group) => group.querySelector<HTMLElement>(`[data-pill-id="${CSS.escape(active)}"]`),
    active,
    contentKey
  );

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cx(
        'absolute -z-10 pointer-events-none',
        variant === 'fill' && 'border border-transparent',
        box ? 'opacity-100' : 'opacity-0',
        box?.animate && 'sliding-pill-move',
        className
      )}
      style={
        box
          ? variant === 'underline'
            ? { left: box.left, top: box.top + box.height - UNDERLINE_PX, width: box.width, height: UNDERLINE_PX }
            : { left: box.left, top: box.top, width: box.width, height: box.height }
          : undefined
      }
    />
  );
};
