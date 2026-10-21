/**
 * Scroll rise on phones and tablets (below lg, where the window scrolls).
 *
 * Desktop keeps the scroll-driven CSS animation (index.css "Scroll rise"). Below lg that timeline
 * binds to the window, and Android Chrome can stop updating it during a fast fling, leaving cards
 * and rows at opacity 0 until the next touch. Here the same rise plays once, on a timer, the
 * moment an element enters the screen, and the element never hides again. A fast fling skips the
 * motion and shows content at once, so it is never behind the finger.
 *
 * Marketing pages scroll the window at every width, and desktop Chrome leaves that timeline stale
 * while the scrollbar is dragged, so they pass `everyWidth` and get this version on desktop too.
 *
 * States (data-rise): 'wait' = below the screen, hidden; 'in' = rising; no attribute = at rest.
 */

const SELECTOR = '[data-page-area] :is(.card, .scroll-rise):not([class*="animate-"])';
const RISE_ITEM = ':is(.card, .scroll-rise):not([class*="animate-"])';
const PHONE_QUERY = '(max-width: 1023.98px) and (prefers-reduced-motion: no-preference)';
const EVERY_WIDTH_QUERY = '(prefers-reduced-motion: no-preference)';
const RISE_MS = 450;
/** Scroll speed (px per ms) above which content appears without rising: a fling, not a read. */
const FAST_SCROLL = 2.5;
/** A speed sample older than this means the scroll has stopped. */
const SAMPLE_TTL_MS = 120;

let speed = 0;
let lastY = 0;
let lastTime = 0;

function trackScrollSpeed() {
  const now = performance.now();
  const y = window.scrollY;
  const elapsed = now - lastTime;
  if (elapsed > 0) speed = Math.abs(y - lastY) / elapsed;
  lastY = y;
  lastTime = now;
}

function isScrollingFast(): boolean {
  return performance.now() - lastTime < SAMPLE_TTL_MS && speed > FAST_SCROLL;
}

function settle(el: HTMLElement) {
  el.removeAttribute('data-rise');
}

function show(el: HTMLElement) {
  if (isScrollingFast()) {
    settle(el);
    return;
  }
  el.setAttribute('data-rise', 'in');
  window.setTimeout(() => {
    if (el.getAttribute('data-rise') === 'in') settle(el);
  }, RISE_MS);
}

export function installScrollRise({ everyWidth = false }: { everyWidth?: boolean } = {}): void {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
  // Same browsers as the CSS version, so Reveal's split (Motion.tsx SCROLL_RISE) still holds.
  if (!CSS.supports('animation-timeline: view()')) return;
  const active = window.matchMedia(everyWidth ? EVERY_WIDTH_QUERY : PHONE_QUERY);

  const waiting = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      waiting.unobserve(entry.target);
      show(entry.target as HTMLElement);
    }
  });

  // Elements already on screen when they mount are left alone (the page's open stagger covers
  // them); only those below the screen wait to rise. On marketing pages (everyWidth) a card inside
  // a rising block rises with it, so a block never shows up with its inner cards still missing.
  const register = (el: HTMLElement) => {
    if (el.hasAttribute('data-rise')) return;
    if (everyWidth && el.parentElement?.closest(RISE_ITEM)) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.setAttribute('data-rise', 'wait');
    waiting.observe(el);
  };

  const scan = (root: ParentNode) => {
    if (!active.matches) return;
    if (root instanceof HTMLElement && root.matches(SELECTOR)) register(root);
    root.querySelectorAll<HTMLElement>(SELECTOR).forEach(register);
  };

  const forget = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.hasAttribute('data-rise')) waiting.unobserve(node);
    node.querySelectorAll('[data-rise]').forEach((el) => waiting.unobserve(el));
  };

  new MutationObserver((records) => {
    for (const record of records) {
      record.removedNodes.forEach(forget);
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) scan(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Leaving the phone layout (rotation, resize) or turning on reduced motion must never strand hidden content.
  active.addEventListener('change', () => {
    document.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) => {
      waiting.unobserve(el);
      settle(el);
    });
  });

  window.addEventListener('scroll', trackScrollSpeed, { passive: true });
  scan(document);
}
