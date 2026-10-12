import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from './views';
import { pathForView, viewFromLocation } from './routes';
import { runPageTransition } from './pageTransition';

/**
 * Path routing for the app's pages: `/habits`. Refresh keeps the page, links open a page
 * directly, and browser back/forward move between pages.
 *
 * The hash is not ours: Supabase's `#access_token=...` auth redirect is left alone for the auth
 * client to read. Old `#/habits` links are rewritten to `/habits` (index.html does it before the
 * app loads; the check here covers a hash typed into the address bar later).
 */

/** 'push' = the user opened a page; 'pop' = browser back/forward (restore its scroll). */
export type NavigationKind = 'push' | 'pop';

/**
 * Rewrites the address bar in place (no new history entry) when it does not name the page on
 * screen the canonical way: an alias, a trailing slash, an unknown path, an old `#/` link. The
 * query and a non-route hash are kept.
 */
function canonicalizeUrl(view: View): void {
  const { pathname, search, hash } = window.location;
  const legacyHash = hash.startsWith('#/');
  const path = pathForView(view);
  if (pathname === path && !legacyHash) return;
  window.history.replaceState(window.history.state, '', path + search + (legacyHash ? '' : hash));
}

export function useViewRoute() {
  const [route, setRoute] = useState<{ view: View; kind: NavigationKind }>(() => ({
    view: viewFromLocation(),
    kind: 'push',
  }));
  const viewRef = useRef(route.view);
  viewRef.current = route.view;

  useEffect(() => {
    // The app restores each page's scroll itself (AppShell); the browser's guess would fight it.
    window.history.scrollRestoration = 'manual';
    canonicalizeUrl(viewRef.current);

    // Back/forward (and a hash typed into the address bar, which also fires popstate).
    const onHistoryMove = () => {
      const view = viewFromLocation();
      canonicalizeUrl(view);
      if (view === viewRef.current) return;
      // Claimed now: the transition renders a frame later, and a repeat event must not re-run it.
      viewRef.current = view;
      runPageTransition(() => setRoute({ view, kind: 'pop' }));
    };
    window.addEventListener('popstate', onHistoryMove);
    return () => window.removeEventListener('popstate', onHistoryMove);
  }, []);

  const navigate = useCallback((view: View) => {
    if (view === viewRef.current) return;
    // A new path drops the query: `?tab=live` belongs to the visit that came with it.
    window.history.pushState(null, '', pathForView(view));
    viewRef.current = view;
    runPageTransition(() => setRoute({ view, kind: 'push' }));
  }, []);

  return { view: route.view, navigationKind: route.kind, navigate };
}
