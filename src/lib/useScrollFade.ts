import { useEffect, type RefObject } from 'react';

/**
 * Marks a horizontal scroller with `data-fade-start` / `data-fade-end` while content is hidden
 * past that edge, so `.scroll-fade` (index.css) can fade the edge and hint that more is there.
 * Writes attributes directly, so scrolling never re-renders the component.
 */
export function useScrollFade(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.toggleAttribute('data-fade-start', el.scrollLeft > 1);
      el.toggleAttribute('data-fade-end', el.scrollLeft < max - 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
      el.removeAttribute('data-fade-start');
      el.removeAttribute('data-fade-end');
    };
  }, [ref, enabled]);
}
