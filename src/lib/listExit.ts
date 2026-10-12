import { prefersReducedMotion } from './motion';

/**
 * Exit motion for list items (`.enter-item`, index.css). React removes a deleted item at once, so
 * the data really is gone; this plays a farewell on a lifeless copy left in its place. The copy is
 * inert and hidden from assistive tech, slides out and collapses so the items below glide up (in a
 * grid it shrinks and fades in its cell instead), then removes itself.
 *
 * One app-wide observer, so lists need no wiring: any `.enter-item` that leaves its list on its own
 * gets the exit. Not affected:
 * - items React only moved (re-sort): they are back in the document when the observer runs;
 * - whole lists or pages unmounting: the item's ancestor is removed, not the item;
 * - items the user never touched (sync, filters): only an item clicked or focused inside leaves
 *   with motion, since a delete starts from a control within it;
 * - bulk changes: more than BULK_LIMIT items in one batch is not a delete, so they leave instantly.
 * The copy sits among React's nodes only while it animates; React never references it, it
 * blocks no clicks, and it is gone within DIALOG_WAIT_MS + EXIT_MS.
 */
const EXIT_MS = 440;
// Most deletes are confirmed in a dialog; the exit waits for the dialog to finish leaving
// (Dialog EXIT_MS) so it plays on a clear page instead of behind the fading backdrop.
const DIALOG_WAIT_MS = 180;
const BULK_LIMIT = 4;
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

function playExit(item: HTMLElement, parent: Node, next: Node | null): void {
  if (!(parent instanceof HTMLElement) || !parent.isConnected) return;
  if (next && next.parentNode !== parent) next = null;

  const ghost = item.cloneNode(true) as HTMLElement;
  ghost.classList.remove('enter-item');
  ghost.removeAttribute('data-spot');
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.style.pointerEvents = 'none';
  ghost.style.overflow = 'hidden';
  parent.insertBefore(ghost, next);
  const height = ghost.getBoundingClientRect().height;

  const inGrid = getComputedStyle(parent).display.includes('grid');
  const delay = document.querySelector('[role="dialog"]') ? DIALOG_WAIT_MS : 0;
  const style = getComputedStyle(ghost);
  const animation = inGrid
    ? ghost.animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'scale(0.94)' },
        ],
        { duration: EXIT_MS - 80, delay, easing: EASE, fill: 'forwards' }
      )
    : ghost.animate(
        [
          {
            opacity: 1,
            transform: 'none',
            height: `${height}px`,
            marginTop: style.marginTop,
            marginBottom: style.marginBottom,
            paddingTop: style.paddingTop,
            paddingBottom: style.paddingBottom,
          },
          { opacity: 0, transform: 'translateX(-2rem)', offset: 0.6 },
          {
            opacity: 0,
            transform: 'translateX(-2rem)',
            height: '0px',
            marginTop: '0px',
            marginBottom: '0px',
            paddingTop: '0px',
            paddingBottom: '0px',
          },
        ],
        { duration: EXIT_MS, delay, easing: EASE, fill: 'forwards' }
      );

  const cleanup = () => ghost.remove();
  animation.finished.then(cleanup, cleanup);
}

export function installListExit(): void {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  if (typeof Element.prototype.animate !== 'function') return;

  const touched = new WeakSet<Element>();
  const remember = (event: Event) => {
    const item = event.target instanceof Element ? event.target.closest('.enter-item') : null;
    if (item) touched.add(item);
  };
  // Only items the user acted on get the exit: a delete starts from a button inside the item (often
  // through a confirm dialog), while data arriving from sync or a filter change touches none.
  document.addEventListener('pointerdown', remember, true);
  document.addEventListener('focusin', remember, true);

  const observer = new MutationObserver((records) => {
    if (prefersReducedMotion() || document.visibilityState === 'hidden') return;

    const removed: { item: HTMLElement; parent: Node; next: Node | null }[] = [];
    for (const record of records) {
      record.removedNodes.forEach((node) => {
        if (node instanceof HTMLElement && node.classList.contains('enter-item')) {
          removed.push({ item: node, parent: record.target, next: record.nextSibling });
        }
      });
    }
    const exits = removed.filter(({ item }) => !item.isConnected && touched.has(item));
    if (exits.length === 0 || exits.length > BULK_LIMIT) return;

    for (const { item, parent, next } of exits) {
      playExit(item, parent, next);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
