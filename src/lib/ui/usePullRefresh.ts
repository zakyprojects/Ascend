import { RefObject, useEffect, useRef, useState } from 'react';
import { nearScreenEdge, startsInsideOwnPull } from '@/lib/ui/gestures';
import { canVibrate, getFeedbackPrefs } from '@/lib/ui/actionFeedback';
import { prefersReducedMotion } from '@/lib/ui/motion';
import { createPull, pullMayStart, PULL_THRESHOLD_PX, settleRefresh } from '@/lib/ui/pullRefresh';

export type PullPhase = 'idle' | 'pulling' | 'refreshing';

interface PullRefreshOptions {
  /** Read on every touch: false = no pull (signed out). */
  isActive: () => boolean;
  /** The page's scroll position: the window on phones, <main> in the wide layout. */
  scrollTop: () => number;
  /** The refresh itself; the loader stays until it settles (600 ms to 10 s). */
  onRefresh: () => Promise<void>;
}

/** Indicator size; it waits this far above its spot and slides down with the pull. */
export const PULL_INDICATOR_PX = 32;
const SETTLE = 'translate 320ms var(--ease-emphasized), opacity 320ms var(--ease-emphasized)';
const SETTLE_MS = 320;
// Light buzz at the threshold (actionFeedback's 'light'); none when swipe feedback is off.
const ARMED_VIBRATION_MS = 8;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Pull down at the top of the page to refresh, on touch screens (phones, tablets, the installed
 * app); mouse and trackpad get nothing. Native passive listeners on `listenRef` like useTabSwipe,
 * so portalled dialogs, sheets and the notification list never start one, and the page never
 * scrolls less smoothly. No pull with two fingers, zoomed in, from the screen edges, with text
 * selected, while a dialog or sheet locks the page, or on anything with its own drag or scroll
 * (lib/gestures startsInsideOwnPull). A sideways start belongs to the tab/page swipe. The
 * indicator follows the finger, a light buzz marks the threshold, and letting go past it refreshes.
 * Reduced motion: no follow, the indicator just appears at the threshold.
 */
export function usePullRefresh(
  listenRef: RefObject<HTMLElement>,
  indicatorRef: RefObject<HTMLElement>,
  { isActive, scrollTop, onRefresh }: PullRefreshOptions
): PullPhase {
  const latest = useRef({ isActive, scrollTop, onRefresh });
  latest.current = { isActive, scrollTop, onRefresh };
  const [phase, setPhase] = useState<PullPhase>('idle');

  useEffect(() => {
    const surface = listenRef.current;
    if (!surface) return;
    let pull: ReturnType<typeof createPull> | null = null;
    let busy = false;
    let frame = 0;
    let hideTimer = 0;
    let suppressClickUntil = 0;
    let unmounted = false;

    const paint = (offset: number, transition = '') => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = indicatorRef.current;
        if (!el) return;
        const shown = prefersReducedMotion() ? (offset >= PULL_THRESHOLD_PX ? PULL_THRESHOLD_PX : 0) : offset;
        el.style.transition = transition;
        el.style.translate = `0 ${shown - PULL_INDICATOR_PX}px`;
        el.style.opacity = String(Math.min(1, shown / PULL_THRESHOLD_PX));
      });
    };

    const hide = () => {
      paint(0, SETTLE);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        if (!unmounted && !busy) setPhase('idle');
      }, SETTLE_MS);
    };

    const cancel = () => {
      if (pull?.locked && !busy) hide();
      pull = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (pull) return cancel(); // a second finger
      const touch = e.touches[0];
      const target = e.target;
      if (!touch || !(target instanceof Element)) return;
      const ok = pullMayStart({
        touches: e.touches.length,
        coarsePointer: window.matchMedia('(pointer: coarse)').matches,
        active: latest.current.isActive(),
        busy,
        scrollTop: latest.current.scrollTop(),
        zoomed: (window.visualViewport?.scale ?? 1) > 1.01,
        nearEdge: nearScreenEdge(touch.clientX),
        ownGesture: startsInsideOwnPull(target, surface),
        overlayOpen: document.body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden',
        textSelected: Boolean(window.getSelection()?.toString()),
      });
      if (ok) pull = createPull(touch.clientX, touch.clientY, e.timeStamp);
    };

    const onTouchMove = (e: TouchEvent) => {
      const current = pull;
      const touch = e.touches[0];
      if (!current || !touch) return;
      if (e.touches.length !== 1) return cancel();
      const wasLocked = current.locked;
      const step = current.move(touch.clientX, touch.clientY, e.timeStamp, latest.current.scrollTop());
      if (step.kind === 'wait') return;
      if (step.kind === 'cancel') return cancel();
      if (!wasLocked) {
        window.clearTimeout(hideTimer);
        setPhase('pulling');
      }
      if (step.armedNow && canVibrate() && getFeedbackPrefs().swipe !== 'none') navigator.vibrate(ARMED_VIBRATION_MS);
      paint(step.offset);
    };

    const onTouchEnd = (e: TouchEvent) => {
      const current = pull;
      if (!current || e.touches.length > 0) return;
      pull = null;
      if (!current.locked) return;
      suppressClickUntil = e.timeStamp + 400;
      if (!current.end()) return hide();
      busy = true;
      setPhase('refreshing');
      paint(PULL_THRESHOLD_PX, SETTLE);
      let work: Promise<void>;
      try {
        work = latest.current.onRefresh();
      } catch (error) {
        work = Promise.reject(error);
      }
      void settleRefresh(work, wait).then(() => {
        busy = false;
        if (!unmounted) hide();
      });
    };

    // A pull ending on a button must not also press it.
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
    // Rotation or the keyboard opening mid-pull.
    window.addEventListener('resize', cancel, passive);
    return () => {
      unmounted = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(hideTimer);
      surface.removeEventListener('touchstart', onTouchStart);
      surface.removeEventListener('touchmove', onTouchMove);
      surface.removeEventListener('touchend', onTouchEnd);
      surface.removeEventListener('touchcancel', cancel);
      surface.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('resize', cancel);
    };
  }, [listenRef, indicatorRef]);

  return phase;
}
