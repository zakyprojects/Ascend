import { useEffect, useRef } from 'react';
import type { NavGroup } from './navConfig';

type ZoneId = NavGroup['id'];

/** G then this key opens a zone (Linear/GitHub style two-key "go to"). */
export const ZONE_KEYS: Record<ZoneId, string> = { track: 't', mind: 'm', plan: 'p', play: 'l' };
const GO_WINDOW_MS = 1200;

interface NavShortcutHandlers {
  onDashboard: () => void;
  onSettings: () => void;
  onZone: (zone: ZoneId) => void;
  /** 1–9: the n-th page of the zone the desktop panel shows (0-based index). */
  onPageIndex: (index: number) => void;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
}

/**
 * Desktop keyboard navigation: G+D Dashboard, G+T/M/P/L zones, G+S Settings, 1–9 pages of the
 * shown zone. Silent while typing, with a modifier held, or while a modal is open.
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
      const h = handlersRef.current;

      if (goPressedAt && event.timeStamp - goPressedAt < GO_WINDOW_MS) {
        goPressedAt = 0;
        const zone = (Object.keys(ZONE_KEYS) as ZoneId[]).find((id) => ZONE_KEYS[id] === key);
        if (key === 'd') h.onDashboard();
        else if (key === 's') h.onSettings();
        else if (zone) h.onZone(zone);
        else return;
        event.preventDefault();
        return;
      }
      if (key === 'g') {
        goPressedAt = event.timeStamp;
        return;
      }
      if (/^[1-9]$/.test(key)) {
        event.preventDefault();
        h.onPageIndex(Number(key) - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
