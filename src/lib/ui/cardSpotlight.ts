/**
 * Pointer spotlight on cards: a soft glow that follows the mouse across whichever `.card` is under
 * it (index.css, `.card[data-spot]`). One delegated listener for the whole app, updated at most once
 * per frame, so cards need no wiring and adding one costs nothing. Mouse and trackpad only; touch
 * has no hover. Reduced motion keeps it, as it is a static highlight rather than movement.
 */
export function installCardSpotlight(): void {
  if (typeof window === 'undefined' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  let current: HTMLElement | null = null;
  let frame = 0;
  let lastEvent: PointerEvent | null = null;

  const release = () => {
    if (!current) return;
    current.removeAttribute('data-spot');
    current = null;
  };

  const apply = () => {
    frame = 0;
    const event = lastEvent;
    if (!event) return;
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>('.card') : null;
    if (card !== current) {
      release();
      if (card) {
        card.setAttribute('data-spot', '');
        current = card;
      }
    }
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  };

  document.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      lastEvent = event;
      if (!frame) frame = requestAnimationFrame(apply);
    },
    { passive: true }
  );
  // Leaving the window (or the card being removed under a still pointer) must not leave a glow behind.
  document.documentElement.addEventListener('pointerleave', release);
  window.addEventListener('blur', release);
}
