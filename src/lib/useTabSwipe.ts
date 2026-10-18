import { RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { nearScreenEdge, SLOP_PX, startsInsideOwnGesture } from '@/lib/gestures';
import { hapticSuccess } from '@/lib/haptics';
import { prefersReducedMotion } from '@/lib/motion';

export type SwipeDirection = 'next' | 'prev';

/** What a swipe past the first ('prev') or last ('next') item does instead of bouncing. */
export interface SwipeEdge {
  /** Read when the drag starts moving: true makes the edge drag and commit like a change. */
  has: (direction: SwipeDirection) => boolean;
  go: (direction: SwipeDirection) => void;
}

interface TabSwipeOptions {
  /** Item ids in strip order. */
  ids: string[];
  value: string;
  /** The same handler a tap on the strip calls, so every page rule (unsaved-changes guard, filter
   *  resets, navigation) runs for a swipe too. */
  onChange: (id: string) => void;
  /** id of the strip: no swipe while it is hidden (e.g. Settings from sm up, the page strip from lg). */
  stripId: string;
  /** Replaces the strip check above for a swipe that has no strip of its own on every screen
   *  (the page area: Dashboard has no page strip). */
  isActive?: () => boolean;
  /** The element touches are read from, when larger than the panel that moves (the page area
   *  listens on all of <main>, so empty space under short content swipes too). Default: the panel. */
  listenRef?: RefObject<HTMLElement>;
  /** Past the first/last item. Without it the panel bounces and nothing changes. */
  edge?: SwipeEdge;
  /** Read once on mount: open on the first or last item (entered by a swipe from a neighbour). */
  entry?: () => 'first' | 'last' | null;
  /** Slide the panel in on changes made elsewhere too (a tap). Default true; false = swipes only. */
  animateTaps?: boolean;
}

// Stricter than SwipeRow's 1.2: a panel covers most of the screen, so a slightly diagonal scroll
// must stay a scroll.
const HORIZONTAL_BIAS = 1.7;
const commitDistance = (width: number) => Math.min(width * 0.25, 96);
const FLICK_SPEED = 0.45; // px per ms
const FLICK_MIN_PX = 32;
const FLICK_WINDOW_MS = 80;
// A finger that rests this long before moving is selecting text or long-pressing.
const LONG_PRESS_MS = 500;
// While dragging the panel follows the finger at this rate and fades a little.
const FOLLOW_RATE = 0.5;
const FADE = 0.3;
// With nowhere to go it resists and tops out here, then springs back.
const RUBBER_MAX_PX = 48;
const SETTLE = 'translate 320ms var(--ease-emphasized), opacity 320ms var(--ease-emphasized)';
// The new panel comes in from the side it was swiped from (mirrors --ease-emphasized).
const ENTER_OFFSET_PX = 24;
const ENTER_MS = 220;
const ENTER_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
// Gap kept between the sticky header and the strip when a swipe scrolls back up to it.
const STRIP_GAP_PX = 8;

interface Gesture {
  x: number;
  y: number;
  start: number;
  width: number;
  axis: 'x' | 'y' | null;
  samples: { x: number; t: number }[];
  armed: boolean;
  dx: number;
}

function stripVisible(strip: HTMLElement | null): strip is HTMLElement {
  return !!strip && strip.getClientRects().length > 0;
}

/** After a swipe deep in a long panel, bring the strip back under the header so the new tab
 *  opens at its top. Nothing happens while the strip is on screen. */
function revealStrip(strip: HTMLElement): void {
  const header = document.querySelector<HTMLElement>('.app-header');
  const visibleTop = header?.offsetHeight ?? 0;
  const top = strip.getBoundingClientRect().top - visibleTop - STRIP_GAP_PX;
  if (top >= 0) return;
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'instant' : 'smooth';
  // Below lg the window scrolls; from lg up <main> does (AppShell).
  const main = strip.closest<HTMLElement>('[data-page-area]');
  if (main && getComputedStyle(main).overflowY !== 'visible') main.scrollBy({ top, behavior });
  else window.scrollBy({ top, behavior });
}

/** The new content slides in from the side it lies on: step 1 from the right, -1 from the left.
 *  Off with reduced motion. Web Animations, so it restarts on every change without a remount. */
export function slideIn(el: HTMLElement, step: number): void {
  if (!step || prefersReducedMotion() || typeof el.animate !== 'function') return;
  el.animate(
    [
      { translate: `${step * ENTER_OFFSET_PX}px 0`, opacity: 0 },
      { translate: '0 0', opacity: 1 },
    ],
    { duration: ENTER_MS, easing: ENTER_EASE }
  );
}

/**
 * Swipe a panel sideways to reach the next (finger moves left) or previous item of its strip, on
 * touch screens only. Native listeners on the panel itself: React's synthetic events would also
 * deliver touches from dialogs portalled out of it. Mouse and trackpad get nothing. Starts are
 * ignored at the screen edges (system back), with two fingers or zoomed in, on text fields,
 * sliders, charts and other own-gesture controls (lib/gestures), inside a nested swipe panel
 * (the innermost owns it) and with text selected. No loop: past the ends the panel bounces unless
 * `edge` takes the swipe. The panel slides in on every change, off with reduced motion.
 */
export function useTabSwipe(
  panelRef: RefObject<HTMLElement>,
  { ids, value, onChange, stripId, isActive, listenRef, edge, entry, animateTaps = true }: TabSwipeOptions
): void {
  const latest = useRef({ ids, value, onChange, stripId, isActive, edge, entry });
  latest.current = { ids, value, onChange, stripId, isActive, edge, entry };
  const shownValue = useRef(value);
  // Set by a committed swipe: its change scrolls back to the strip and slides in.
  const swiped = useRef(false);
  const skipEnter = useRef(false);

  useEffect(() => {
    const panel = panelRef.current;
    const surface = listenRef?.current ?? panel;
    if (!panel || !surface) return;
    let gesture: Gesture | null = null;
    let frame = 0;
    // A drag ending on a button must not also press it.
    let suppressClickUntil = 0;

    const neighbour = (direction: SwipeDirection) => {
      const { ids: list, value: current } = latest.current;
      const index = list.indexOf(current);
      return index === -1 ? undefined : list[index + (direction === 'next' ? 1 : -1)];
    };
    const canGo = (direction: SwipeDirection) =>
      neighbour(direction) !== undefined || !!latest.current.edge?.has(direction);

    const paint = (offset: number, opacity: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        panel.style.translate = offset ? `${offset}px 0` : '';
        panel.style.opacity = opacity < 1 ? String(opacity) : '';
      });
    };

    const settle = () => {
      cancelAnimationFrame(frame);
      panel.style.willChange = '';
      if (!panel.style.translate && !panel.style.opacity) return;
      panel.style.transition = SETTLE;
      panel.style.translate = '';
      panel.style.opacity = '';
      panel.addEventListener('transitionend', () => (panel.style.transition = ''), { once: true });
    };

    const cancel = () => {
      if (gesture?.axis === 'x') settle();
      gesture = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (gesture) return cancel(); // a second finger
      const touch = e.touches[0];
      const target = e.target;
      if (e.touches.length !== 1 || !touch || !(target instanceof Element)) return;
      const { ids: list, edge: ends, stripId: strip, isActive: active } = latest.current;
      if ((list.length < 2 && !ends) || !window.matchMedia('(pointer: coarse)').matches) return;
      if (active ? !active() : !stripVisible(document.getElementById(strip))) return;
      if (nearScreenEdge(touch.clientX) || (window.visualViewport?.scale ?? 1) > 1.01) return;
      if (startsInsideOwnGesture(target, surface) || window.getSelection()?.toString()) return;
      swiped.current = false;
      gesture = {
        x: touch.clientX,
        y: touch.clientY,
        start: e.timeStamp,
        width: panel.getBoundingClientRect().width,
        axis: null,
        samples: [{ x: touch.clientX, t: e.timeStamp }],
        armed: false,
        dx: 0,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gesture;
      const touch = e.touches[0];
      if (!g || !touch) return;
      if (e.touches.length !== 1) return cancel();
      const dx = touch.clientX - g.x;
      const dy = touch.clientY - g.y;
      if (g.axis === null) {
        if (Math.hypot(dx, dy) < SLOP_PX) return;
        if (e.timeStamp - g.start > LONG_PRESS_MS || Math.abs(dx) <= Math.abs(dy) * HORIZONTAL_BIAS) {
          gesture = null;
          return;
        }
        g.axis = 'x';
        if (!prefersReducedMotion()) panel.style.willChange = 'translate, opacity';
      }
      g.dx = dx;
      g.samples.push({ x: touch.clientX, t: e.timeStamp });
      while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > FLICK_WINDOW_MS) g.samples.shift();

      const limit = commitDistance(g.width);
      const open = canGo(dx < 0 ? 'next' : 'prev');
      const armed = open && Math.abs(dx) >= limit;
      if (armed && !g.armed) hapticSuccess();
      g.armed = armed;
      if (prefersReducedMotion()) return;
      if (open) {
        paint(dx * FOLLOW_RATE, 1 - Math.min(1, Math.abs(dx) / limit) * FADE);
      } else {
        const pull = Math.abs(dx) * FOLLOW_RATE;
        paint(Math.sign(dx) * RUBBER_MAX_PX * (pull / (pull + RUBBER_MAX_PX)), 1);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const g = gesture;
      if (!g || e.touches.length > 0) return;
      gesture = null;
      if (g.axis !== 'x') return;
      suppressClickUntil = e.timeStamp + 400;
      const first = g.samples[0];
      const last = g.samples[g.samples.length - 1];
      const speed = first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
      const flick = Math.abs(speed) >= FLICK_SPEED && Math.sign(speed) === Math.sign(g.dx) && Math.abs(g.dx) >= FLICK_MIN_PX;
      const direction: SwipeDirection = g.dx < 0 ? 'next' : 'prev';
      settle();
      if (!(g.armed || flick) || !canGo(direction)) return;
      if (flick && !g.armed) hapticSuccess();
      const target = neighbour(direction);
      if (target === undefined) return latest.current.edge?.go(direction);
      swiped.current = true;
      latest.current.onChange(target);
    };

    const onClickCapture = (e: MouseEvent) => {
      if (e.timeStamp > suppressClickUntil) return;
      e.stopPropagation();
      e.preventDefault();
    };

    const passive = { passive: true } as const;
    surface.addEventListener('touchstart', onTouchStart, passive);
    surface.addEventListener('touchmove', onTouchMove, passive);
    surface.addEventListener('touchend', onTouchEnd, passive);
    surface.addEventListener('touchcancel', cancel, passive);
    surface.addEventListener('click', onClickCapture, true);
    // Rotation or the keyboard opening mid-drag.
    window.addEventListener('resize', cancel, passive);
    return () => {
      cancelAnimationFrame(frame);
      surface.removeEventListener('touchstart', onTouchStart);
      surface.removeEventListener('touchmove', onTouchMove);
      surface.removeEventListener('touchend', onTouchEnd);
      surface.removeEventListener('touchcancel', cancel);
      surface.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('resize', cancel);
    };
  }, [panelRef, listenRef]);

  // Entered by a swipe from a neighbour: open on the near end, without a second slide.
  useLayoutEffect(() => {
    const { ids: list, value: current, onChange: change, entry: take } = latest.current;
    const end = take?.();
    const target = end === 'first' ? list[0] : end === 'last' ? list[list.length - 1] : undefined;
    if (target === undefined || target === current) return;
    skipEnter.current = true;
    change(target);
  }, []);

  // A change, swiped or tapped: the new panel slides in from the side it lies on.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const previous = shownValue.current;
    shownValue.current = value;
    const wasSwiped = swiped.current;
    swiped.current = false;
    if (!panel || previous === value) return;
    if (skipEnter.current) {
      skipEnter.current = false;
      return;
    }
    const { ids: list, stripId: strip } = latest.current;
    const step = Math.sign(list.indexOf(value) - list.indexOf(previous));
    const stripEl = document.getElementById(strip);
    if (wasSwiped && stripVisible(stripEl)) revealStrip(stripEl);
    panel.style.transition = '';
    panel.style.translate = '';
    panel.style.opacity = '';
    panel.style.willChange = '';
    if (wasSwiped || animateTaps) slideIn(panel, step);
  }, [value, panelRef, animateTaps]);
}
