import { memo, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { NavGroup } from './navConfig';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import type { View } from '@/lib/views';
import type { NavStatuses } from '@/lib/navStatus';
import { prefersReducedMotion } from '@/lib/motion';
import { pageLinkProps } from '@/lib/pageLink';

/** Slide-down time when the sheet closes (matches .zone-sheet-closing). */
const CLOSE_MS = 260;
/** A drag counts once it moves this far; it then never becomes a tap on a row. */
const DRAG_SLOP = 6;
/** Released past this share of its height, or flicked down faster than this (px/ms), it closes. */
const CLOSE_DISTANCE = 0.3;
const CLOSE_VELOCITY = 0.5;

interface ZoneSheetProps {
  open: boolean;
  group: NavGroup | undefined;
  currentView: View;
  statuses: NavStatuses;
  partnerBadge: number;
  onNavigate: (view: View) => void;
  onClose: () => void;
}

/**
 * Phone: the current zone's pages as large rows with today's status, rising from the zone bar.
 * Like an iOS sheet: the page behind is blurred and cannot scroll, and the sheet follows a downward
 * drag and closes when pulled far or flicked.
 */
export const ZoneSheet = memo(function ZoneSheet({ open, group, currentView, statuses, partnerBadge, onNavigate, onClose }: ZoneSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(1);
  const drag = useRef<{ id: number; startY: number; lastY: number; lastT: number; velocity: number; moved: boolean } | null>(null);

  const requestClose = useCallback(() => {
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
  }, [onClose]);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => {
      setClosing(false);
      setDragY(0);
      onClose();
    }, CLOSE_MS);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.querySelector<HTMLElement>('[aria-current="page"], a, button')?.focus({ preventScroll: true });
    // Scroll lock: the window is the scroller on phones. overflow on <html> (not a fixed body) keeps
    // the page where it is, so nothing has to be scrolled back afterwards.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      root.style.overflow = previousOverflow;
      previous?.focus({ preventScroll: true });
    };
  }, [open, requestClose]);

  if (!open || !group) return null;

  const go = (view: View) => {
    onNavigate(view);
    requestClose();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (closing || event.button !== 0) return;
    drag.current = { id: event.pointerId, startY: event.clientY, lastY: event.clientY, lastT: event.timeStamp, velocity: 0, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dy = event.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < DRAG_SLOP) return;
      d.moved = true;
      setDragging(true);
      setSheetHeight(event.currentTarget.offsetHeight || 1);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const dt = event.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (event.clientY - d.lastY) / dt;
    d.lastY = event.clientY;
    d.lastT = event.timeStamp;
    // Down follows the finger; up resists (rubber band), as the sheet is already fully open.
    setDragY(dy > 0 ? dy : dy * 0.15);
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    setDragging(false);
    if (event.type === 'pointerup' && (dragY > sheetHeight * CLOSE_DISTANCE || d.velocity > CLOSE_VELOCITY)) requestClose();
    else setDragY(0);
  };
  // A drag must not end as a tap on the row it started on.
  const onClickCapture = (event: ReactMouseEvent) => {
    if (dragging || dragY !== 0) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  const backdropOpacity = closing ? 0 : Math.max(0, 1 - Math.max(0, dragY) / sheetHeight);

  return createPortal(
    <div className="lg:hidden fixed inset-0 z-modal">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={requestClose}
        style={{ opacity: backdropOpacity }}
        className={cx('zone-sheet-backdrop absolute inset-0 touch-none', !dragging && 'transition-opacity duration-base')}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${group.label} pages`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture}
        style={{ transform: `translateY(${dragY}px)` }}
        className={cx(
          'zone-sheet absolute inset-x-0 bottom-0 max-h-[88dvh] touch-none select-none overflow-y-auto overscroll-contain rounded-t-2xl border-t border-overlay-default bg-bg-800 px-4 pt-3 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))]',
          closing && 'zone-sheet-closing',
          !dragging && !closing && 'zone-sheet-settle'
        )}
      >
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-overlay-strong" />
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="text-xl font-semibold leading-tight text-content-primary">{group.label}</h2>
          <span className="text-xs text-content-muted tabular-nums">{group.items.length} pages</span>
        </div>


        <ul className="zone-sheet-rows space-y-1">
          {group.items.map((item) => {
            const active = item.id === currentView;
            const status = statuses[item.id];
            const badge = item.id === 'partner' ? partnerBadge : 0;
            return (
              <li key={item.id}>
                <a
                  {...pageLinkProps(item.id, go)}
                  draggable={false}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left',
                    active ? 'bg-primary-500/10' : 'active:bg-overlay-subtle',
                    FOCUS_RING
                  )}
                >
                  <span
                    className={cx(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                      active ? 'border-primary-500/40 text-brand-text' : 'border-overlay-subtle text-content-muted'
                    )}
                  >
                    <item.icon size={18} aria-hidden="true" />
                  </span>
                  <span className={cx('min-w-0 flex-1 truncate text-base', active ? 'font-semibold text-content-primary' : 'font-medium text-content-secondary')}>
                    {item.label}
                    {status && <span className="sr-only">, {status.label}</span>}
                  </span>
                  {status?.meta && (
                    <span
                      aria-hidden="true"
                      className={cx(
                        'text-xs tabular-nums',
                        status.tone === 'risk' ? 'text-warning-text' : status.tone === 'done' ? 'text-brand-text' : 'text-content-muted'
                      )}
                    >
                      {status.meta}
                    </span>
                  )}
                  {badge > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-micro font-bold text-white">{badge}</span>
                  )}
                  {status && (
                    <span
                      aria-hidden="true"
                      className={cx(
                        'h-2 w-2 shrink-0 rounded-full',
                        status.tone === 'done' && 'bg-brand-text',
                        status.tone === 'risk' && 'bg-warning',
                        status.tone === 'pending' && 'border border-content-muted'
                      )}
                    />
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body
  );
});
