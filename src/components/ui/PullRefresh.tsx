import { RefObject, useLayoutEffect, useRef } from 'react';
import { AscendLoaderMark } from './AscendLoadingIndicator';
import { PULL_INDICATOR_PX, usePullRefresh } from '@/lib/ui/usePullRefresh';

interface PullRefreshProps {
  /** Where pulls are read (AppShell's <main>). */
  listenRef: RefObject<HTMLElement>;
  isActive: () => boolean;
  scrollTop: () => number;
  onRefresh: () => Promise<void>;
}

/**
 * Pull-to-refresh on touch screens (lib/ui/usePullRefresh): the small Streak loader in a plain
 * circle, just under the header. Its own component, so a pull re-renders only this.
 */
export function PullRefresh({ listenRef, isActive, scrollTop, onRefresh }: PullRefreshProps) {
  const indicatorRef = useRef<HTMLDivElement>(null);
  const phase = usePullRefresh(listenRef, indicatorRef, { isActive, scrollTop, onRefresh });

  // Sits under the phone header; the wide layout has none, so it starts at the safe area there.
  useLayoutEffect(() => {
    const el = indicatorRef.current;
    if (!el || phase !== 'pulling') return;
    const header = document.querySelector<HTMLElement>('.app-header');
    const bottom = header && header.getClientRects().length > 0 ? header.getBoundingClientRect().bottom : 0;
    el.style.top = `max(${Math.max(0, bottom) + 8}px, calc(env(safe-area-inset-top) + 8px))`;
  }, [phase]);

  return (
    <div
      ref={indicatorRef}
      aria-hidden={phase === 'idle' ? true : undefined}
      role={phase === 'refreshing' ? 'status' : undefined}
      aria-label={phase === 'refreshing' ? 'Refreshing' : undefined}
      className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center opacity-0"
      style={{ translate: `0 -${PULL_INDICATOR_PX}px` }}
    >
      {phase !== 'idle' && (
        <span className="flex size-8 items-center justify-center rounded-full border border-overlay-default bg-bg-800 shadow-sm">
          <AscendLoaderMark variant="small" className="size-4" />
        </span>
      )}
    </div>
  );
}
