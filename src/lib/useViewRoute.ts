import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_VIEW, View } from './views';
import {
  AuthRoute,
  authRouteFromPath,
  pathForAuthRoute,
  pathForView,
  viewFromLegacyHash,
  viewFromPath,
} from './routes';
import { runPageTransition } from './pageTransition';
import { confirmLeave, hasUnsavedChanges } from './unsavedChanges';

/**
 * Path routing for the app's pages: `/habits`. Refresh keeps the page, links open a page
 * directly, and browser back/forward move between pages.
 *
 * The hash is not ours: Supabase's `#access_token=...` auth redirect is left alone for the auth
 * client to read. Old `#/habits` links are rewritten to `/habits` (index.html does it before the
 * app loads; the check here covers a hash typed into the address bar later).
 *
 * `/login` and `/signup` are routes too (`auth`), shown outside the app shell; App decides who
 * may see them and redirects with `goToPath`.
 */

/** 'push' = the user opened a page; 'pop' = browser back/forward (restore its scroll). */
export type NavigationKind = 'push' | 'pop';

/** Longest a page change waits for the page's code before showing its loading skeleton instead.
 *  Kept short: nothing on screen changes while it waits, so a long wait reads as a dead tap. */
const PREPARE_TIMEOUT_MS = 300;
/** A page change still waiting after this long is reported as pending (nav highlight + progress
 *  bar). A ready page shows before it, so its view transition still glides the nav pill. */
const PENDING_FEEDBACK_MS = 100;

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

interface RouteTarget {
  view: View;
  /** A sign-in page, or null for an app page. */
  auth: AuthRoute | null;
}

/** What the address bar names right now: an old `#/` link wins, then a sign-in page, then a page. */
function routeFromLocation(): RouteTarget {
  const { pathname, hash } = window.location;
  const legacy = viewFromLegacyHash(hash);
  if (legacy) return { view: legacy, auth: null };
  const auth = authRouteFromPath(pathname);
  if (auth) return { view: DEFAULT_VIEW, auth };
  return { view: viewFromPath(pathname) ?? DEFAULT_VIEW, auth: null };
}

/** The address names no page and no sign-in page (a mistyped or removed link): the dashboard shows. */
function namesNoScreen(): boolean {
  const { pathname, hash } = window.location;
  return !viewFromLegacyHash(hash) && !authRouteFromPath(pathname) && viewFromPath(pathname) === null;
}

/**
 * Rewrites the address bar in place (no new history entry) when it does not name the screen on
 * show the canonical way: an alias, a trailing slash, an unknown path, an old `#/` link. The
 * query and a non-route hash are kept.
 */
function canonicalizeUrl(target: RouteTarget): void {
  const { pathname, search, hash } = window.location;
  const legacyHash = hash.startsWith('#/');
  const path = target.auth ? pathForAuthRoute(target.auth) : pathForView(target.view);
  if (pathname === path && !legacyHash) return;
  window.history.replaceState(window.history.state, '', path + search + (legacyHash ? '' : hash));
}

/**
 * The address of the page on show, query included. Pages rewrite their own query in place
 * (Settings' `?section=`, PFC's `?tab=`) with replaceState, which fires no event, so both history
 * writers are wrapped once to keep this current; back/forward has already moved the address by
 * the time popstate runs, so this is the only record of where the user was.
 */
let lastAddress = typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search;
let historyTracked = false;
function trackHistoryWrites(): void {
  if (historyTracked || typeof window === 'undefined') return;
  historyTracked = true;
  lastAddress = window.location.pathname + window.location.search;
  const { history } = window;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<History['pushState']>) => {
    push(...args);
    lastAddress = window.location.pathname + window.location.search;
  };
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    replace(...args);
    lastAddress = window.location.pathname + window.location.search;
  };
}

/**
 * `prepare(view)` loads a page's code; a page change waits for it before the view transition
 * starts, so the transition snapshots the finished page rather than a loading fallback.
 */
export function useViewRoute(prepare?: (view: View) => Promise<unknown>) {
  const [route, setRoute] = useState<RouteTarget & { kind: NavigationKind; search: string }>(() => ({
    ...routeFromLocation(),
    kind: 'push',
    search: window.location.search,
  }));
  // Read before the address is rewritten to `/`, for a one-time "That page doesn't exist" (App).
  const [startedOnUnknownPath] = useState(namesNoScreen);
  const viewRef = useRef(route.view);
  viewRef.current = route.view;
  const authRef = useRef(route.auth);
  authRef.current = route.auth;
  // The page most recently asked for (may still be loading). A newer request supersedes it.
  const targetRef = useRef(route.view);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  // The page asked for while its code is still loading, once that takes noticeably long.
  const [pendingView, setPendingView] = useState<View | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPending = useCallback(() => {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = null;
    setPendingView(null);
  }, []);

  /** Shows what the address bar names now, at once (sign-in pages and moves to or from them). */
  const syncToLocation = useCallback((kind: NavigationKind) => {
    const target = routeFromLocation();
    canonicalizeUrl(target);
    targetRef.current = target.view;
    viewRef.current = target.view;
    authRef.current = target.auth;
    clearPending();
    setRoute({ ...target, kind, search: window.location.search });
  }, [clearPending]);

  const show = useCallback((view: View, kind: NavigationKind, beforeShow?: () => void) => {
    // Claimed now: the page shows a moment later, and a repeat request must not run it twice.
    if (view === targetRef.current) return;
    targetRef.current = view;
    clearPending();
    if (view !== viewRef.current) {
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        if (targetRef.current === view) setPendingView(view);
      }, PENDING_FEEDBACK_MS);
    }
    whenPrepared(prepareRef.current, view).then(() => {
      if (targetRef.current !== view || view === viewRef.current) return; // superseded while loading
      beforeShow?.();
      viewRef.current = view;
      runPageTransition(() => {
        clearPending();
        setRoute({ view, auth: null, kind, search: window.location.search });
      });
    });
  }, [clearPending]);

  // A layout effect, so a redirect App makes in its own layout effect (declared later) sees the
  // canonical address and is not undone by this.
  useLayoutEffect(() => {
    canonicalizeUrl({ view: viewRef.current, auth: authRef.current });
  }, []);

  useEffect(
    () => () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    },
    []
  );

  useEffect(() => {
    // The app restores each page's scroll itself (AppShell); the browser's guess would fight it.
    window.history.scrollRestoration = 'manual';

    // Back/forward (and a hash typed into the address bar, which also fires popstate).
    trackHistoryWrites();
    const onHistoryMove = () => {
      const target = routeFromLocation();
      const previousAddress = lastAddress;
      lastAddress = window.location.pathname + window.location.search;
      if (target.auth || authRef.current) {
        syncToLocation('pop'); // to or from a sign-in page: no page transition, no chunk wait
        return;
      }
      if (hasUnsavedChanges() && target.view !== viewRef.current) {
        // Back/forward can't be cancelled and the address has already moved: put the current
        // page's address back first (query included: `?section=account`), and go only if the user
        // discards the unsaved typing, to the target's full address.
        const targetAddress = window.location.pathname + window.location.search;
        window.history.pushState(null, '', previousAddress);
        confirmLeave(() => {
          window.history.replaceState(null, '', targetAddress);
          show(target.view, 'pop');
        });
        return;
      }
      canonicalizeUrl(target);
      show(target.view, 'pop');
    };
    window.addEventListener('popstate', onHistoryMove);
    return () => window.removeEventListener('popstate', onHistoryMove);
  }, [show, syncToLocation]);

  const navigate = useCallback(
    (view: View, search = '') => {
      // A new path drops the query: `?tab=live` belongs to the visit that came with it, unless the
      // caller names one (`?section=notifications`). The URL changes when the page does, so a
      // superseded click (or "Keep editing") never leaves a history entry or a stale request.
      if (view === targetRef.current) return;
      confirmLeave(() => show(view, 'push', () => window.history.pushState(null, '', pathForView(view) + search)));
    },
    [show]
  );

  /**
   * Goes to an address on this site (a sign-in page, or `next` after signing in, query kept).
   * `replace` swaps the current history entry instead of adding one (redirects).
   */
  const goToPath = useCallback(
    (path: string, options?: { replace?: boolean }) => {
      if (options?.replace) window.history.replaceState(null, '', path);
      else window.history.pushState(null, '', path);
      syncToLocation('push');
    },
    [syncToLocation]
  );

  return {
    view: route.view,
    /** The page a slow page change is heading to (its code still loading), else null. */
    pendingView,
    auth: route.auth,
    search: route.search,
    navigationKind: route.kind,
    /** The app was opened at an address that names no page (it shows the dashboard instead). */
    startedOnUnknownPath,
    navigate,
    goToPath,
  };
}
