/**
 * Press glow on touch screens (Zakria 2026-10-19): the tapped button, link or interactive card
 * lights up softly from the finger's point and fades inside its own shape (index.css,
 * `[data-press]`). The touch counterpart of the mouse spotlight in cardSpotlight.ts: one delegated
 * listener, no wiring per component. Nothing floats outside the element; a touch that turns into a
 * scroll or swipe shows nothing. Navigation and tab bars keep their own active state, and anything
 * marked `data-no-press` opts out. Off under reduced motion.
 */
const PRESSABLE = 'button, a[href], [role="button"], .card-hover';
const SKIP = 'nav, [role="tablist"], [data-no-press]';
/** Finger travel that makes a touch a scroll or swipe, not a tap. */
const MOVE_TOLERANCE_PX = 10;
/** Wait before lighting, so a touch that starts a scroll never flashes. */
const START_DELAY_MS = 60;
/** Matches the press-glow animation in index.css. */
const PRESS_MS = 320;

export function installPressGlow(): void {
  if (typeof window === 'undefined') return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clearTimers = new WeakMap<HTMLElement, number>();

  let pending: { el: HTMLElement; x: number; y: number } | null = null;
  let startTimer = 0;

  const cancel = () => {
    window.clearTimeout(startTimer);
    pending = null;
  };

  const start = () => {
    window.clearTimeout(startTimer);
    const press = pending;
    pending = null;
    if (!press || !press.el.isConnected) return;
    const { el, x, y } = press;
    // An element with its own background image would lose it while the glow shows.
    if (!el.hasAttribute('data-press') && getComputedStyle(el).backgroundImage !== 'none') return;
    const rect = el.getBoundingClientRect();
    const px = x - rect.left;
    const py = y - rect.top;
    const reach = Math.hypot(Math.max(px, rect.width - px), Math.max(py, rect.height - py));
    el.style.setProperty('--press-x', `${px}px`);
    el.style.setProperty('--press-y', `${py}px`);
    el.style.setProperty('--press-r', `${reach}px`);
    // Restart the animation on a quick second tap.
    el.removeAttribute('data-press');
    void el.offsetWidth;
    el.setAttribute('data-press', '');
    window.clearTimeout(clearTimers.get(el));
    clearTimers.set(
      el,
      window.setTimeout(() => el.removeAttribute('data-press'), PRESS_MS)
    );
  };

  document.addEventListener(
    'pointerdown',
    (event) => {
      cancel();
      if (event.pointerType !== 'touch' || !event.isPrimary || reducedMotion.matches) return;
      const el = event.target instanceof Element ? event.target.closest<HTMLElement>(PRESSABLE) : null;
      if (!el || el.closest(SKIP) || el.matches(':disabled, [aria-disabled="true"]')) return;
      pending = { el, x: event.clientX, y: event.clientY };
      startTimer = window.setTimeout(start, START_DELAY_MS);
    },
    { capture: true, passive: true }
  );
  document.addEventListener(
    'pointermove',
    (event) => {
      if (pending && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > MOVE_TOLERANCE_PX) cancel();
    },
    { capture: true, passive: true }
  );
  // A tap shorter than the start delay still lights; a scroll the browser took over does not.
  document.addEventListener('pointerup', () => pending && start(), { capture: true, passive: true });
  document.addEventListener('pointercancel', cancel, { capture: true, passive: true });
}
