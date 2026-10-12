import { flushSync } from 'react-dom';
import { prefersReducedMotion } from './motion';

const REVEAL_DURATION_MS = 450;

/**
 * Switches the theme with a circle that grows from `origin` (the button pressed) to cover the
 * screen. Browsers without the View Transitions API, and reduced-motion users, switch instantly.
 * Every theme toggle in the app goes through here so they all look the same.
 */
export function toggleThemeWithReveal(origin: HTMLElement, toggle: () => void): void {
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    toggle();
    return;
  }

  const { left, top, width, height } = origin.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  // flushSync puts the re-rendered UI (the toggle's own icon/label) inside the new snapshot.
  const transition = document.startViewTransition(() => {
    flushSync(toggle);
  });
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_DURATION_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    })
    .catch(() => {
      // Skipped by a rapid second click: the theme has already switched.
    });
}
