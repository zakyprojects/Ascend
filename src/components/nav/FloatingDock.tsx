import { useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cx } from '@/components/ui/primitives/shared';
import { SLOP_PX } from '@/lib/gestures';
import { prefersReducedMotion } from '@/lib/motion';
import { getFeedbackPrefs, vibrate } from '@/lib/actionFeedback';
import { PILL_DESKTOP_QUERY, setBlockPillPosition, useBlockPillPrefs, type PillLayout, type PillSide } from '@/lib/timeTracker/blockPill';

/** Gap between the dock and the page content it keeps clear (`--dock-clear`). */
const CLEAR_GAP_PX = 8;
const SNAP_MS = 220;
/** Fields that bring up the phone keyboard; the dock steps aside while one has focus. */
const TEXT_FIELD =
  'textarea, select, [contenteditable=""], [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]):not([type="file"]):not([type="color"])';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

let insetProbe: HTMLDivElement | null = null;

/** The safe-area insets in px (env() is only readable through a styled element). */
function safeInsets(): { top: number; bottom: number } {
  if (!insetProbe) {
    insetProbe = document.createElement('div');
    insetProbe.setAttribute('aria-hidden', 'true');
    insetProbe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(insetProbe);
  }
  const style = getComputedStyle(insetProbe);
  return { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
}

/**
 * Where the dock's bottom edge may rest, px from the viewport bottom. The lowest is its default
 * spot (phone: above the zone bar; desktop: 1.5rem); the highest keeps it below the phone header
 * (even when it slides back in) or 1.5rem from the desktop top.
 */
function bottomBounds(layout: PillLayout, height: number): { min: number; max: number } {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const safe = safeInsets();
  const min = layout === 'phone' ? 5.25 * rem + safe.bottom : 1.5 * rem;
  const top = layout === 'phone' ? safe.top + 4.5 * rem : 1.5 * rem;
  return { min, max: Math.max(min, window.innerHeight - top - height) };
}

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value));

/** True while a text field has focus on a touch screen (the keyboard is up). */
function useTypingOnTouch(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    let timer = 0;
    const check = () => {
      window.clearTimeout(timer);
      // focusout fires before the next element takes focus: read it once focus has moved.
      timer = window.setTimeout(() => {
        const el = document.activeElement;
        setTyping(window.matchMedia('(pointer: coarse)').matches && el instanceof Element && el.matches(TEXT_FIELD));
      }, 0);
    };
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
    };
  }, []);
  return typing;
}

interface DragStart {
  pointerId: number;
  x: number;
  y: number;
  rect: DOMRect;
  dragging: boolean;
}

/**
 * One fixed column for the floating pills (a running focus timer above the current block pill),
 * so they never overlap and move together. Drag it anywhere; on release it snaps to the nearer
 * side, inside bounds that keep it off the phone nav bar and header. The spot is saved per device
 * and per layout (phone/desktop); Settings › Appearance resets it. Publishes `--dock-clear` so the
 * page's bottom padding can scroll content out from under it.
 */
export function FloatingDock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const desktop = useMediaQuery(PILL_DESKTOP_QUERY);
  const layout: PillLayout = desktop ? 'desktop' : 'phone';
  const saved = useBlockPillPrefs().pos[layout];
  const side: PillSide = saved?.side ?? 'right';
  const typing = useTypingOnTouch();
  const [height, setHeight] = useState(0);
  const [mainLeft, setMainLeft] = useState(0);
  const [, relayout] = useReducer((n: number) => n + 1, 0);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const start = useRef<DragStart | null>(null);
  const swallowClick = useRef(false);
  const snapFrom = useRef<DOMRect | null>(null);

  // Its own height (the pills inside come and go) and the page's left edge (desktop sidebar width).
  useEffect(() => {
    const el = ref.current;
    const main = document.getElementById('main-content');
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setHeight(el.offsetHeight);
      if (main) setMainLeft(main.getBoundingClientRect().left);
    });
    observer.observe(el);
    if (main) observer.observe(main);
    // Re-clamps a saved spot to the new viewport, without saving the clamped value (rotating back restores it).
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', relayout);
    window.visualViewport?.addEventListener('resize', relayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', relayout);
      window.removeEventListener('orientationchange', relayout);
      window.visualViewport?.removeEventListener('resize', relayout);
    };
  }, []);

  const bounds = bottomBounds(layout, height);
  const bottom = saved ? clamp(saved.bottom, bounds) : bounds.min;
  const atDefaultBottom = bottom <= bounds.min + 1;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--dock-clear', height > 0 && atDefaultBottom ? `${Math.ceil(bottom + height + CLEAR_GAP_PX)}px` : '0px');
  }, [height, atDefaultBottom, bottom]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty('--dock-clear');
    },
    []
  );

  // Snap glide: from where the finger left it to its resting place.
  useLayoutEffect(() => {
    const el = ref.current;
    const from = snapFrom.current;
    if (!el || !from || drag) return;
    snapFrom.current = null;
    if (prefersReducedMotion()) return;
    const to = el.getBoundingClientRect();
    el.style.transition = 'none';
    el.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
    void el.offsetWidth;
    el.style.transition = `transform ${SNAP_MS}ms var(--ease-emphasized)`;
    el.style.transform = '';
    const done = () => {
      el.style.transition = '';
      el.removeEventListener('transitionend', done);
    };
    el.addEventListener('transitionend', done);
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swallowClick.current = false;
    const el = ref.current;
    if (event.button !== 0 || !el || start.current) return;
    if ((event.target as Element).closest('[data-dock-nodrag]')) return;
    const s: DragStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect: el.getBoundingClientRect(), dragging: false };
    start.current = s;

    // On the window: a mouse leaves the dock before the drag captures it.
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.dragging) {
        if (Math.hypot(dx, dy) <= SLOP_PX) return;
        s.dragging = true;
        // Captured only once it is a drag, so a tap still clicks the button under the finger.
        el.setPointerCapture(e.pointerId);
      }
      setDrag({ dx, dy });
    };
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      start.current = null;
      if (!s.dragging) return;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      swallowClick.current = true;
      if (e.type === 'pointercancel') {
        setDrag(null);
        return;
      }
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const centerX = s.rect.left + dx + s.rect.width / 2;
      snapFrom.current = el.getBoundingClientRect();
      setDrag(null);
      setBlockPillPosition(layout, {
        side: centerX < window.innerWidth / 2 ? 'left' : 'right',
        bottom: Math.round(clamp(window.innerHeight - (s.rect.bottom + dy), bottomBounds(layout, s.rect.height))),
      });
      const prefs = getFeedbackPrefs();
      if (prefs.swipe === 'vibration') vibrate(prefs.vibrationStrength);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  return (
    <div
      ref={ref}
      // Names its own view-transition layer during page changes, above the page (index.css).
      data-floating-dock=""
      data-no-swipe=""
      data-no-press=""
      onPointerDown={onPointerDown}
      // A drag ends with a click on whatever it was dropped on: never open or hide from a drop.
      onClickCapture={(event) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      className={cx(
        'fixed z-30 flex touch-none select-none flex-col gap-2',
        'bottom-[calc(5.25rem_+_env(safe-area-inset-bottom))] lg:bottom-6',
        side === 'right' ? 'items-end right-[calc(1rem_+_env(safe-area-inset-right))] lg:right-6' : 'items-start left-[calc(1rem_+_env(safe-area-inset-left))]',
        drag && 'cursor-grabbing',
        typing && 'invisible'
      )}
      style={{
        ...(saved ? { bottom } : null),
        ...(side === 'left' && desktop ? { left: mainLeft + 24 } : null),
        ...(drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : null),
      }}
    >
      {children}
    </div>
  );
}
