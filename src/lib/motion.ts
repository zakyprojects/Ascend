import { createContext, RefObject, useContext, useEffect, useRef, useState } from 'react';

/**
 * Motion core: one place that decides whether intro motion (reveal, count-up, bar grow) plays.
 *
 * Intro motion plays every time a view is opened (ViewEntrance provides the flag; Zakria,
 * 2026-10-12: replaying is smoother than a revisit that snaps in). Changes the user causes (a
 * habit tick raising "2/5" to "3/5") always tween. Reduced motion turns all of it off.
 */

/** True inside a view (ViewEntrance). Default false: anything rendered outside a view (modals
 *  mounted elsewhere, the gallery) shows final values. */
export const IntroMotionContext = createContext(false);

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Whether intro motion should play for a component mounting now. Read once per mount. */
export function useIntroMotion(): boolean {
  const viewIntro = useContext(IntroMotionContext);
  const reduced = useReducedMotion();
  const [intro] = useState(viewIntro && !reduced);
  return intro && !reduced;
}

// One IntersectionObserver for the whole app; each element registers a one-shot callback.
const seenCallbacks = new Map<Element, () => void>();
let sharedObserver: IntersectionObserver | null = null;

function observeOnce(el: Element, onSeen: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onSeen();
    return () => {};
  }
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const callback = seenCallbacks.get(entry.target);
          sharedObserver?.unobserve(entry.target);
          seenCallbacks.delete(entry.target);
          callback?.();
        }
      },
      // Counts as seen once it is a little way into the viewport, not at the very edge.
      { rootMargin: '0px 0px -6% 0px' }
    );
  }
  seenCallbacks.set(el, onSeen);
  sharedObserver.observe(el);
  return () => {
    sharedObserver?.unobserve(el);
    seenCallbacks.delete(el);
  };
}

/** Becomes true the first time the element scrolls into view, and stays true. */
export function useSeen(ref: RefObject<Element>, enabled = true): boolean {
  const [seen, setSeen] = useState(!enabled);
  useEffect(() => {
    if (seen || !ref.current) return;
    return observeOnce(ref.current, () => setSeen(true));
  }, [ref, seen]);
  return seen;
}

const COUNT_DURATION_MS = 700;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animated value for `target`. With `intro` it starts at 0 and counts up once `active` turns
 * true (the element was seen); later changes tween from the value on screen. Without intro the
 * first render is already final. Hidden tabs and reduced motion jump straight to the target.
 */
export function useCountUp(target: number, { intro, active }: { intro: boolean; active: boolean }): number {
  const [value, setValue] = useState(intro ? 0 : target);
  const valueRef = useRef(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!active) return;
    const from = valueRef.current;
    if (from === target) return;

    const commit = (v: number) => {
      valueRef.current = v;
      setValue(v);
    };
    if (reduced || document.hidden || !Number.isFinite(target)) {
      commit(target);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_DURATION_MS);
      commit(progress === 1 ? target : from + (target - from) * easeOutCubic(progress));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // An interrupted tween leaves valueRef where it stopped, so the next one continues from there.
    return () => cancelAnimationFrame(frame);
  }, [target, active, reduced]);

  return value;
}

/** Marks <html data-window-inactive> while another window has focus (index.css: accents go grey). */
export function installWindowFocusFlag(): void {
  if (typeof window === 'undefined') return;
  const set = (inactive: boolean) => document.documentElement.toggleAttribute('data-window-inactive', inactive);
  window.addEventListener('blur', () => set(true));
  window.addEventListener('focus', () => set(false));
}

/** Marks <html data-page-hidden> while the tab is hidden so CSS animations pause (index.css). */
export function installPageVisibilityFlag(): void {
  if (typeof document === 'undefined') return;
  const sync = () => document.documentElement.toggleAttribute('data-page-hidden', document.hidden);
  document.addEventListener('visibilitychange', sync);
  sync();
}
