import { useEffect, useRef } from 'react';

interface NavShortcutHandlers {
  /** 1–9: the n-th page of the zone the desktop panel shows (0-based index). */
  onPageIndex: (index: number) => void;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
}

/**
 * Desktop keyboard navigation: 1–9 open the pages of the shown zone. "G then a letter" belongs to
 * the command palette alone (one owner, so two handlers never fight over the same keystroke).
 * Silent while typing, with a modifier held, or while a modal is open.
 */
export function useNavShortcuts(handlers: NavShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let goPressedAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || isTyping(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (!window.matchMedia('(min-width: 1024px)').matches) return;
      const key = event.key.toLowerCase();
      // A digit straight after "g" is the second key of a palette sequence, not a page jump.
      if (key === 'g') {
        goPressedAt = event.timeStamp;
        return;
      }
      const afterGo = goPressedAt !== 0 && event.timeStamp - goPressedAt < 1200;
      goPressedAt = 0;
      if (afterGo) return;
      if (/^[1-9]$/.test(key)) {
        event.preventDefault();
        handlersRef.current.onPageIndex(Number(key) - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
