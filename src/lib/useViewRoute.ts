import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_VIEW, isView, View } from './views';

/**
 * Hash routing for the app's pages: `#/habits`. Refresh keeps the page, links open a page
 * directly, and browser back/forward move between pages.
 *
 * Only hashes that start with `#/` are routes. Anything else (Supabase's `#access_token=...`
 * auth redirect) is left alone for the auth client to read, and the app shows the default page.
 */

/** 'push' = the user opened a page; 'pop' = browser back/forward (restore its scroll). */
export type NavigationKind = 'push' | 'pop';

// Old view ids that still resolve, so links made before a rename keep working.
const VIEW_ALIASES: Record<string, View> = { books: 'reading' };

function viewFromHash(hash: string): View | null {
  if (!hash.startsWith('#/')) return null;
  const id = decodeURIComponent(hash.slice(2)).replace(/\/+$/, '');
  if (isView(id)) return id;
  return VIEW_ALIASES[id] ?? null;
}

function hashFor(view: View): string {
  return `#/${view}`;
}

export function useViewRoute() {
  const [route, setRoute] = useState<{ view: View; kind: NavigationKind }>(() => ({
    view: viewFromHash(window.location.hash) ?? DEFAULT_VIEW,
    kind: 'push',
  }));
  const viewRef = useRef(route.view);
  viewRef.current = route.view;

  useEffect(() => {
    // The app restores each page's scroll itself (AppShell); the browser's guess would fight it.
    window.history.scrollRestoration = 'manual';

    // A route hash that is unknown or an alias is rewritten in place, so the URL always names
    // the page on screen. Non-route hashes are not ours to touch.
    const { hash } = window.location;
    if (hash.startsWith('#/') && hash !== hashFor(viewRef.current)) {
      window.history.replaceState(window.history.state, '', hashFor(viewRef.current));
    }

    // popstate covers back/forward; hashchange covers a hash typed or pasted into the address bar.
    const onHistoryMove = () => {
      const view = viewFromHash(window.location.hash);
      if (view && view !== viewRef.current) setRoute({ view, kind: 'pop' });
    };
    window.addEventListener('popstate', onHistoryMove);
    window.addEventListener('hashchange', onHistoryMove);
    return () => {
      window.removeEventListener('popstate', onHistoryMove);
      window.removeEventListener('hashchange', onHistoryMove);
    };
  }, []);

  const navigate = useCallback((view: View) => {
    if (view === viewRef.current) return;
    window.history.pushState(null, '', hashFor(view));
    setRoute({ view, kind: 'push' });
  }, []);

  return { view: route.view, navigationKind: route.kind, navigate };
}
