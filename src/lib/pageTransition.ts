import { flushSync } from 'react-dom';
import { prefersReducedMotion } from './motion';

/** Class on <html> while a page change animates; CSS names the page area and the nav pill only
 *  then, so the theme switch (also a view transition) keeps animating the whole screen. */
const PAGE_TRANSITION_CLASS = 'vt-page';

/** From lg up the page area is its own scroll box and transitions alone. Below it the window
 *  scrolls, so a transition would freeze and crossfade the whole screen: phones change pages at once. */
const PAGE_TRANSITION_QUERY = '(min-width: 1024px)';

// Page transitions in flight: a rapid second click skips the first, whose cleanup must not strip
// the class from the one still running.
let running = 0;

/**
 * Runs a page change as a view transition: the outgoing page fades out while the incoming one
 * fades in, and the sidebar's active pill glides to its new item (index.css, "Page transitions").
 * The browser animates snapshots, so an interrupted or skipped transition can never leave a page
 * stuck half-mounted. Without the API, with reduced motion, or on a phone-width screen, the change
 * is instant (the new page still plays its own entrance, ViewEntrance).
 */
export function runPageTransition(update: () => void): void {
  if (
    typeof document.startViewTransition !== 'function' ||
    prefersReducedMotion() ||
    !window.matchMedia(PAGE_TRANSITION_QUERY).matches
  ) {
    update();
    return;
  }

  const root = document.documentElement;
  running += 1;
  root.classList.add(PAGE_TRANSITION_CLASS);
  // flushSync renders the new page (and runs its layout effects, such as scroll restore) inside
  // the callback, so the browser snapshots the finished page.
  const transition = document.startViewTransition(() => {
    flushSync(update);
  });
  transition.finished.finally(() => {
    running -= 1;
    if (running === 0) root.classList.remove(PAGE_TRANSITION_CLASS);
  });
}
