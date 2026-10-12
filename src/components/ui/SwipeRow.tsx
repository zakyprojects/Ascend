import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { hapticSuccess } from '@/lib/haptics';
import { cx } from './primitives/shared';

export interface SwipeAction {
  label: string;
  icon: LucideIcon;
  /** Underlay colour classes (background + text). */
  tone: string;
  onCommit: () => void;
  /** Shown but not committable (e.g. a habit tracked by another module). */
  disabled?: boolean;
}

export interface SwipeRowProps {
  /** Revealed when the row is dragged to the right. */
  right?: SwipeAction;
  /** Revealed when the row is dragged to the left. */
  left?: SwipeAction;
  children: React.ReactNode;
  className?: string;
}

// Movement before the gesture picks an axis; a mostly vertical start is left to the page scroll.
const SLOP_PX = 10;
const HORIZONTAL_BIAS = 1.2;
// Touches starting this close to a screen edge belong to the system back gesture.
const EDGE_PX = 24;
// Commit distance: a third of the row, capped so wide rows don't need a long drag.
const commitDistance = (width: number) => Math.min(width * 0.34, 120);
// Past the commit point the row follows the finger at this rate (rubber band).
const OVERDRAG_RATE = 0.35;

/**
 * iOS-style swipe for a list row on touch screens: drag right or left to reveal an action, release
 * past the mark to run it (a buzz marks the point), release before it to cancel; the row springs
 * back either way. Touch and pen only: every action also has a visible button on the row, so mouse,
 * keyboard and screen-reader users keep their own path. Vertical drags scroll the page as usual.
 */
export function SwipeRow({ right, left, children, className }: SwipeRowProps) {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  // Set once a drag claims the gesture; swallows the click the browser fires on release.
  const suppressClick = React.useRef(false);
  const gesture = React.useRef<{
    id: number;
    x: number;
    y: number;
    axis: 'x' | 'y' | null;
    width: number;
    armed: boolean;
  } | null>(null);

  const actionFor = (dx: number) => (dx > 0 ? right : dx < 0 ? left : undefined);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || (!right && !left)) return;
    if (e.clientX < EDGE_PX || e.clientX > window.innerWidth - EDGE_PX) return;
    const width = rowRef.current?.offsetWidth ?? 0;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, width, armed: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.axis === null) {
      if (Math.hypot(dx, dy) < SLOP_PX) return;
      g.axis = Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS ? 'x' : 'y';
      if (g.axis === 'y') {
        gesture.current = null;
        return;
      }
      rowRef.current?.setPointerCapture(e.pointerId);
      suppressClick.current = true;
      setDragging(true);
    }
    const action = actionFor(dx);
    if (!action) {
      setOffset(0);
      return;
    }
    const limit = commitDistance(g.width);
    const abs = Math.abs(dx);
    const shown = abs <= limit ? abs : limit + (abs - limit) * OVERDRAG_RATE;
    const armed = abs >= limit && !action.disabled;
    if (armed && !g.armed) hapticSuccess();
    g.armed = armed;
    setOffset(Math.sign(dx) * (action.disabled ? Math.min(shown, limit * 0.5) : shown));
  };

  const finish = (e: React.PointerEvent, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.axis !== 'x') return;
    const action = actionFor(offset);
    setDragging(false);
    setOffset(0);
    window.setTimeout(() => (suppressClick.current = false), 0);
    if (!cancelled && g.armed && action) action.onCommit();
  };

  // A drag that moved the row must not also click the button under the finger.
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const active = actionFor(offset);
  const limit = commitDistance(gesture.current?.width ?? rowRef.current?.offsetWidth ?? 0);
  const armed = !!active && !active.disabled && Math.abs(offset) >= limit - 0.5;
  const Icon = active?.icon;

  return (
    <div className={cx('relative', className)}>
      {active && Icon && (
        <div
          aria-hidden="true"
          className={cx(
            'absolute inset-0 rounded-2xl flex items-center px-6 gap-2 text-sm font-semibold',
            offset > 0 ? 'justify-start' : 'justify-end',
            active.disabled ? 'bg-bg-700 text-content-muted' : active.tone
          )}
        >
          <Icon size={20} className={cx('swipe-row-icon', armed && 'is-armed')} />
          <span>{active.label}</span>
        </div>
      )}
      <div
        ref={rowRef}
        className={cx('swipe-row-surface', !dragging && 'is-settling')}
        style={offset ? { translate: `${offset}px 0` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
