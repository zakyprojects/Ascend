import { createContext, RefObject, useLayoutEffect, useMemo, useRef } from 'react';
import { hasUnsavedChanges } from '@/lib/unsavedChanges';
import { slideIn, useTabSwipe, type SwipeDirection, type SwipeEdge } from '@/lib/useTabSwipe';

/** A page's own tab strip, as the page-level swipe sees it (TabPanel registers it). */
export interface PageTabs {
  canMove: (direction: SwipeDirection) => boolean;
  move: (direction: SwipeDirection) => void;
}

export interface PageSwipe {
  /** For a page's TabPanel: past its first/last tab, the swipe moves to the neighbouring page. */
  edge: SwipeEdge;
  /** For a page's TabPanel on mount: open on the first or last tab when the page was entered by a swipe. */
  takeEntry: () => 'first' | 'last' | null;
  /** The page's tab strip, so a swipe outside its panel (the page header) still steps through it. */
  register: (tabs: PageTabs) => () => void;
}

export const PageSwipeContext = createContext<PageSwipe | null>(null);

interface PageSwipeOptions<V extends string> {
  /** Every page in swipe order (the zones' page strips, end to end). */
  chain: readonly V[];
  current: V;
  /** id of the page strip's container: no page swipe while it is hidden or absent. */
  stripId: string;
  /** The same navigation a tap on the page strip uses (unsaved-changes guard, history, scroll reset). */
  go: (view: V) => void;
}

/**
 * One continuous swipe on phones: through the page's tabs, then on to the next page of the zone,
 * then into the next zone's first page; it bounces only before the first page and after the last.
 * A page entered forward opens on its first tab, entered backward on its last. Pages outside the
 * chain (Dashboard, Settings, help) and screens where the page strip is hidden get no page swipe.
 */
export function usePageSwipe<V extends string>(
  areaRef: RefObject<HTMLElement>,
  { chain, current, stripId, go }: PageSwipeOptions<V>
): PageSwipe {
  const latest = useRef({ chain, current, stripId, go });
  latest.current = { chain, current, stripId, go };
  const tabs = useRef<PageTabs | null>(null);
  // Set by a page swipe for the page it heads to: which tab to open on, and the slide to play.
  const entry = useRef<{ view: V; end: 'first' | 'last' } | null>(null);
  const slide = useRef<{ view: V; step: 1 | -1 } | null>(null);

  const swipe = useMemo(() => {
    const neighbour = (direction: SwipeDirection) => {
      const { chain: pages, current: view, stripId: strip } = latest.current;
      const index = pages.indexOf(view);
      if (index === -1 || !document.getElementById(strip)?.getClientRects().length) return undefined;
      return pages[index + (direction === 'next' ? 1 : -1)];
    };
    const goPage = (direction: SwipeDirection) => {
      const target = neighbour(direction);
      if (target === undefined) return;
      // With unsaved typing the move waits on "Discard changes?"; if it goes ahead, the page opens
      // as on a tap (a kept edit must leave nothing behind for a later visit).
      const clean = !hasUnsavedChanges();
      entry.current = clean ? { view: target, end: direction === 'next' ? 'first' : 'last' } : null;
      slide.current = clean ? { view: target, step: direction === 'next' ? 1 : -1 } : null;
      latest.current.go(target);
    };
    const edge: SwipeEdge = { has: (direction) => neighbour(direction) !== undefined, go: goPage };
    // Outside the tab panel (or on a page without tabs): the page's tabs first, then the pages.
    const area: SwipeEdge = {
      has: (direction) => !!tabs.current?.canMove(direction) || edge.has(direction),
      go: (direction) => (tabs.current?.canMove(direction) ? tabs.current.move(direction) : goPage(direction)),
    };
    const context: PageSwipe = {
      edge,
      takeEntry: () => {
        const pending = entry.current;
        if (!pending || pending.view !== latest.current.current) return null;
        entry.current = null;
        return pending.end;
      },
      register: (pageTabs) => {
        tabs.current = pageTabs;
        return () => {
          if (tabs.current === pageTabs) tabs.current = null;
        };
      },
    };
    return { area, context };
  }, []);

  useTabSwipe(areaRef, { ids: [], value: current, onChange: () => {}, stripId, edge: swipe.area, animateTaps: false });

  // Runs after the new page's own layout effects (its TabPanel has taken the entry by then).
  useLayoutEffect(() => {
    const pending = slide.current;
    slide.current = null;
    if (pending?.view === current && areaRef.current) slideIn(areaRef.current, pending.step);
    // A page swipe superseded by another navigation must not shape a later visit.
    if (entry.current?.view !== current) entry.current = null;
  }, [current, areaRef]);

  return swipe.context;
}
