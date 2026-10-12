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

/** Longest a page change waits for the page's code before showing its loading skeleton instead. */
const PREPARE_TIMEOUT_MS = 1500;

/** Waits for `prepare(view)` (the page's code), at most PREPARE_TIMEOUT_MS; never rejects. */
function whenPrepared(prepare: ((view: View) => Promise<unknown>) | undefined, view: View): Promise<void> {
  if (!prepare) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, PREPARE_TIMEOUT_MS);
    prepare(view)
      .catch(() => undefined)
      .then(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

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

/**
 * `prepare(view)` loads a page's code; a page change waits for it before the view transition
 * starts, so the transition snapshots the finished page rather than a loading fallback.
 */
export function useViewRoute(prepare?: (view: View) => Promise<unknown>) {
  const [route, setRoute] = useState<{ view: View; kind: NavigationKind }>(() => ({
    view: viewFromLocation(),
    kind: 'push',
  }));
  const viewRef = useRef(route.view);
  viewRef.current = route.view;
  // The page most recently asked for (may still be loading). A newer request supersedes it.
  const targetRef = useRef(route.view);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;

  const show = useCallback((view: View, kind: NavigationKind, beforeShow?: () => void) => {
    // Claimed now: the page shows a moment later, and a repeat request must not run it twice.
    if (view === targetRef.current) return;
    targetRef.current = view;
    whenPrepared(prepareRef.current, view).then(() => {
      if (targetRef.current !== view || view === viewRef.current) return; // superseded while loading
      beforeShow?.();
      viewRef.current = view;
      runPageTransition(() => setRoute({ view, kind }));
    });
  }, []);

  useEffect(() => {
    // The app restores each page's scroll itself (AppShell); the browser's guess would fight it.
    window.history.scrollRestoration = 'manual';
    canonicalizeUrl(viewRef.current);

    // Back/forward (and a hash typed into the address bar, which also fires popstate).
    const onHistoryMove = () => {
      const view = viewFromLocation();
      canonicalizeUrl(view);
      show(view, 'pop');
    };
    window.addEventListener('popstate', onHistoryMove);
    return () => window.removeEventListener('popstate', onHistoryMove);
  }, [show]);

  const navigate = useCallback(
    (view: View) => {
      // A new path drops the query: `?tab=live` belongs to the visit that came with it. The URL
      // changes when the page does, so a superseded click never leaves a history entry.
      show(view, 'push', () => window.history.pushState(null, '', pathForView(view)));
    },
    [show]
  );

  return { view: route.view, navigationKind: route.kind, navigate };
}
